"""Verify the reported numbers, not just their shape.

`test_api.py` proves the report is well-formed: fields exist, the selected model is the minimum of the
reported values, and the error band matches the reported RMSE. Those assertions all compare the report to
itself, so a fault in the fold logic, the target alignment, or the metric would round-trip unnoticed.

Everything here compares a reported number against an external source of truth instead:

- `sklearn`'s own `cross_val_predict`, as a reference implementation of out-of-fold prediction
- an analytically known relationship, where the correct score is derivable by hand
- a real published dataset with an independently reproduced score and a documented literature band
"""

from io import BytesIO

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sklearn.datasets import load_diabetes
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.preprocessing import StandardScaler

import backend.app.analysis as analysis
from backend.app.main import app

client = TestClient(app)

SAMPLE_DATASET = "public/sample-datasets/sample-field-trials.csv"


def upload(frame: pd.DataFrame, name: str = "ground-truth.csv"):
    body = frame.to_csv(index=False).encode()
    return client.post("/dataset/analyze", files={"file": (name, BytesIO(body), "text/csv")}).json()


def report_for(frame: pd.DataFrame, target: str | None = None):
    """Analyze a frame, answering the target question when CropCast asks for one."""
    payload = upload(frame)
    if target and payload.get("status") == "needs-target":
        payload = client.post("/analysis/run", json={"analysisId": payload["analysisId"], "target": target}).json()
    return payload


def quality_check(report: dict, label: str) -> dict:
    return next(check for check in report["quality"] if check["label"] == label)


def model(report: dict, kind: str) -> dict:
    return next(item for item in report["models"] if item["model"] == kind)


# --------------------------------------------------------------------------------------------------
# The hand-built out-of-fold loop, checked against sklearn's reference implementation
# --------------------------------------------------------------------------------------------------


def test_hand_built_cross_validation_matches_sklearn_reference():
    """`cross_validated` replaced `cross_val_predict`, which refuses a forward-chaining split.

    The replacement assembles the out-of-fold array by hand, so it is exactly the kind of code that can
    misalign folds or leak test rows into training while still producing plausible scores. For the
    partition strategies `cross_val_predict` does support, the two must agree exactly.
    """
    # A 120-row slice keeps this fast; fold-agreement does not depend on dataset size.
    frame = pd.read_csv(SAMPLE_DATASET).iloc[:120]
    target = "yield_t_ha"
    features = analysis.usable_features(frame, target)
    record = analysis.DatasetRecord(dataset_id="ground-truth", frame=frame, file_name="sample.csv", file_size=1, file_type="CSV", detected_files=[])
    usable, y = analysis.target_rows(record, target, features)

    for strategy in (analysis.VALIDATION_RANDOM, analysis.VALIDATION_GROUPED):
        split = analysis.validation_split(frame, usable, y, target, strategy)
        for kind, _, estimator, _ in analysis.MODEL_DEFINITIONS:
            ours, scored_targets = analysis.cross_validated(usable, y, features, estimator, split.cv)
            reference = cross_val_predict(analysis.make_pipeline(frame, features, estimator), usable, y, cv=split.cv)

            assert np.array_equal(ours, reference), f"{strategy}/{kind} disagreed with cross_val_predict"
            # A partition covers every row, so the returned targets must be the rows in their original order.
            # If the predictions were paired with the wrong targets the scores would still look plausible.
            assert np.array_equal(scored_targets, y.to_numpy())


def test_forward_chaining_folds_never_train_on_later_rows():
    """Temporal validation is only a forecast test if every fold trains strictly before it tests."""
    frame = pd.read_csv(SAMPLE_DATASET)
    target = "yield_t_ha"
    features = analysis.usable_features(frame, target)
    record = analysis.DatasetRecord(dataset_id="ground-truth", frame=frame, file_name="sample.csv", file_size=1, file_type="CSV", detected_files=[])
    usable, y = analysis.target_rows(record, target, features)
    split = analysis.validation_split(frame, usable, y, target, analysis.VALIDATION_TEMPORAL)

    column = analysis.ordering_column(frame, target)
    assert column is not None, "the sample dataset has a date column, so temporal ordering must be available"
    order = analysis.temporal_order(usable, column)
    rank = {int(position): index for index, position in enumerate(order)}

    for train, test in split.cv:
        assert max(rank[int(position)] for position in train) < min(rank[int(position)] for position in test)

    # Forward chaining cannot score the earliest block, so only the later rows are covered.
    covered = sorted(int(position) for _, test in split.cv for position in test)
    assert len(covered) == len(set(covered))
    assert set(covered) == {int(position) for position in order[len(order) - len(covered) :]}
    assert str(len(covered)) in split.cv_label


# --------------------------------------------------------------------------------------------------
# Analytically known relationships
# --------------------------------------------------------------------------------------------------


def test_a_noise_free_linear_signal_is_recovered():
    """With no noise, the correct answer is known: an R² of 1 and an error of 0.

    The models are regularised, so they cannot reach 1 exactly, but anything below 0.99 would mean the
    pipeline is losing signal it was handed.
    """
    rng = np.random.default_rng(3)
    rainfall = rng.uniform(400, 1200, 60)
    frame = pd.DataFrame({"rainfall": rainfall, "yield": 3 + 0.004 * rainfall})

    report = report_for(frame)

    for kind in ("ridge", "lasso", "elastic-net", "random-forest"):
        assert model(report, kind)["r2"] > 0.99, kind
        # Lasso carries the largest regularisation bias here (~0.05 on a target spanning ~4.8 units);
        # anything under 0.1 still means the handed-over signal was essentially fully recovered.
        assert model(report, kind)["rmse"] < 0.1, kind
    assert report["evaluation"]["beatsBaseline"] is True
    # A mean predictor cannot explain a deterministic relationship, so the baseline must score ~0 or worse.
    assert report["evaluation"]["baseline"]["r2"] < 0.1


def test_a_target_independent_of_its_features_beats_no_baseline():
    """With no signal the honest score is ~0, and the report must refuse to crown a winner."""
    rng = np.random.default_rng(23)
    frame = pd.DataFrame(
        {
            "rainfall": rng.uniform(400, 1200, 200),
            "temperature": rng.uniform(10, 35, 200),
            "yield": rng.normal(5, 1, 200),
        }
    )

    report = report_for(frame)

    assert report["evaluation"]["beatsBaseline"] is False
    assert report["evaluation"]["improvementOverBaseline"] <= analysis.MIN_BASELINE_MARGIN
    assert any("little signal" in caveat for caveat in report["caveats"])
    # Cross-validated R² on random data sits at or below zero; a positive value would mean leakage.
    for item in report["models"]:
        assert item["r2"] <= 0.1, item["model"]


def test_a_column_that_restates_the_target_is_flagged_as_redundancy():
    """A column computed from the target is leakage, and the report has to say so out loud.

    `prior_yield` is the target plus 0.1% noise, so it carries no information a real model could use
    yet correlates at |r| ~ 1. Picking it up as a driver would be a serious, quiet failure.
    """
    rng = np.random.default_rng(11)
    rainfall = rng.uniform(400, 1200, 60)
    yield_values = 3 + 0.004 * rainfall + rng.normal(0, 1.0, 60)
    frame = pd.DataFrame(
        {
            "rainfall": rainfall,
            "yield": yield_values,
            "prior_yield": yield_values + rng.normal(0, 0.001, 60),
        }
    )

    # `prior_yield` contains a target word, so CropCast correctly asks rather than guessing between
    # it and `yield`; the test answers with the real target so the report is produced.
    report = report_for(frame, target="yield")

    redundancy = quality_check(report, "Target redundancy")
    assert redundancy["status"] == "warning"
    assert redundancy["value"].startswith("1 ")
    assert "prior_yield" in redundancy["detail"]
    # The leak also inflates the scores, which is why flagging it matters rather than discouraging it.
    assert max(item["r2"] for item in report["models"]) > 0.99
    assert any("prior_yield" in caveat for caveat in report["caveats"])


# --------------------------------------------------------------------------------------------------
# The size-adaptive forest budget
# --------------------------------------------------------------------------------------------------


def test_small_datasets_keep_the_full_forest_budget():
    """The adaptive path must not disturb the datasets CropCast was built for."""
    report = report_for(pd.read_csv(SAMPLE_DATASET), target="yield_t_ha")

    forest = model(report, "random-forest")
    assert forest["parameters"] == ["n_estimators = 300", "random_state = 42"]


def test_large_datasets_report_their_reduced_budget_instead_of_the_small_one():
    """A 20k-row file can never finish inside the request deadline with the small-dataset budget.

    Measured on a real 19,689-row harvest dataset, one 300-tree fit takes ~493s and the analysis does
    seven. Above the row threshold the forest must actually switch — and the reported hyperparameters
    must describe the model that was really fitted, not the small-dataset constants.
    """
    rng = np.random.default_rng(4)
    rows = analysis.LARGE_DATASET_ROWS + 200
    frame = pd.DataFrame(
        {
            "rainfall": rng.uniform(400, 1200, rows),
            "temperature": rng.uniform(10, 35, rows),
            "area": rng.uniform(1, 50, rows),
            "yield": rng.normal(5, 1, rows) + 0.002 * rng.uniform(400, 1200, rows),
        }
    )

    report = report_for(frame)

    forest = model(report, "random-forest")
    assert forest["parameters"] == [
        f"n_estimators = {analysis.FOREST_TREES_LARGE}",
        f"max_samples = {analysis.FOREST_BOOTSTRAP_ROWS_LARGE}",
        "random_state = 42",
        "n_jobs = -1",
    ]


def test_importance_on_a_large_dataset_discloses_its_row_sample():
    """Subsampling rows for permutation importance is a shortcut, so the report has to say so.

    The relationship is saturating, which linear models cannot fit, so the Random Forest wins and the
    tree path (the only one that subsamples) actually runs.
    """
    rng = np.random.default_rng(9)
    rows = analysis.LARGE_DATASET_ROWS + 500
    frame = pd.DataFrame({"rainfall": rng.uniform(400, 1200, rows), "pest_pressure": rng.uniform(0, 100, rows)})
    # A saturating response plus a hard threshold step: the step is unlearnable for a linear model
    # but trivial for a tree ensemble, so the Random Forest must win and the tree path must run.
    frame["yield"] = 2 + 6 * (1 - np.exp(-frame["rainfall"] / 300)) - 2.0 * (frame["pest_pressure"] > 50) + rng.normal(0, 0.3, rows)

    report = report_for(frame)

    assert report["insightsMethod"] == analysis.INSIGHT_METHOD_TREE
    assert f"seeded random sample of {analysis.MAX_IMPORTANCE_ROWS:,}" in report["insights"][0]["interpretation"]


# --------------------------------------------------------------------------------------------------
# Reproducibility
# --------------------------------------------------------------------------------------------------


def test_identical_requests_report_identical_scores():
    """Two runs over the same bytes must produce the same numbers, or nothing here is verifiable."""
    rng = np.random.default_rng(5)
    frame = pd.DataFrame(
        {
            "rainfall": rng.uniform(400, 1200, 40),
            "temperature": rng.uniform(10, 35, 40),
            "yield": rng.normal(5, 1, 40) + rng.uniform(400, 1200, 40) * 0.002,
        }
    )

    first, second = report_for(frame), report_for(frame)

    assert first["models"] == second["models"]
    assert first["evaluation"]["baseline"] == second["evaluation"]["baseline"]
    assert first["prediction"]["interval"] == second["prediction"]["interval"]
    assert first["insights"] == second["insights"]


# --------------------------------------------------------------------------------------------------
# A real, published dataset
# --------------------------------------------------------------------------------------------------


def test_a_real_published_dataset_matches_an_independent_score():
    """`load_diabetes` is real data from a published study, bundled with scikit-learn, so no network is needed.

    The reported Ridge score is compared against a from-scratch cross-validation that shares no code with
    the app, and then against the band the literature reports for this dataset. A mislabelled target or a
    misaligned fold would move the score away from both.
    """
    dataset = load_diabetes()
    frame = pd.DataFrame(dataset.data, columns=list(dataset.feature_names))
    frame["disease_progression"] = dataset.target

    report = report_for(frame, target="disease_progression")
    features = analysis.usable_features(frame, "disease_progression")

    # A from-scratch reproduction that shares no code with the app: same splitter, same arithmetic,
    # different implementation. Any fold or target misalignment in the app would show up as a mismatch.
    predicted = np.empty(len(dataset.target))
    splitter = KFold(n_splits=5, shuffle=True, random_state=analysis.RANDOM_STATE)
    for train, test in splitter.split(dataset.data):
        scaler = StandardScaler().fit(dataset.data[train])
        estimator = Ridge(alpha=1.0).fit(scaler.transform(dataset.data[train]), dataset.target[train])
        predicted[test] = estimator.predict(scaler.transform(dataset.data[test]))

    assert model(report, "ridge")["rmse"] == pytest.approx(round(mean_squared_error(dataset.target, predicted) ** 0.5, 4), rel=0.005)
    assert model(report, "ridge")["r2"] == pytest.approx(round(r2_score(dataset.target, predicted), 4), rel=0.01)
    assert len(features) == 10
    # External anchor: Ridge on this dataset is consistently reported near R² 0.4-0.5, well above the mean baseline.
    assert 0.35 < model(report, "ridge")["r2"] < 0.60
    assert report["evaluation"]["beatsBaseline"] is True
    # Body-mass index is the established strongest single predictor here, so it must surface as the top driver.
    assert report["insights"][0]["feature"] == "bmi"
    assert report["insightsMethod"] == analysis.INSIGHT_METHOD_LINEAR
