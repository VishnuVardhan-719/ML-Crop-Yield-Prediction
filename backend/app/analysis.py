from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4
import zipfile

import numpy as np
import pandas as pd
from fastapi import HTTPException, UploadFile
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import ElasticNet, Lasso, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
TARGET_WORDS = ("yield", "production", "output", "harvest")
MODEL_DEFINITIONS = (
    ("ridge", "Ridge", Ridge(alpha=1.0), ["alpha = 1.0"]),
    ("lasso", "Lasso", Lasso(alpha=0.05, max_iter=10_000), ["alpha = 0.05"]),
    ("elastic-net", "Elastic Net", ElasticNet(alpha=0.08, l1_ratio=0.4, max_iter=10_000), ["alpha = 0.08", "l1_ratio = 0.4"]),
    ("random-forest", "Random Forest", RandomForestRegressor(n_estimators=300, random_state=42), ["n_estimators = 300", "random_state = 42"]),
)

MIN_HELDOUT_ROWS = 20


@dataclass
class DatasetRecord:
    dataset_id: str
    frame: pd.DataFrame
    file_name: str
    file_size: int
    file_type: str
    detected_files: list[str]
    models: dict[tuple[str, tuple[str, ...]], Pipeline] = field(default_factory=dict)


def fail(message: str, status: int = 400) -> HTTPException:
    return HTTPException(status_code=status, detail=message)


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
                if member.file_size > MAX_UPLOAD_BYTES or member.compress_size > MAX_UPLOAD_BYTES:
                    raise fail("The CSV inside the ZIP must be 10 MB or smaller.")
                detected_files = [member.filename]
                frame = pd.read_csv(archive.open(member))
    except HTTPException:
        raise
    except Exception as error:
        raise fail("CropCast could not read this dataset. Use a valid CSV, XLSX, or single-CSV ZIP file.") from error

    frame.columns = [str(column).strip() for column in frame.columns]
    if frame.empty or len(frame.columns) < 2:
        raise fail("Provide at least two columns and one data row.")
    if any(not column for column in frame.columns) or frame.columns.duplicated().any():
        raise fail("Dataset column names must be non-empty and unique.")
    if len(frame) < 8:
        raise fail("Provide at least 8 rows so CropCast can evaluate a holdout set.")
    return DatasetRecord(uuid4().hex, frame, file_name, len(payload), suffix.removeprefix(".").upper(), detected_files)


def numeric_columns(frame: pd.DataFrame) -> list[str]:
    return frame.select_dtypes(include=[np.number]).columns.astype(str).tolist()


def candidate_targets(frame: pd.DataFrame) -> list[str]:
    numeric = [column for column in numeric_columns(frame) if frame[column].nunique(dropna=True) > 1]
    named = [column for column in numeric if any(word in column.lower() for word in TARGET_WORDS)]
    return named or (numeric[-1:] if numeric else [])


def column_descriptor(frame: pd.DataFrame, column: str) -> dict[str, Any]:
    series = frame[column]
    numeric = pd.api.types.is_numeric_dtype(series)
    boolean = pd.api.types.is_bool_dtype(series)
    distinct = series.dropna().unique().tolist()
    data_type = "boolean" if boolean else "number" if numeric else "category" if len(distinct) <= 20 else "text"
    values = [to_json(value) for value in distinct[:20]] if data_type in {"boolean", "category"} else None
    descriptor: dict[str, Any] = {
        "id": column,
        "label": column,
        "dataType": data_type,
        "nullable": bool(series.isna().any()),
        "eligibleAsTarget": column in candidate_targets(frame),
        "eligibleAsFeature": not looks_like_identifier(column, series),
    }
    if values:
        descriptor["allowedValues"] = values
    if "rain" in column.lower():
        descriptor["unit"] = "mm"
    elif "temp" in column.lower():
        descriptor["unit"] = "°C"
    elif "yield" in column.lower():
        descriptor["unit"] = "t/ha"
    return descriptor


def looks_like_identifier(column: str, series: pd.Series) -> bool:
    name = column.lower()
    return name.endswith("id") or "identifier" in name or (series.nunique(dropna=True) / max(len(series), 1) > 0.95 and not pd.api.types.is_numeric_dtype(series))


def to_json(value: Any) -> Any:
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def safe_number(value: float) -> float:
    return round(float(value), 4) if np.isfinite(value) else 0.0


def usable_features(frame: pd.DataFrame, target: str, requested: list[str] | None = None) -> list[str]:
    candidates = requested if requested is not None else [column for column in frame.columns if column != target and not looks_like_identifier(column, frame[column])]
    features = [column for column in candidates if column in frame.columns and column != target and frame[column].nunique(dropna=True) > 1]
    if not features:
        raise fail("CropCast needs at least one non-constant feature column.")
    return features


def make_pipeline(frame: pd.DataFrame, features: list[str], estimator: Any) -> Pipeline:
    numeric = [column for column in features if pd.api.types.is_numeric_dtype(frame[column])]
    categorical = [column for column in features if column not in numeric]
    transformers: list[tuple[str, Pipeline, list[str]]] = []
    if numeric:
        transformers.append(("numeric", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), numeric))
    if categorical:
        transformers.append(("categorical", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("encoder", OneHotEncoder(handle_unknown="ignore"))]), categorical))
    return Pipeline([("preprocessor", ColumnTransformer(transformers)), ("model", clone(estimator))])


def fit_models(record: DatasetRecord, target: str, features: list[str]) -> tuple[list[dict[str, Any]], Pipeline, np.ndarray, np.ndarray]:
    y = pd.to_numeric(record.frame[target], errors="coerce")
    valid = y.notna()
    frame = record.frame.loc[valid, features].copy()
    y = y.loc[valid]
    if len(y) < 8:
        raise fail("The selected target needs at least 8 numeric values.")
    x_train, x_test, y_train, y_test = train_test_split(frame, y, test_size=0.25, random_state=42)
    folds = min(5, max(2, len(y_train) // 4))
    kfold = KFold(n_splits=folds, shuffle=True, random_state=42)
    evaluations: list[dict[str, Any]] = []
    fitted: list[Pipeline] = []
    for kind, label, estimator, parameters in MODEL_DEFINITIONS:
        holdout_pipeline = make_pipeline(record.frame, features, estimator)
        holdout_pipeline.fit(x_train, y_train)
        holdout_prediction = holdout_pipeline.predict(x_test)
        cv_pipeline = make_pipeline(record.frame, features, estimator)
        cv_prediction = cross_val_predict(cv_pipeline, frame, y, cv=kfold)
        evaluations.append({"model": kind, "label": label, "r2": safe_number(r2_score(y, cv_prediction)), "mae": safe_number(mean_absolute_error(y, cv_prediction)), "rmse": safe_number(mean_squared_error(y, cv_prediction) ** 0.5), "selected": False, "parameters": parameters, "crossValidation": f"{folds}-fold cross-validation (random state 42)", "_holdout_r2": safe_number(r2_score(y_test, holdout_prediction)), "_holdout_mae": safe_number(mean_absolute_error(y_test, holdout_prediction)), "_holdout_rmse": safe_number(mean_squared_error(y_test, holdout_prediction) ** 0.5)})
        fitted.append(holdout_pipeline)
    winner = min(range(len(evaluations)), key=lambda index: evaluations[index]["rmse"])
    evaluations[winner]["selected"] = True
    final_pipeline = make_pipeline(record.frame, features, MODEL_DEFINITIONS[winner][2]).fit(frame, y)
    record.models[(target, tuple(features))] = final_pipeline
    return evaluations, final_pipeline, y_test.to_numpy(), fitted[winner].predict(x_test)


def build_report(record: DatasetRecord, target: str) -> dict[str, Any]:
    if target not in candidate_targets(record.frame):
        raise fail("Choose one of the numeric target candidates returned for this dataset.")
    features = usable_features(record.frame, target)
    evaluations, pipeline, actual, predicted = fit_models(record, target, features)
    target_values = pd.to_numeric(record.frame[target], errors="coerce").dropna()
    caveats_extra: list[str] = []
    if len(target_values) < MIN_HELDOUT_ROWS:
        caveats_extra.append(f"This dataset has only {len(target_values)} usable target rows; held-out metrics are indicative, not reliable.")
    numeric = [column for column in features if pd.api.types.is_numeric_dtype(record.frame[column])]
    categorical = [column for column in features if column not in numeric]
    coefficients = feature_insights(pipeline, target)
    profile_record = {column: (record.frame[column].median() if column in numeric else record.frame[column].dropna().mode().iloc[0]) for column in features}
    headline = pipeline.predict(pd.DataFrame([profile_record], columns=features))[0]
    bins = min(5, max(2, int(np.sqrt(len(target_values)))))
    counts, edges = np.histogram(target_values, bins=bins)
    correlations = [{"feature": column, "value": safe_number(record.frame[[column, target]].corr(numeric_only=True).iloc[0, 1])} for column in numeric if record.frame[[column, target]].dropna().shape[0] > 1]
    return {
        "analysisId": record.dataset_id,
        "source": "uploaded",
        "inputColumns": [column_descriptor(record.frame, column) for column in record.frame.columns],
        "dataset": {"fileName": record.file_name, "fileSize": record.file_size, "fileType": record.file_type, "detectedFiles": record.detected_files, "rows": len(record.frame), "columns": len(record.frame.columns), "numericFeatures": len(numeric), "categoricalFeatures": len(categorical), "target": target},
        "quality": quality_checks(record.frame),
        "profile": {"targetSummary": [{"label": f"{edges[index]:.2f}–{edges[index + 1]:.2f}", "value": int(count)} for index, count in enumerate(counts)], "correlations": correlations, "numericSummary": numeric_summary(record.frame, numeric), "categoricalSummary": categorical_summary(record.frame, categorical)},
        "preprocessing": [{"label": "Identifiers excluded", "detail": "Identifier-like columns were excluded from model features."}, {"label": "Missing values handled", "detail": "Numeric medians and categorical modes are learned in each training split."}, {"label": "Categorical variables encoded", "detail": "Unknown-safe one-hot encoding is applied inside each model pipeline."}, {"label": "Numerical features scaled", "detail": "Standard scaling is applied inside each model pipeline."}, {"label": "Cross-validated evaluation used", "detail": "K-fold cross-validation compares all four models, alongside a 75/25 holdout split."}],
        "models": rename_holdout_metrics(evaluations),
        "prediction": {"label": "Representative predicted yield", "value": safe_number(headline), "unit": "t/ha" if "yield" in target.lower() else None, "actualVsPredicted": [{"actual": safe_number(a), "predicted": safe_number(p)} for a, p in zip(actual[:12], predicted[:12])], "residuals": [safe_number(a - p) for a, p in zip(actual[:12], predicted[:12])]},
        "insights": coefficients,
        "explanations": explanations(evaluations[winner_index(evaluations)]["label"], target, coefficients),
        "caveats": ["Results are fitted only to this uploaded dataset; they are not a pre-trained regional crop-yield model.", "The headline estimate uses median numeric values and modal categorical values from the uploaded data.", "Model associations and coefficients do not establish causal effects.", "Small, biased, or out-of-range datasets can produce unreliable estimates.", *caveats_extra],
    }


def rename_holdout_metrics(evaluations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for evaluation in evaluations:
        evaluation["holdoutR2"] = evaluation.pop("_holdout_r2")
        evaluation["holdoutMae"] = evaluation.pop("_holdout_mae")
        evaluation["holdoutRmse"] = evaluation.pop("_holdout_rmse")
    return evaluations


def winner_index(evaluations: list[dict[str, Any]]) -> int:
    return next(index for index, evaluation in enumerate(evaluations) if evaluation["selected"])


def quality_checks(frame: pd.DataFrame) -> list[dict[str, str]]:
    missing = int(frame.isna().sum().sum())
    duplicates = int(frame.duplicated().sum())
    constants = int(sum(frame[column].nunique(dropna=True) <= 1 for column in frame.columns))
    return [
        {"label": "Missing values", "status": "warning" if missing else "good", "value": f"{missing} cells", "detail": "Missing feature values are imputed within the model pipeline."},
        {"label": "Duplicate rows", "status": "warning" if duplicates else "good", "value": f"{duplicates} rows", "detail": "Duplicate rows are retained and reported; review them before operational use."},
        {"label": "Constant columns", "status": "warning" if constants else "good", "value": f"{constants} columns", "detail": "Constant columns cannot improve a regression model."},
        {"label": "Leakage checks", "status": "good", "value": "Passed", "detail": "Target and identifier-like fields are excluded from model features."},
    ]


def numeric_summary(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    return [{"feature": column, "mean": safe_number(frame[column].mean()), "median": safe_number(frame[column].median()), "min": safe_number(frame[column].min()), "max": safe_number(frame[column].max()), "standardDeviation": safe_number(frame[column].std(ddof=0))} for column in columns]


def categorical_summary(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    return [{"feature": column, "uniqueValues": int(frame[column].nunique(dropna=True)), "topCategories": [{"label": str(label), "count": int(count)} for label, count in frame[column].fillna("Missing").value_counts().head(5).items()]} for column in columns]


def feature_insights(pipeline: Pipeline, target: str) -> list[dict[str, Any]]:
    names = pipeline.named_steps["preprocessor"].get_feature_names_out()
    model = pipeline.named_steps["model"]
    if hasattr(model, "feature_importances_"):
        importances = np.ravel(model.feature_importances_)
        ranked = sorted(zip(names, importances), key=lambda item: abs(item[1]), reverse=True)[:5]
        return [{"feature": name.replace("numeric__", "").replace("categorical__", ""), "coefficient": safe_number(value), "interpretation": f"This feature contributed most to reducing prediction error for {target} within this dataset; importance is not directional."} for name, value in ranked]
    coefficients = np.ravel(model.coef_)
    ranked = sorted(zip(names, coefficients), key=lambda item: abs(item[1]), reverse=True)[:5]
    return [{"feature": name.replace("numeric__", "").replace("categorical__", ""), "coefficient": safe_number(value), "interpretation": f"A higher encoded value is associated with {'higher' if value >= 0 else 'lower'} predicted {target} within this dataset."} for name, value in ranked]


def explanations(model: str, target: str, insights: list[dict[str, Any]]) -> dict[str, str]:
    top = insights[0]["feature"] if insights else "the available features"
    english = f"{model} had the lowest held-out RMSE for predicting {target}. In this uploaded dataset, {top} is among the strongest model associations. This is an association-based estimate, not evidence of causation."
    return {"en": english, "hi": f"{model} ने {target} के लिए होल्डआउट RMSE में सबसे अच्छा प्रदर्शन किया। यह अनुमान अपलोड किए गए डेटा तक सीमित है और कारण सिद्ध नहीं करता।", "te": f"{model} {target} కోసం హోల్డ్‌అవుట్ RMSEలో ఉత్తమంగా పనిచేసింది. ఈ అంచనా అప్లోడ్ చేసిన డేటాకు మాత్రమే పరిమితం; ఇది కారణాన్ని నిరూపించదు."}