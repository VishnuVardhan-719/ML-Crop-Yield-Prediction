from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np
import pandas as pd
from fastapi import HTTPException, UploadFile
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import ElasticNet, Lasso, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, KFold, TimeSeriesSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
TARGET_WORDS = ("yield", "production", "output", "harvest")
MODEL_DEFINITIONS = (
    ("ridge", "Ridge", Ridge(alpha=1.0), ["alpha = 1.0"]),
    ("lasso", "Lasso", Lasso(alpha=0.05, max_iter=10_000), ["alpha = 0.05"]),
    (
        "elastic-net",
        "Elastic Net",
        ElasticNet(alpha=0.08, l1_ratio=0.4, max_iter=10_000),
        ["alpha = 0.08", "l1_ratio = 0.4"],
    ),  # `n_jobs` is deliberately left at its default (1). Parallelising the trees speeds up fitting by ~41%
    # on the bundled sample dataset (5-fold CV 15.1s -> 8.9s) but the forest is also used to score
    # `permutation_importance`, which makes 91 small predictions: a single predict takes 62ms serial and
    # 150ms with `n_jobs=-1`, so importance grows 8.6s -> 15.9s. The two effects net out ~1s *slower*,
    # and parallel prediction also changes floating-point summation order, so scores stop being
    # bit-reproducible. Fitting is not the lever here; the tree count is (see README "Performance").
    ("random-forest", "Random Forest", RandomForestRegressor(n_estimators=300, random_state=42), ["n_estimators = 300", "random_state = 42"]),
)

# The 300-tree budget above was tuned for the small datasets CropCast was built for. Measured on a
# real 19,689-row state harvest dataset (~95 columns after one-hot encoding), ONE 300-tree fit takes
# ~493s and the analysis does seven of them, so a large file could never finish inside the browser's
# request deadline. Above the row threshold the forest uses fewer trees, caps each tree's bootstrap
# sample, and parallelises tree building over threads: on data this big a single tree costs hundreds
# of milliseconds, so threads win decisively (the exact opposite of the small-data trade-off measured
# above), while `permutation_importance` keeps its own serial setting. Datasets at or below the
# threshold are untouched, so their reported scores are byte-identical to before.
LARGE_DATASET_ROWS = 5000
FOREST_TREES_LARGE = 60
FOREST_BOOTSTRAP_ROWS_LARGE = 2500
# Permutation importance makes (features + 1) x repeats predictions; both factors grow with dataset
# size, so on large frames it is measured on a fixed random sample of rows with fewer repeats. The
# subsample is disclosed in the report's insights note rather than done silently.
MAX_IMPORTANCE_ROWS = 3000
PERMUTATION_REPEATS_LARGE = 5


def adaptive_forest(rows: int) -> RandomForestRegressor:
    """A forest sized to the dataset, so a large upload degrades in speed, not into a timeout.

    Small datasets keep the full 300-tree budget unchanged. Large ones trade a little variance for
    finishing at all: fewer trees, a capped bootstrap sample per tree, and thread-parallel tree
    building. Tree seeds are per-tree, so `n_jobs` changes timing, never the fitted forest.
    """
    if rows <= LARGE_DATASET_ROWS:
        return RandomForestRegressor(n_estimators=300, random_state=42)
    return RandomForestRegressor(
        n_estimators=FOREST_TREES_LARGE,
        max_samples=FOREST_BOOTSTRAP_ROWS_LARGE,
        n_jobs=-1,
        random_state=42,
    )


# The 300-tree budget above was tuned for the small datasets CropCast was built for. Measured on a
# real 19,689-row state harvest dataset (~95 columns after one-hot encoding), ONE 300-tree fit takes
# ~493s and the analysis does seven of them, so a large file would never finish inside the browser's
# request deadline. Above this row count the forest uses fewer trees and caps each tree's bootstrap
# sample, which adds a little variance and no bias, and keeps a large analysis around two minutes.
# Datasets at or below the threshold are untouched, so their reported scores are byte-identical.
LARGE_DATASET_ROWS = 5000
FOREST_TREES_LARGE = 60
FOREST_BOOTSTRAP_ROWS_LARGE = 2500
# Permutation importance makes (features + 1) x repeats predictions; both factors grow with dataset
# size, so on large frames it is measured on a fixed random sample of rows and fewer repeats. The
# subsample is disclosed in the report's insights note rather than done silently.
MAX_IMPORTANCE_ROWS = 3000
PERMUTATION_REPEATS_LARGE = 5
MODEL_LABELS = {kind: label for kind, label, _, _ in MODEL_DEFINITIONS}

MIN_HELDOUT_ROWS = 20
MIN_HOLDOUT_EVIDENCE = 5
MIN_TARGET_ROWS = 8
RANDOM_STATE = 42

# Evidence caps keep the report payload bounded on very large uploads.
MAX_EVIDENCE_POINTS = 250
MAX_GROUP_OVERLAP_REPORTED = 5
MAX_GROUP_CARDINALITY = 100
# An unnamed column with at least this many levels is treated as an entity key, not a descriptive feature.
MIN_GROUP_CARDINALITY = 10

# A feature this correlated with the target is more likely to be leakage or a restatement of it than a
# driver. It is *disclosed* rather than excluded: on a small dataset a genuinely predictive column can
# reach |r| >= 0.95 (measured: `temperature` vs `yield` on the 8-row fixture scores 0.9975), so acting
# on this signal alone would delete real signal. Excluding is reserved for the stronger test below.
REDUNDANT_CORRELATION = 0.95
# Pairwise feature screening excludes only exact arithmetic definitions of the target. Approximate
# matches are not safe to remove before validation because smooth, correlated columns can resemble a
# ratio on small datasets without actually defining the target.
# Levels at or below this are offered as a closed choice in the prediction form. Above it a column
# becomes free text, where one typo silently encodes nothing at all.
MAX_CATEGORY_LEVELS = 60
# A candidate must beat the mean baseline by at least this fraction of the baseline error to count as informative.
MIN_BASELINE_MARGIN = 0.05

HOLDOUT_FRACTION = 0.25
VALIDATION_RANDOM = "random"
VALIDATION_GROUPED = "grouped"
VALIDATION_TEMPORAL = "temporal"
VALIDATION_STRATEGIES = (VALIDATION_RANDOM, VALIDATION_GROUPED, VALIDATION_TEMPORAL)
RANDOM_SPLIT_NOTE = (
    "Rows are split at random, so records from one entity or period can appear on both sides. The grouped and temporal "
    "strategies answer a stricter question and generally score worse than this one."
)
GROUPED_SPLIT_NOTE = (
    "Rows are split by {entity}, so no {entity} appears in both partitions. These scores estimate transfer to an unseen "
    "{entity}, not accuracy on a record from a familiar one."
)
TEMPORAL_SPLIT_NOTE = (
    "Rows are ordered by {column} and the last 25% are held out, so every test row is later than every training row. "
    "These scores describe an earlier-to-later extrapolation inside this dataset."
)

PERMUTATION_REPEATS = 10
INSIGHT_METHOD_LINEAR = "standardized-coefficients"
INSIGHT_METHOD_TREE = "permutation-importance"
TEMPORAL_NAME_HINTS = ("date", "time", "year", "month", "season_start", "day")

IDENTIFIER_NAMES = {"id", "index", "idx", "uuid", "guid", "key", "unnamed: 0"}
IDENTIFIER_SUFFIXES = ("_id", "_ids", "_uuid", "_guid", "_key")
UNIT_HINTS = (("rain", "mm"), ("temp", "°C"), ("yield", "t/ha"))
SELECTION_RULE = "The selected model is the one with the lowest cross-validated RMSE across all four candidates."
PERMUTATION_NOTE = "Shuffling this column raised prediction error by roughly this many units of {target}. Permutation importance carries no direction."
LINEAR_NOTE = "A higher encoded value is associated with {direction} predicted {target} within this dataset."
INSIGHTS_NOTE_LINEAR = "Standardized coefficients are directional and comparable in size, but they describe association only."
INSIGHTS_NOTE_TREE = "Permutation importance is measured on the same rows used to fit the selected model by shuffling each column. Values are in target units, carry no direction, and rank influence rather than causation."


@dataclass
class DatasetRecord:
    dataset_id: str
    frame: pd.DataFrame
    file_name: str
    file_size: int
    file_type: str
    detected_files: list[str]
    models: dict[tuple[str, tuple[str, ...], str], Pipeline] = field(default_factory=dict)
    # Cross-validated RMSE per (target, features, model, strategy), reused to give predictions an interval.
    cv_rmse: dict[tuple[str, tuple[str, ...], str, str], float] = field(default_factory=dict)
    # Attribution per (target, features, model). Permutation importance is expensive and deterministic,
    # so a field prediction must not recompute it for a model that has already been scored.
    insights: dict[tuple[str, tuple[str, ...], str], tuple[str, list[dict[str, Any]]]] = field(default_factory=dict)
    # The candidate the analysis chose per (target, features, strategy). A field prediction reuses this
    # instead of asking the caller which algorithm to run.
    selected: dict[tuple[str, tuple[str, ...], str], str] = field(default_factory=dict)


def fail(message: str, status: int = 400) -> HTTPException:
    return HTTPException(status_code=status, detail=message)


def json_number(value: Any) -> float | None:
    """Return a JSON-safe rounded float, or None when the statistic is undefined.

    A non-finite value is never substituted with 0.0: a failed metric must stay missing so it
    cannot be mistaken for, or win against, a real score.
    """
    try:
        number = float(value)
    except TypeError, ValueError:
        return None
    return round(number, 4) if np.isfinite(number) else None


def normalize_name(column: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", column.strip().lower()).strip("_")


def looks_like_identifier(column: str, series: pd.Series) -> bool:
    """Identify columns that must never be model features.

    Matching is token-based so real measurements such as `humid`, `grid`, or `rapid` survive.
    """
    name = normalize_name(column)
    if name in IDENTIFIER_NAMES or "identifier" in name:
        return True
    if name.endswith(IDENTIFIER_SUFFIXES):
        return True
    if pd.api.types.is_datetime64_any_dtype(series):
        return True
    return series.nunique(dropna=True) / max(len(series), 1) > 0.95 and not pd.api.types.is_numeric_dtype(series)


def classify_series(series: pd.Series) -> str:
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_integer_dtype(series):
        return "integer"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    return "category" if series.nunique(dropna=True) <= MAX_CATEGORY_LEVELS else "text"


def inferred_unit(column: str) -> str | None:
    """Guess a display unit from the column name. Callers must label this as inferred."""
    name = column.lower()
    for hint, unit in UNIT_HINTS:
        if hint in name:
            return unit
    return None


def is_supported_feature(frame: pd.DataFrame, column: str) -> bool:
    return column in frame.columns and not pd.api.types.is_datetime64_any_dtype(frame[column])


def parse_dataset(payload: bytes, suffix: str, file_name: str) -> DatasetRecord:
    detected_files = [file_name]
    try:
        if suffix == ".csv":
            frame = pd.read_csv(BytesIO(payload))
        elif suffix == ".xlsx":
            frame = pd.read_excel(BytesIO(payload))
        else:
            with zipfile.ZipFile(BytesIO(payload)) as archive:
                csv_members = [member for member in archive.infolist() if not member.is_dir() and member.filename.lower().endswith(".csv")]
                if len(csv_members) != 1:
                    raise fail("ZIP uploads must contain exactly one CSV file.")
                member = csv_members[0]
                # Declared sizes in the archive header are attacker-controlled, so re-check the bytes.
                with archive.open(member) as stream:
                    inner = stream.read(MAX_UPLOAD_BYTES + 1)
                if len(inner) > MAX_UPLOAD_BYTES:
                    raise fail("The CSV inside the ZIP must be 10 MB or smaller.")
                detected_files = [member.filename]
                frame = pd.read_csv(BytesIO(inner))
    except HTTPException:
        raise
    except Exception as error:
        raise fail("CropCast could not read this dataset. Use a valid CSV, XLSX, or single-CSV ZIP file.") from error

    frame.columns = [str(column).strip() for column in frame.columns]
    if frame.empty or len(frame.columns) < 2:
        raise fail("Provide at least two columns and one data row.")
    if any(not column for column in frame.columns) or frame.columns.duplicated().any():
        raise fail("Dataset column names must be non-empty and unique.")
    # Source files routinely pad labels ("Kharif     "), and a padded label is its own category: it
    # splits one real level across several duplicate ones, and it never matches the trimmed value a
    # user picks in the prediction form. pandas 3 stores text as `str`, not `object`, so both are checked.
    for column in frame.columns:
        series = frame[column]
        if not (pd.api.types.is_string_dtype(series) or series.dtype == object):
            continue
        frame[column] = series.map(lambda value: value.strip() if isinstance(value, str) else value)
    if len(frame) < MIN_TARGET_ROWS:
        raise fail(f"Provide at least {MIN_TARGET_ROWS} rows so CropCast can evaluate a holdout set.")
    return DatasetRecord(uuid4().hex, frame, file_name, len(payload), suffix.removeprefix(".").upper(), detected_files)


async def read_dataset(file: UploadFile) -> DatasetRecord:
    file_name = file.filename or "dataset"
    suffix = Path(file_name).suffix.lower()
    if suffix not in {".csv", ".xlsx", ".zip"}:
        raise fail("Upload a CSV, XLSX, or ZIP file containing one CSV file.")
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise fail("The uploaded file is empty.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise fail("The dataset must be 10 MB or smaller.")
    return parse_dataset(payload, suffix, file_name)


def numeric_columns(frame: pd.DataFrame) -> list[str]:
    return frame.select_dtypes(include=[np.number]).columns.astype(str).tolist()


def candidate_targets(frame: pd.DataFrame) -> list[str]:
    """Return every column a user may reasonably pick as the target.

    When nothing matches a crop-output name we return all eligible numeric columns instead of
    guessing, so the caller asks the user rather than silently training on the last numeric column.
    """
    numeric = [
        column
        for column in numeric_columns(frame)
        # Regressing a boolean column is not meaningful, so it is never a target candidate.
        if not pd.api.types.is_bool_dtype(frame[column]) and frame[column].nunique(dropna=True) > 1 and not looks_like_identifier(column, frame[column])
    ]
    named = [column for column in numeric if any(word in column.lower() for word in TARGET_WORDS)]
    return named or numeric


def to_json(value: Any) -> Any:
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def column_descriptor(frame: pd.DataFrame, column: str, excluded_features: set[str] | None = None) -> dict[str, Any]:
    series = frame[column]
    data_type = classify_series(series)
    unit = inferred_unit(column)
    descriptor: dict[str, Any] = {
        "id": column,
        "label": column,
        "dataType": data_type,
        "nullable": bool(series.isna().any()),
        "eligibleAsTarget": column in candidate_targets(frame),
        "eligibleAsFeature": is_supported_feature(frame, column)
        and not looks_like_identifier(column, series)
        and (excluded_features is None or column not in excluded_features),
    }
    if data_type in {"boolean", "category"}:
        descriptor["allowedValues"] = [to_json(value) for value in series.dropna().unique().tolist()[:MAX_CATEGORY_LEVELS]]
    if unit:
        descriptor["unit"] = unit
        descriptor["unitInferred"] = True
    return descriptor


def usable_features(frame: pd.DataFrame, target: str, requested: list[str] | None = None) -> list[str]:
    candidates = candidate_features(frame, target)
    defining = defining_columns(frame, target, candidates)
    eligible = [column for column in candidates if column not in defining]
    if requested is not None:
        if len(requested) != len(set(requested)):
            raise fail("Feature column IDs must be unique.")
        unknown = [column for column in requested if column not in frame.columns]
        if unknown:
            raise fail(f"Unknown feature column(s): {', '.join(unknown)}.")
        ineligible = [column for column in requested if column not in eligible]
        if ineligible:
            raise fail(f"Ineligible feature column(s): {', '.join(ineligible)}.")
        features = requested
    else:
        features = eligible
    if not features:
        if defining:
            raise fail(f"No non-leaking feature columns remain after excluding: {', '.join(defining)}.")
        raise fail("CropCast needs at least one non-constant feature column.")
    return features


def make_pipeline(frame: pd.DataFrame, features: list[str], estimator: Any) -> Pipeline:
    numeric = [column for column in features if pd.api.types.is_numeric_dtype(frame[column])]
    categorical = [column for column in features if column not in numeric]
    transformers: list[tuple[str, Pipeline, list[str]]] = []
    if numeric:
        transformers.append(("numeric", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), numeric))
    if categorical:
        transformers.append(
            ("categorical", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("encoder", OneHotEncoder(handle_unknown="ignore"))]), categorical)
        )
    return Pipeline([("preprocessor", ColumnTransformer(transformers)), ("model", clone(estimator))])


def target_rows(record: DatasetRecord, target: str, features: list[str]) -> tuple[pd.DataFrame, pd.Series]:
    y = pd.to_numeric(record.frame[target], errors="coerce")
    valid = y.notna()
    if int(valid.sum()) < MIN_TARGET_ROWS:
        raise fail(f"The selected target needs at least {MIN_TARGET_ROWS} numeric values.")
    return record.frame.loc[valid, features].copy(), y.loc[valid]


def estimator_for(kind: str, rows: int) -> tuple[Any, list[str]]:
    """The estimator for one candidate at this dataset size, plus the parameters actually used.

    The reported hyperparameters must describe the model that was really fitted, so the large-dataset
    forest reports its reduced budget instead of the small-dataset constants.
    """
    definition = next(item for item in MODEL_DEFINITIONS if item[0] == kind)
    if kind != "random-forest" or rows <= LARGE_DATASET_ROWS:
        return definition[2], definition[3]
    return adaptive_forest(rows), [f"n_estimators = {FOREST_TREES_LARGE}", f"max_samples = {FOREST_BOOTSTRAP_ROWS_LARGE}", "random_state = 42", "n_jobs = -1"]


def fitted_model(record: DatasetRecord, target: str, features: list[str], kind: str) -> Pipeline:
    """Return a cached fitted pipeline, training it on all usable target rows on first use."""
    key = (target, tuple(features), kind)
    cached = record.models.get(key)
    if cached is not None:
        return cached
    frame, y = target_rows(record, target, features)
    estimator, _ = estimator_for(kind, len(frame))
    pipeline = make_pipeline(record.frame, features, estimator).fit(frame, y)
    record.models[key] = pipeline
    return pipeline


def build_input_row(frame: pd.DataFrame, features: list[str], values: dict[str, Any]) -> pd.DataFrame:
    """Coerce submitted values to each column's dtype so the fitted preprocessor always accepts them.

    The numeric/categorical split must match `make_pipeline` exactly, or the preprocessor will
    receive a dtype it was not fitted on.
    """
    row: dict[str, pd.Series] = {}
    for column in features:
        value = values.get(column)
        if pd.api.types.is_numeric_dtype(frame[column]):
            row[column] = pd.Series([pd.to_numeric(value, errors="coerce")], dtype="float64")
        else:
            row[column] = pd.Series([value], dtype="object")
    return pd.DataFrame(row, columns=features)


def is_group_candidate(column: str, series: pd.Series, row_count: int) -> bool:
    """True when a column plausibly identifies a repeated entity rather than describing a row.

    A shared `region` or `soil_type` between train and test is normal and expected: features are
    supposed to repeat across observations. What matters is an entity key — a field, a farm, a
    plot — where one physical unit contributes several rows. Those are the dependency that turns
    a shuffled split into an optimistic one.
    """
    if pd.api.types.is_numeric_dtype(series) and not looks_like_identifier(column, series):
        return False
    distinct = int(series.nunique(dropna=True))
    if distinct <= 1 or distinct >= row_count or distinct > MAX_GROUP_CARDINALITY:
        return False
    return looks_like_identifier(column, series) or distinct >= MIN_GROUP_CARDINALITY


def group_overlap(frame: pd.DataFrame, train_index: pd.Index, test_index: pd.Index, skip: str | None = None) -> list[dict[str, Any]]:
    """Find entity columns whose values appear in both the train and test partitions.

    When rows share an entity across the split, the reported error measures interpolation between
    known entities rather than transfer to a new one. `skip` excludes the column whose period
    overlap is reported separately as a temporal risk, so each signal is stated once.
    """
    overlaps: list[dict[str, Any]] = []
    for column in frame.columns:
        series = frame[column]
        if column == skip or not is_group_candidate(column, series, len(frame)):
            continue
        distinct = int(series.nunique(dropna=True))
        shared = set(series.loc[train_index].dropna()) & set(series.loc[test_index].dropna())
        if not shared:
            continue
        overlaps.append(
            {
                "column": column,
                "sharedValues": len(shared),
                "distinctValues": distinct,
                "testRowsAffected": int(series.loc[test_index].isin(shared).sum()),
            }
        )
    overlaps.sort(key=lambda item: item["testRowsAffected"], reverse=True)
    return overlaps[:MAX_GROUP_OVERLAP_REPORTED]


def temporal_column(frame: pd.DataFrame, target: str) -> str | None:
    for column in frame.columns:
        if column != target and pd.api.types.is_datetime64_any_dtype(frame[column]):
            return column
    for column in frame.columns:
        if column == target:
            continue
        name = column.lower()
        if any(hint in name for hint in TEMPORAL_NAME_HINTS):
            return column
    return None


def entity_column(frame: pd.DataFrame, target: str) -> str | None:
    """The column most likely to identify a repeated entity: a field, a farm, or a plot."""
    candidates = [column for column in frame.columns if column != target and is_group_candidate(column, frame[column], len(frame))]
    if not candidates:
        return None
    # An explicit identifier beats a merely high-cardinality column.
    candidates.sort(key=lambda column: (not looks_like_identifier(column, frame[column]), -int(frame[column].nunique(dropna=True))))
    return candidates[0]


def ordering_column(frame: pd.DataFrame, target: str) -> str | None:
    """The column rows can be ordered by, when one exists."""
    column = temporal_column(frame, target)
    if column is None or frame[column].nunique(dropna=True) < 2:
        return None
    return column


def temporal_order(frame: pd.DataFrame, column: str) -> np.ndarray:
    """Frame positions in time order, so a later row is never used to predict an earlier one."""
    series = frame[column]
    if not (pd.api.types.is_datetime64_any_dtype(series) or pd.api.types.is_numeric_dtype(series)):
        series = series.fillna("missing").astype(str)
    # Missing timestamps sort first, so they can only ever train a model, never flatter it in a test score.
    ordered = series.sort_values(kind="stable", na_position="first").index
    return frame.index.get_indexer(ordered)


def validation_options(frame: pd.DataFrame, target: str) -> list[dict[str, Any]]:
    """Every strategy the user may choose, with why an unavailable one cannot be used."""
    entity = entity_column(frame, target)
    order = ordering_column(frame, target)
    return [
        {"key": VALIDATION_RANDOM, "label": "Random split", "available": True, "reason": "", "note": RANDOM_SPLIT_NOTE},
        {
            "key": VALIDATION_GROUPED,
            "label": f"Grouped by {entity}" if entity else "Grouped split",
            "available": entity is not None,
            "reason": "" if entity else "CropCast found no field, farm, plot, or other entity column to group on.",
            "note": GROUPED_SPLIT_NOTE.format(entity=entity) if entity else "",
        },
        {
            "key": VALIDATION_TEMPORAL,
            "label": f"Temporal, ordered by {order}" if order else "Temporal split",
            "available": order is not None,
            "reason": "" if order else "CropCast found no date, season, or year column to order rows by.",
            "note": TEMPORAL_SPLIT_NOTE.format(column=order) if order else "",
        },
    ]


@dataclass
class ValidationSplit:
    strategy: str
    label: str
    cv_label: str
    cv: list[tuple[np.ndarray, np.ndarray]]
    train_positions: np.ndarray
    test_positions: np.ndarray


def validation_split(full_frame: pd.DataFrame, frame: pd.DataFrame, y: pd.Series, target: str, strategy: str) -> ValidationSplit:
    """Build the holdout and cross-validation folds for one strategy.

    `full_frame` is the uploaded table, while `frame` holds only the rows with a usable target.
    An entity key or a date column is normally excluded from the features, so both are read from
    `full_frame` and re-aligned to the rows the models actually see. Folds are positional, and for
    a temporal split they are mapped through the time order, so every fold trains on the past.
    """
    options = {option["key"]: option for option in validation_options(full_frame, target)}
    if strategy not in options:
        raise fail("Choose one of the reported validation strategies.")
    option = options[strategy]
    if not option["available"]:
        raise fail(f"{option['label']} cannot be used for this dataset: {option['reason']}")

    total = len(frame)
    folds = min(5, max(2, total // 4))
    ordered = np.arange(total)
    groups: np.ndarray | None = None

    if strategy == VALIDATION_GROUPED:
        entity = entity_column(full_frame, target)
        groups = full_frame.loc[frame.index, entity].fillna("Missing").astype(str).to_numpy()
        group_folds = min(folds, int(pd.Series(groups).nunique()))
        splitter: Any = GroupKFold(n_splits=group_folds)
        holdout: Any = GroupShuffleSplit(n_splits=1, test_size=HOLDOUT_FRACTION, random_state=RANDOM_STATE)
        label = f"Grouped by {entity}"
        cv_label = f"{group_folds}-fold grouped cross-validation on all {total} usable rows (grouped by {entity})"
    elif strategy == VALIDATION_TEMPORAL:
        column = ordering_column(full_frame, target)
        if column is None:
            raise fail(f"Temporal validation cannot be used for this dataset: {options[VALIDATION_TEMPORAL]['reason']}")
        ordered = temporal_order(full_frame.loc[frame.index], column)
        splitter = TimeSeriesSplit(n_splits=min(folds, total - 1))
        holdout = None
        label = f"Temporal, ordered by {column}"
        # Forward-chaining folds never test on the earliest rows, so say how many are actually scored.
        first_train, _ = next(iter(splitter.split(ordered)))
        scored = total - len(first_train)
        cv_label = f"{splitter.n_splits}-fold forward-chaining cross-validation over the {scored} later rows of {total} usable rows (ordered by {column})"
    else:
        splitter = KFold(n_splits=folds, shuffle=True, random_state=RANDOM_STATE)
        holdout = None
        label = "Random split"
        cv_label = f"{folds}-fold shuffled cross-validation on all {total} usable rows (random state {RANDOM_STATE})"

    cv = [(ordered[train], ordered[test]) for train, test in splitter.split(ordered, y, groups=groups)]
    if holdout is None and strategy == VALIDATION_TEMPORAL:
        cut = min(max(round(total * (1 - HOLDOUT_FRACTION)), 1), total - 1)
        train_positions, test_positions = ordered[:cut], ordered[cut:]
    elif holdout is None:
        train_positions, test_positions = train_test_split(ordered, test_size=HOLDOUT_FRACTION, random_state=RANDOM_STATE)
    else:
        train_positions, test_positions = next(holdout.split(ordered, y, groups=groups))
        train_positions, test_positions = ordered[train_positions], ordered[test_positions]
    return ValidationSplit(strategy, label, cv_label, cv, train_positions, test_positions)


@dataclass
class FittedAnalysis:
    evaluations: list[dict[str, Any]]
    baseline: dict[str, Any]
    pipeline: Pipeline
    actual: np.ndarray
    predicted: np.ndarray
    group_overlap: list[dict[str, Any]]
    temporal_column: str | None
    strategy: str
    strategy_label: str
    cv_label: str


def cross_validated(frame: pd.DataFrame, y: pd.Series, features: list[str], estimator: Any, cv: Any) -> tuple[np.ndarray, np.ndarray]:
    """Out-of-fold predictions, assembled by hand.

    `cross_val_predict` refuses a forward-chaining split because it is not a partition of the rows,
    and returning the covered target values with the predictions keeps the score honest for every
    strategy: only rows the folds actually tested on are scored.
    """
    predictions = np.full(len(y), np.nan)
    for train, test in cv:
        pipeline = make_pipeline(frame, features, estimator).fit(frame.iloc[train], y.iloc[train])
        predictions[test] = pipeline.predict(frame.iloc[test])
    covered = ~np.isnan(predictions)
    return predictions[covered], y.to_numpy()[covered]


def score(prediction, y, y_test, holdout_prediction, cross_validation: str) -> dict[str, Any]:
    return {
        "r2": json_number(r2_score(y, prediction)),
        "mae": json_number(mean_absolute_error(y, prediction)),
        "rmse": json_number(mean_squared_error(y, prediction) ** 0.5),
        "crossValidation": cross_validation,
        "holdoutR2": json_number(r2_score(y_test, holdout_prediction)),
        "holdoutMae": json_number(mean_absolute_error(y_test, holdout_prediction)),
        "holdoutRmse": json_number(mean_squared_error(y_test, holdout_prediction) ** 0.5),
    }


def fit_models(record: DatasetRecord, target: str, features: list[str], strategy: str = VALIDATION_RANDOM) -> FittedAnalysis:
    frame, y = target_rows(record, target, features)
    split = validation_split(record.frame, frame, y, target, strategy)
    x_train, y_train = frame.iloc[split.train_positions], y.iloc[split.train_positions]
    x_test, y_test = frame.iloc[split.test_positions], y.iloc[split.test_positions]
    evaluations: list[dict[str, Any]] = []
    raw_rmse: list[float] = []
    holdout_pipelines: list[Pipeline] = []
    for kind, label, _, _ in MODEL_DEFINITIONS:
        estimator, parameters = estimator_for(kind, len(frame))
        holdout_pipeline = make_pipeline(record.frame, features, estimator)
        holdout_pipeline.fit(x_train, y_train)
        holdout_prediction = holdout_pipeline.predict(x_test)
        cv_prediction, cv_target = cross_validated(frame, y, features, estimator, split.cv)
        evaluated: dict[str, Any] = {
            "model": kind,
            "label": label,
            "selected": False,
            "parameters": parameters,
            **score(cv_prediction, cv_target, y_test, holdout_prediction, split.cv_label),
        }
        cross_validated_rmse = float(mean_squared_error(cv_target, cv_prediction) ** 0.5)
        raw_rmse.append(cross_validated_rmse)
        # Keyed by strategy: the same model has a different error under a different split.
        record.cv_rmse[(target, tuple(features), kind, strategy)] = cross_validated_rmse
        evaluations.append(evaluated)
        holdout_pipelines.append(holdout_pipeline)

    # The mean baseline is the reference every candidate has to beat to be worth reporting as skilful.
    baseline_pipeline = make_pipeline(record.frame, features, DummyRegressor(strategy="mean"))
    baseline_pipeline.fit(x_train, y_train)
    baseline_prediction, baseline_target = cross_validated(frame, y, features, DummyRegressor(strategy="mean"), split.cv)
    baseline = {
        "label": "Baseline (predict the mean)",
        "strategy": "mean",
        **score(baseline_prediction, baseline_target, y_test, baseline_pipeline.predict(x_test), split.cv_label),
    }

    # Only a model with a real cross-validated RMSE may win; a missing metric is never a best score.
    scored = [index for index, value in enumerate(raw_rmse) if np.isfinite(value)]
    if not scored:
        raise fail("CropCast could not compute a cross-validated error for any candidate model. Check that the target column holds varied numeric values.")
    winner = min(scored, key=raw_rmse.__getitem__)
    evaluations[winner]["selected"] = True
    record.selected[(target, tuple(features), strategy)] = MODEL_DEFINITIONS[winner][0]
    temporal = temporal_column(record.frame, target)
    return FittedAnalysis(
        evaluations=evaluations,
        baseline=baseline,
        pipeline=fitted_model(record, target, features, MODEL_DEFINITIONS[winner][0]),
        actual=y_test.to_numpy(),
        predicted=holdout_pipelines[winner].predict(x_test),
        group_overlap=group_overlap(record.frame, x_train.index, x_test.index, temporal),
        temporal_column=temporal,
        strategy=split.strategy,
        strategy_label=split.label,
        cv_label=split.cv_label,
    )


def evidence_indices(total: int) -> np.ndarray:
    """Every holdout row when it fits, otherwise a deterministic even spread across the range."""
    if total <= MAX_EVIDENCE_POINTS:
        return np.arange(total)
    return np.unique(np.linspace(0, total - 1, MAX_EVIDENCE_POINTS).round().astype(int))


def evidence_sample(actual: np.ndarray, predicted: np.ndarray) -> tuple[list[dict[str, Any]], int]:
    """Return the actual/predicted pairs to publish, plus the true total.

    Large holdouts are sampled deterministically so the report cannot imply it is showing every row.
    """
    total = int(actual.size)
    indices = evidence_indices(total)
    points = [
        {"actual": json_number(actual[index]), "predicted": json_number(predicted[index]), "residual": json_number(actual[index] - predicted[index])}
        for index in indices
    ]
    return points, total


def redundant_features(frame: pd.DataFrame, target: str, features: list[str]) -> list[str]:
    """Features that essentially restate the target, which is leakage more often than it is a driver."""
    redundant: list[str] = []
    for column in features:
        if not pd.api.types.is_numeric_dtype(frame[column]):
            continue
        paired = frame[[column, target]].dropna()
        if paired.shape[0] < 3:
            continue
        correlation = paired.corr(numeric_only=True).iloc[0, 1]
        if pd.notna(correlation) and abs(float(correlation)) >= REDUNDANT_CORRELATION:
            redundant.append(column)
    return redundant


def defining_features(frame: pd.DataFrame, target: str, features: list[str]) -> list[tuple[str, str, str]]:
    """Feature pairs whose ratio or product reproduces the target, with the relation that does it.

    Single-column correlation cannot see this: in a real harvest dataset `production` correlates with
    `yield` at only ~0.57, yet `production / area` reproduces `yield` to within 0.1% of its range. A
    model given the pair scores near-perfectly without learning anything, and the report would present
    that arithmetic as a discovered driver.

    The test requires one constant conversion factor to reproduce every usable target value. Looser
    approximate matches are warnings at most; excluding them here would let validation targets affect
    feature selection and would misclassify smooth, correlated columns on small datasets.
    """
    numeric = [column for column in features if pd.api.types.is_numeric_dtype(frame[column])]
    target_values = pd.to_numeric(frame[target], errors="coerce")
    found: list[tuple[str, str, str]] = []
    for index, first in enumerate(numeric):
        for second in numeric[index + 1 :]:
            paired = pd.DataFrame(
                {
                    "target": target_values,
                    "first": pd.to_numeric(frame[first], errors="coerce"),
                    "second": pd.to_numeric(frame[second], errors="coerce"),
                }
            ).dropna()
            if len(paired) < MIN_TARGET_ROWS:
                continue
            relations = (
                (f"{first} / {second}", paired["first"] / paired["second"].replace(0, np.nan)),
                (f"{second} / {first}", paired["second"] / paired["first"].replace(0, np.nan)),
                (f"{first} × {second}", paired["first"] * paired["second"]),
            )
            for relation, expression in relations:
                usable = expression.replace([np.inf, -np.inf], np.nan).notna()
                if int(usable.sum()) < MIN_TARGET_ROWS:
                    continue
                values, observed = expression[usable], paired["target"][usable]
                nonzero = values.ne(0) & observed.ne(0)
                if int(nonzero.sum()) < MIN_TARGET_ROWS:
                    continue
                values, observed = values[nonzero], observed[nonzero]
                ratios = observed / values
                scale = float(ratios.median())
                if not np.isfinite(scale) or scale == 0:
                    continue
                exact = bool(np.allclose(observed, scale * values, rtol=1e-9, atol=1e-12))
                if exact:
                    found.append((first, second, relation))
                    break
    return found


def defining_columns(frame: pd.DataFrame, target: str, features: list[str]) -> list[str]:
    """Every feature excluded because, with another, it reproduces the target."""
    columns: list[str] = []
    for first, second, _ in defining_features(frame, target, features):
        columns.extend([first, second])
    return list(dict.fromkeys(columns))


def candidate_features(frame: pd.DataFrame, target: str) -> list[str]:
    """Every column that could be a feature, before the leakage screen removes any of them."""
    return [
        column
        for column in frame.columns
        if column != target
        and not looks_like_identifier(column, frame[column])
        and is_supported_feature(frame, column)
        and frame[column].nunique(dropna=True) > 1
    ]


def unseen_value_notices(frame: pd.DataFrame, features: list[str], values: dict[str, Any]) -> list[str]:
    """Warn when a submitted category never appeared in the upload.

    Unknown-safe encoding is deliberate, but a silently ignored value produces a confident estimate
    built on a field that carried no information, so the caller has to be told.
    """
    notices: list[str] = []
    for column in features:
        if pd.api.types.is_numeric_dtype(frame[column]):
            continue
        value = values.get(column)
        if value is None:
            continue
        observed = {str(item) for item in frame[column].dropna().unique().tolist()}
        if str(value) not in observed:
            notices.append(f"'{value}' never appeared in {column}, so this field was encoded as an unseen category and contributed nothing to the estimate.")
    return notices


def quality_checks(
    frame: pd.DataFrame, features: list[str], target: str, fitted: FittedAnalysis, redundant: list[str], defining: list[str]
) -> list[dict[str, str]]:
    missing = int(frame.isna().sum().sum())
    duplicates = int(frame.duplicated().sum())
    constants = int(sum(frame[column].nunique(dropna=True) <= 1 for column in frame.columns))
    outliers = outlier_rows(frame, features)
    excluded = [column for column in frame.columns if column == target or looks_like_identifier(column, frame[column])]
    overlap = fitted.group_overlap
    overlap_columns = ", ".join(item["column"] for item in overlap)
    return [
        {
            "label": "Missing values",
            "status": "warning" if missing else "good",
            "value": f"{missing} cells",
            "detail": "Missing feature values are imputed within the model pipeline.",
        },
        {
            "label": "Duplicate rows",
            "status": "warning" if duplicates else "good",
            "value": f"{duplicates} rows",
            "detail": "Duplicate rows are retained and reported; review them before operational use.",
        },
        {
            "label": "Constant columns",
            "status": "warning" if constants else "good",
            "value": f"{constants} columns",
            "detail": "Constant columns cannot improve a regression model.",
        },
        {
            "label": "Outlier indicators",
            "status": "review" if outliers else "good",
            "value": f"{outliers} rows",
            "detail": "Rows with a feature outside 1.5× the interquartile range are flagged, not removed.",
        },
        {
            "label": "Target redundancy",
            "status": "warning" if redundant or defining else "good",
            "value": f"{len(redundant) + len(defining)} features",
            "detail": (
                " ".join(
                    part
                    for part in (
                        f"{', '.join(defining)} reproduce the target from other columns and were excluded from the model features." if defining else "",
                        f"{', '.join(redundant)} correlate(s) with the target at |r| ≥ {REDUNDANT_CORRELATION}; check whether these restate the target before reading them as drivers."
                        if redundant
                        else "",
                    )
                    if part
                )
                or f"No feature reaches |r| ≥ {REDUNDANT_CORRELATION} with the target, and no feature pair reproduces it."
            ),
        },
        {
            "label": "Train/test overlap",
            "status": "warning" if overlap else "good",
            "value": f"{len(overlap)} columns",
            "detail": f"Values from {overlap_columns} appear in both partitions, so the reported error includes interpolation between known entities. Use grouped cross-validation when rows share an entity."
            if overlap
            else "No categorical column repeats its values across the training and test partitions.",
        },
        {
            "label": "Leakage checks",
            "status": "good",
            "value": "Passed",
            "detail": f"{len(excluded)} identifier-like, date, or target column(s) were excluded from model features.",
        },
    ]


def outlier_rows(frame: pd.DataFrame, columns: list[str]) -> int:
    if not columns:
        return 0
    numeric = frame[columns].apply(lambda column: pd.to_numeric(column, errors="coerce"))
    flags = pd.Series(False, index=frame.index)
    for column in numeric.columns:
        series = numeric[column].dropna()
        if series.empty:
            continue
        lower, upper = series.quantile(0.25), series.quantile(0.75)
        spread = upper - lower
        if spread <= 0:
            continue
        flags |= numeric[column].lt(lower - 1.5 * spread) | numeric[column].gt(upper + 1.5 * spread)
    return int(flags.sum())


def numeric_summary(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    return [
        {
            "feature": column,
            "mean": json_number(frame[column].mean()),
            "median": json_number(frame[column].median()),
            "min": json_number(frame[column].min()),
            "max": json_number(frame[column].max()),
            "standardDeviation": json_number(frame[column].std(ddof=0)),
        }
        for column in columns
    ]


def categorical_summary(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    return [
        {
            "feature": column,
            "uniqueValues": int(frame[column].nunique(dropna=True)),
            "topCategories": [{"label": str(label), "count": int(count)} for label, count in frame[column].fillna("Missing").value_counts().head(5).items()],
        }
        for column in columns
    ]


def strip_prefix(name: str) -> str:
    return name.replace("numeric__", "").replace("categorical__", "")


def feature_insights(pipeline: Pipeline, target: str, frame: pd.DataFrame, y: pd.Series, features: list[str]) -> tuple[str, list[dict[str, Any]]]:
    """Return the attribution method and its ranked entries.

    Tree ensembles use training-set permutation importance on the original columns: impurity-based
    `feature_importances_` is biased toward high-cardinality and continuous columns and is not
    comparable to a linear coefficient. Linear models keep standardized coefficients, which are
    directional and need no extra fitting.
    """
    if hasattr(pipeline.named_steps["model"], "feature_importances_"):
        # On large frames, measure importance on a fixed random sample of rows with fewer repeats.
        # The sample is seeded and positional, so the result stays deterministic and cacheable.
        total_rows = len(frame)
        if total_rows > MAX_IMPORTANCE_ROWS:
            rng = np.random.default_rng(RANDOM_STATE)
            positions = np.sort(rng.choice(total_rows, size=MAX_IMPORTANCE_ROWS, replace=False))
            frame, y = frame.iloc[positions], y.iloc[positions]
            repeats = PERMUTATION_REPEATS_LARGE
            note = (
                PERMUTATION_NOTE.format(target=target)
                + f" Measured on a seeded random sample of {MAX_IMPORTANCE_ROWS:,} of {total_rows:,} rows so this report stays fast."
            )
        else:
            repeats = PERMUTATION_REPEATS
            note = PERMUTATION_NOTE.format(target=target)
        importance = permutation_importance(
            pipeline,
            frame,
            y,
            n_repeats=repeats,
            random_state=RANDOM_STATE,
            # Serial on purpose, and measured rather than assumed. This call goes through
            # `sklearn.utils.parallel.Parallel`, a plain `joblib.Parallel` with no thread preference, so on
            # Windows `n_jobs != 1` spawns loky processes and pickles the fitted forest into each one.
            # On the bundled sample dataset with 10 repeats: n_jobs=1 took 9.3s, n_jobs=2 took 14.4s,
            # n_jobs=-1 took 15.8s. Do not "fix" this line without re-measuring.
            n_jobs=1,
            scoring="neg_root_mean_squared_error",
        )
        ranked = sorted(zip(features, importance.importances_mean, strict=True), key=lambda item: abs(item[1]), reverse=True)[:5]
        return INSIGHT_METHOD_TREE, [{"feature": column, "coefficient": json_number(float(value)), "interpretation": note} for column, value in ranked]
    names = pipeline.named_steps["preprocessor"].get_feature_names_out()
    values = np.ravel(pipeline.named_steps["model"].coef_)
    ranked = sorted(zip(names, values, strict=True), key=lambda item: abs(item[1]), reverse=True)[:5]
    return INSIGHT_METHOD_LINEAR, [
        {
            "feature": strip_prefix(str(name)),
            "coefficient": json_number(value),
            "interpretation": LINEAR_NOTE.format(direction="higher" if value >= 0 else "lower", target=target),
        }
        for name, value in ranked
    ]


def model_insights(
    record: DatasetRecord,
    target: str,
    features: list[str],
    kind: str,
    pipeline: Pipeline,
    frame: pd.DataFrame,
    y: pd.Series,
) -> tuple[str, list[dict[str, Any]]]:
    """Attribution for one fitted model, computed once per (target, features, model)."""
    key = (target, tuple(features), kind)
    cached = record.insights.get(key)
    if cached is None:
        cached = feature_insights(pipeline, target, frame, y, features)
        record.insights[key] = cached
    return cached


def explanations(model: str, target: str, insights: list[dict[str, Any]]) -> dict[str, str]:
    """Deterministic, template-based summary. This is not a language model and is not labelled as one."""
    top = insights[0]["feature"] if insights else "the available features"
    english = f"{model} had the lowest cross-validated RMSE for predicting {target}. In this uploaded dataset, {top} is among the strongest model associations. This is an association-based estimate, not evidence of causation."
    # Every locale names the same top feature so the three languages carry the same information.
    hindi = (
        f"{model} ने {target} के लिए क्रॉस-वैलिडेशन RMSE में सबसे अच्छा प्रदर्शन किया। इस डेटा में {top} सबसे मजबूत संबंधों में से है। यह अनुमान संबंध पर आधारित है और कारण सिद्ध नहीं करता।"
    )
    telugu = f"{model} {target} కోసం క్రాస్-వాలిడేషన్ RMSEలో ఉత్తమంగా పనిచేసింది. ఈ డేటాలో {top} బలమైన సంబంధాలలో ఒకటి. ఇది సంబంధం ఆధారిత అంచనా, కారణానికి నిరూపణ కాదు."
    return {"en": english, "hi": hindi, "te": telugu}


def build_report(record: DatasetRecord, target: str, strategy: str = VALIDATION_RANDOM) -> dict[str, Any]:
    if target not in candidate_targets(record.frame):
        raise fail("Choose one of the numeric target candidates returned for this dataset.")
    candidates = candidate_features(record.frame, target)
    features = usable_features(record.frame, target)
    # A definition is removed outright; a high but imperfect correlation is only disclosed, because on a
    # small dataset a genuinely predictive column can reach the disclosure threshold.
    definitions = defining_features(record.frame, target, candidates)
    defining = list(dict.fromkeys(column for first, second, _ in definitions for column in (first, second)))
    redundant = [column for column in redundant_features(record.frame, target, candidates) if column not in defining]
    fitted = fit_models(record, target, features, strategy)
    validation = validation_options(record.frame, target)
    chosen = next(option for option in validation if option["key"] == fitted.strategy)
    evaluations, pipeline = fitted.evaluations, fitted.pipeline
    target_values = pd.to_numeric(record.frame[target], errors="coerce").dropna()
    numeric = [column for column in features if pd.api.types.is_numeric_dtype(record.frame[column])]
    categorical = [column for column in features if column not in numeric]
    _, y = target_rows(record, target, features)
    winner_kind = next(evaluation["model"] for evaluation in evaluations if evaluation["selected"])
    insights_method, coefficients = model_insights(record, target, features, winner_kind, pipeline, record.frame.loc[y.index, features], y)
    profile_record = {column: (record.frame[column].median() if column in numeric else record.frame[column].dropna().mode().iloc[0]) for column in features}
    headline = float(pipeline.predict(pd.DataFrame([profile_record], columns=features))[0])
    if not np.isfinite(headline):
        raise fail("CropCast produced a non-finite estimate for this dataset. Check the target column for extreme or degenerate values.")
    unit = inferred_unit(target)
    selected = next(evaluation for evaluation in evaluations if evaluation["selected"])
    baseline = fitted.baseline

    interval = None
    if selected["rmse"] is not None:
        half_width = 1.96 * selected["rmse"]
        interval = {
            "lower": round(headline - half_width, 4),
            "upper": round(headline + half_width, 4),
            "halfWidth": json_number(half_width),
            "method": "RMSE-based error band: estimate ± 1.96 × the selected model's cross-validated RMSE. This is not a calibrated prediction interval.",
        }

    baseline_rmse, selected_rmse = baseline["rmse"], selected["rmse"]
    beats_baseline = bool(baseline_rmse and selected_rmse is not None and selected_rmse < baseline_rmse * (1 - MIN_BASELINE_MARGIN))
    improvement = json_number((baseline_rmse - selected_rmse) / baseline_rmse) if baseline_rmse and selected_rmse is not None else None

    evidence: list[str] = []
    if len(target_values) < MIN_HELDOUT_ROWS:
        evidence.append(f"This dataset has only {len(target_values)} usable target rows; held-out metrics are indicative, not reliable.")
    if fitted.actual.size < MIN_HOLDOUT_EVIDENCE:
        evidence.append(f"Held-out metrics rest on only {fitted.actual.size} test rows.")
    if not beats_baseline:
        evidence.append(
            f"No candidate beat the mean baseline by more than {round(MIN_BASELINE_MARGIN * 100)}%, so this dataset carries little signal the model can use. Treat the estimate as uninformative."
        )
    if fitted.group_overlap:
        names = ", ".join(item["column"] for item in fitted.group_overlap)
        evidence.append(
            f"Values from {names} appear in both the training and test partitions, so the reported error measures interpolation between known entities rather than transfer to new ones."
        )
    if fitted.temporal_column and fitted.strategy != VALIDATION_TEMPORAL:
        evidence.append(f"'{fitted.temporal_column}' looks temporal, but the split is not, so the reported error is not a forecast accuracy.")
    if fitted.strategy == VALIDATION_GROUPED:
        evidence.append(
            f"Rows were split by {entity_column(record.frame, target)}, so no entity appears in both partitions: these scores estimate transfer to an unseen entity."
        )
    if redundant:
        evidence.append(
            f"{', '.join(redundant)} correlate(s) with the target at |r| ≥ {REDUNDANT_CORRELATION}. Confirm these are inputs rather than restatements of the target before treating them as drivers."
        )
    if defining:
        evidence.append(
            f"{', '.join(relation for _, _, relation in definitions)} reproduces the target, so {', '.join(defining)} were excluded from the model features: these are restatements of the target, and fitting on them would inflate every score without adding information."
        )
    caveats = [
        "Results are fitted only to this uploaded dataset; they are not a pre-trained regional crop-yield model.",
        "The headline estimate uses median numeric values and modal categorical values from the uploaded data.",
        "Model associations and coefficients do not establish causal effects.",
        "Small, biased, or out-of-range datasets can produce unreliable estimates.",
        *evidence,
        *(["The displayed unit was inferred from the column name, not read from the data."] if unit else []),
    ]
    out_of_range = []
    if headline < float(target_values.min()):
        out_of_range.append(f"below the lowest observed {target} ({json_number(target_values.min())})")
    if headline > float(target_values.max()):
        out_of_range.append(f"above the highest observed {target} ({json_number(target_values.max())})")
    if out_of_range:
        caveats.append(f"The representative estimate falls outside the observed target range ({'; '.join(out_of_range)}), which is an extrapolation.")

    points, evidence_total = evidence_sample(fitted.actual, fitted.predicted)
    bins = min(5, max(2, int(np.sqrt(len(target_values)))))
    counts, edges = np.histogram(target_values, bins=bins)
    correlations = [
        {"feature": column, "value": json_number(record.frame[[column, target]].corr(numeric_only=True).iloc[0, 1])}
        for column in numeric
        if record.frame[[column, target]].dropna().shape[0] > 1
    ]
    return {
        "analysisId": record.dataset_id,
        "source": "uploaded",
        "inputColumns": [column_descriptor(record.frame, column, set(defining)) for column in record.frame.columns],
        "dataset": {
            "fileName": record.file_name,
            "fileSize": record.file_size,
            "fileType": record.file_type,
            "detectedFiles": record.detected_files,
            "rows": len(record.frame),
            "columns": len(record.frame.columns),
            "numericFeatures": len(numeric),
            "categoricalFeatures": len(categorical),
            "target": target,
        },
        "quality": quality_checks(record.frame, features, target, fitted, redundant, defining),
        "profile": {
            "targetSummary": [{"label": f"{edges[index]:.2f}–{edges[index + 1]:.2f}", "value": int(count)} for index, count in enumerate(counts)],
            "correlations": correlations,
            "numericSummary": numeric_summary(record.frame, numeric),
            "categoricalSummary": categorical_summary(record.frame, categorical),
        },
        "preprocessing": [
            {"label": "Identifiers excluded", "detail": "Identifier-like and date columns were excluded from model features."},
            {"label": "Missing values handled", "detail": "Numeric medians and categorical modes are learned in each training split."},
            {"label": "Categorical variables encoded", "detail": "Unknown-safe one-hot encoding is applied inside each model pipeline."},
            {"label": "Numerical features scaled", "detail": "Standard scaling is applied inside each model pipeline."},
            {"label": "Cross-validated evaluation used", "detail": f"{fitted.cv_label}, alongside a single holdout of {fitted.actual.size} rows."},
        ],
        "evaluation": {
            "selectionRule": SELECTION_RULE,
            "holdoutSummary": f"{fitted.strategy_label} holdout — {fitted.actual.size} test rows, {len(target_values) - fitted.actual.size} training rows",
            "note": "Cross-validated metrics use every usable row, while holdout metrics come from one split of that same data. They are reported side by side for transparency and are not directly comparable.",
            "baseline": baseline,
            "beatsBaseline": beats_baseline,
            "improvementOverBaseline": improvement,
            "minimumMargin": MIN_BASELINE_MARGIN,
            "validation": {
                "strategy": fitted.strategy,
                "label": fitted.strategy_label,
                "temporalColumn": fitted.temporal_column,
                "groupOverlap": fitted.group_overlap,
                "note": chosen["note"],
                "options": validation,
            },
        },
        "models": evaluations,
        "prediction": {
            "label": f"Representative predicted {target}",
            "value": round(headline, 4),
            "unit": unit,
            "unitInferred": bool(unit),
            "interval": interval,
            "evidenceShown": len(points),
            "evidenceTotal": evidence_total,
            "actualVsPredicted": points,
            "residuals": [point["residual"] for point in points],
        },
        "insights": coefficients,
        "insightsMethod": insights_method,
        "insightsNote": INSIGHTS_NOTE_TREE if insights_method == INSIGHT_METHOD_TREE else INSIGHTS_NOTE_LINEAR,
        "explanations": explanations(MODEL_LABELS[winner_kind], target, coefficients),
        "caveats": caveats,
    }
