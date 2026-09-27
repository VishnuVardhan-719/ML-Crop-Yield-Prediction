from collections import OrderedDict
from io import BytesIO
from zipfile import ZipFile

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import backend.app.analysis as analysis
import backend.app.main as main
from backend.app.analysis import classify_series, json_number, looks_like_identifier
from backend.app.main import MAX_DATASETS, STORE_TTL_SECONDS, app, load, store

client = TestClient(app)

SINGLE_TARGET_CSV = b"rainfall,temperature,soil,yield\n600,24,loam,3.1\n700,25,clay,3.8\n800,26,loam,4.4\n900,27,sandy,4.7\n1000,28,clay,5.1\n1100,29,loam,5.5\n1200,30,sandy,5.8\n1300,31,clay,6.2\n"
AMBIGUOUS_CSV = b"rainfall,yield,production\n600,3.1,310\n700,3.8,380\n800,4.4,440\n900,4.7,470\n1000,5.1,510\n1100,5.5,550\n1200,5.8,580\n1300,6.2,620\n"
# No column name matches a crop-output word, so CropCast must ask rather than guess the last numeric column.
UNNAMED_TARGET_CSV = b"rainfall,humidity,canopy_cover\n600,71,0.4\n700,68,0.5\n800,74,0.6\n900,66,0.7\n1000,80,0.8\n1100,63,0.9\n1200,85,1.0\n1300,60,1.1\n"
IDENTIFIER_CSV = b"yield,farm_id,planted_on\n3.1,P-1,2024-01-05\n3.8,P-2,2024-01-06\n4.4,P-3,2024-01-07\n4.7,P-4,2024-01-08\n5.1,P-5,2024-01-09\n5.5,P-6,2024-01-10\n5.8,P-7,2024-01-11\n6.2,P-8,2024-01-12\n"
BOOLEAN_FEATURE_CSV = (
    b"rainfall,irrigated,yield\n600,True,3.1\n700,False,3.8\n800,True,4.4\n900,False,4.7\n1000,True,5.1\n1100,False,5.5\n1200,True,5.8\n1300,False,6.2\n"
)


def upload(path: str, content: bytes, name: str = "field.csv"):
    return client.post(path, files={"file": (name, BytesIO(content), "text/csv")})


def predict(dataset_id: str, **overrides):
    payload = {
        "datasetId": dataset_id,
        "targetColumnId": "yield",
        "featureColumnIds": ["rainfall", "temperature", "soil"],
        "model": "ridge",
        "inputRecord": {"rainfall": 950, "temperature": 27, "soil": "loam"},
    }
    payload.update(overrides)
    return client.post("/predictions", json=payload)


def analyze(content: bytes, target: str | None = None, name: str = "field.csv"):
    """Analyze an upload, resuming with an explicit target when the dataset is ambiguous."""
    payload = upload("/dataset/analyze", content, name).json()
    if target and payload.get("status") == "needs-target":
        return client.post("/analysis/run", json={"analysisId": payload["analysisId"], "target": target}).json()
    return payload


def make_zip(entries: dict[str, bytes]) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def test_health_reports_ready_status():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analysis_rejects_a_non_tabular_upload():
    response = upload("/dataset/analyze", b"not a dataset", "notes.txt")

    assert response.status_code == 400
    assert response.json()["detail"] == "Upload a CSV, XLSX, or ZIP file containing one CSV file."


def test_analysis_returns_a_real_report_for_one_numeric_target():
    response = upload("/dataset/analyze", SINGLE_TARGET_CSV)

    assert response.status_code == 200
    report = response.json()
    assert report["source"] == "uploaded"
    assert report["dataset"]["target"] == "yield"
    assert len(report["models"]) == 4
    assert sum(model["selected"] for model in report["models"]) == 1
    assert {model["model"] for model in report["models"]} == {"ridge", "lasso", "elastic-net", "random-forest"}
    assert all(model["holdoutRmse"] is not None for model in report["models"])
    assert any("only 8 usable target rows" in caveat for caveat in report["caveats"])
    assert report["prediction"]["actualVsPredicted"]
    assert any(column["id"] == "rainfall" and column["eligibleAsFeature"] for column in report["inputColumns"])


def test_selected_model_is_the_one_with_the_lowest_cross_validated_rmse():
    report = upload("/dataset/analyze", SINGLE_TARGET_CSV).json()

    scored = [model for model in report["models"] if model["rmse"] is not None]
    best = min(scored, key=lambda model: model["rmse"])
    selected = [model for model in report["models"] if model["selected"]]

    assert [model["model"] for model in selected] == [best["model"]]
    assert report["evaluation"]["selectionRule"]


def test_missing_metrics_are_null_rather_than_zero():
    assert json_number(float("nan")) is None
    assert json_number(float("inf")) is None
    assert json_number(None) is None
    assert json_number(0.0) == 0.0
    assert json_number(1.23456) == 1.2346


def test_identifier_detection_keeps_measurements_and_drops_real_identifiers():
    numeric = pd.Series([1.0, 2.0, 3.0, 4.0])

    # Regression guard: `endswith("id")` used to silently drop these real measurements.
    assert looks_like_identifier("humid", numeric) is False
    assert looks_like_identifier("grid_position", numeric) is False
    assert looks_like_identifier("rapid_growth", numeric) is False
    assert looks_like_identifier("farm_id", numeric) is True
    assert looks_like_identifier("record identifier", numeric) is True
    assert looks_like_identifier("unnamed: 0", pd.Series(["a", "b"])) is True


def test_identifier_and_date_columns_are_not_offered_as_features():
    columns = {column["id"]: column for column in upload("/datasets", IDENTIFIER_CSV).json()["columns"]}

    assert columns["farm_id"]["eligibleAsFeature"] is False
    assert columns["farm_id"]["eligibleAsTarget"] is False
    assert columns["planted_on"]["eligibleAsFeature"] is False


def test_boolean_columns_stay_usable_features_but_are_never_targets():
    columns = {column["id"]: column for column in upload("/datasets", BOOLEAN_FEATURE_CSV).json()["columns"]}

    assert columns["irrigated"]["eligibleAsFeature"] is True
    assert columns["irrigated"]["dataType"] == "boolean"
    assert columns["irrigated"]["eligibleAsTarget"] is False


def test_prediction_accepts_a_boolean_feature_value():
    dataset = upload("/datasets", BOOLEAN_FEATURE_CSV).json()

    response = predict(
        dataset["datasetId"],
        targetColumnId="yield",
        featureColumnIds=["rainfall", "irrigated"],
        inputRecord={"rainfall": 950, "irrigated": True},
    )

    assert response.status_code == 200
    assert isinstance(response.json()["value"], float)


def test_column_types_cover_integer_boolean_date_and_text():
    assert classify_series(pd.Series([1, 2, 3])) == "integer"
    assert classify_series(pd.Series([1.5, 2.5])) == "number"
    assert classify_series(pd.Series([True, False])) == "boolean"
    assert classify_series(pd.to_datetime(pd.Series(["2024-01-05", "2024-01-06"]))) == "date"
    assert classify_series(pd.Series(["loam", "clay"])) == "category"
    # The boundary is the module constant, so raising it cannot leave a stale magic number here.
    assert classify_series(pd.Series([f"name-{index}" for index in range(analysis.MAX_CATEGORY_LEVELS)])) == "category"
    assert classify_series(pd.Series([f"name-{index}" for index in range(analysis.MAX_CATEGORY_LEVELS + 1)])) == "text"


def test_analysis_asks_for_a_target_instead_of_guessing_the_last_numeric_column():
    response = upload("/dataset/analyze", UNNAMED_TARGET_CSV)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "needs-target"
    assert payload["candidates"] == ["rainfall", "humidity", "canopy_cover"]


def test_inferred_units_are_labelled_as_inferred():
    report = upload("/dataset/analyze", SINGLE_TARGET_CSV).json()

    assert report["prediction"]["unit"] == "t/ha"
    assert report["prediction"]["unitInferred"] is True
    assert any("inferred from the column name" in caveat for caveat in report["caveats"])
    assert any(column["id"] == "rainfall" and column["unitInferred"] for column in report["inputColumns"])


def test_prediction_accepts_string_values_and_handles_missing_and_unseen_ones():
    dataset = upload("/datasets", SINGLE_TARGET_CSV).json()

    response = predict(
        dataset["datasetId"],
        inputRecord={"rainfall": "950", "temperature": None, "soil": "unseen-soil"},
    )

    assert response.status_code == 200
    assert isinstance(response.json()["value"], float)


def test_prediction_rejects_an_ineligible_target_before_other_work():
    dataset = upload("/datasets", SINGLE_TARGET_CSV).json()

    response = predict(dataset["datasetId"], targetColumnId="soil", featureColumnIds=["rainfall"], inputRecord={"rainfall": 950})

    assert response.status_code == 400
    assert response.json()["detail"] == "Choose one of the numeric target candidates returned for this dataset."


def test_unknown_dataset_reports_a_clear_404():
    response = predict("does-not-exist")

    assert response.status_code == 404
    assert response.json()["detail"] == "This dataset is no longer available. Upload it again."


def test_prediction_with_random_forest_works_end_to_end():
    dataset = upload("/datasets", SINGLE_TARGET_CSV).json()

    prediction = predict(dataset["datasetId"], model="random-forest")
    assert prediction.status_code == 200
    prediction_data = prediction.json()
    assert prediction_data["model"] == "random-forest"
    assert isinstance(prediction_data["value"], float)

    explanation = client.post("/explanations", json={"predictionId": prediction_data["predictionId"], "language": "en"})
    assert explanation.status_code == 200
    text = explanation.json()["text"]
    assert "Random Forest" in text
    assert "cross-validated" in text


def test_explanation_for_an_unknown_prediction_reports_a_404():
    response = client.post("/explanations", json={"predictionId": "missing", "language": "en"})

    assert response.status_code == 404


def test_analysis_requests_target_selection_when_multiple_numeric_targets_exist():
    response = upload("/dataset/analyze", AMBIGUOUS_CSV)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "needs-target"
    assert payload["candidates"] == ["yield", "production"]

    resumed = client.post("/analysis/run", json={"analysisId": payload["analysisId"], "target": "yield"})
    assert resumed.status_code == 200
    assert resumed.json()["dataset"]["target"] == "yield"


def test_zip_with_a_single_csv_is_accepted_and_two_csvs_are_rejected():
    accepted = client.post("/dataset/analyze", files={"file": ("bundle.zip", make_zip({"field.csv": SINGLE_TARGET_CSV}), "application/zip")})
    assert accepted.status_code == 200
    assert accepted.json()["dataset"]["detectedFiles"] == ["field.csv"]

    rejected = client.post(
        "/dataset/analyze", files={"file": ("bundle.zip", make_zip({"a.csv": SINGLE_TARGET_CSV, "b.csv": SINGLE_TARGET_CSV}), "application/zip")}
    )
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "ZIP uploads must contain exactly one CSV file."


def test_dataset_prediction_and_explanation_endpoints_use_a_fitted_model():
    dataset = upload("/datasets", SINGLE_TARGET_CSV).json()
    assert dataset["columnCount"] == 4
    assert any(column["id"] == "yield" and column["eligibleAsTarget"] for column in dataset["columns"])

    prediction = predict(dataset["datasetId"])
    assert prediction.status_code == 200
    prediction_data = prediction.json()
    assert prediction_data["model"] == "ridge"
    assert isinstance(prediction_data["value"], float)

    explanation = client.post("/explanations", json={"predictionId": prediction_data["predictionId"], "language": "en"})
    assert explanation.status_code == 200
    assert "Ridge" in explanation.json()["text"]


GROUPED_CSV = b"plot_id,rainfall,fertiliser,yield\n" + b"".join(
    f"P{plot:02d},{600 + plot * 20},{100 + plot},{3.0 + plot / 40:.3f}\n".encode() for plot in range(1, 13) for _ in range(2)
)
# Two target-like names: the caller has to choose one, so this exercises the resume path.
REDUNDANT_CSV = b"yield,rainfall,yield_last_year\n" + b"".join(
    f"{3.0 + index * 0.1:.2f},{600 + index * 10},{2.9 + index * 0.1:.2f}\n".encode() for index in range(12)
)
# The target cycles on a period that lines up with neither feature, so nothing can beat the mean.
_NO_SIGNAL_CYCLE = (3.1, 4.4, 2.9, 5.2, 3.6, 4.8, 2.7, 5.5)
NO_SIGNAL_CSV = b"yield,rainfall,plot_code\n" + b"".join(
    f"{_NO_SIGNAL_CYCLE[index % len(_NO_SIGNAL_CYCLE)]},{600 + (index * 37) % 260},{(index * 5) % 7}\n".encode() for index in range(32)
)
# `region` has three levels and repeats across any split; that is normal for a feature, not a leak.
# `rainfall` cycles rather than rising monotonically, so it is not itself a restatement of the target.
CATEGORICAL_CSV = b"yield,region,rainfall\n" + b"".join(
    f"{3.0 + index * 0.25:.2f},{('North', 'South', 'East')[index % 3]},{600 + (index * 137) % 400}\n".encode() for index in range(16)
)


def test_report_includes_a_mean_baseline_and_the_improvement_over_it():
    report = upload("/dataset/analyze", SINGLE_TARGET_CSV).json()
    evaluation = report["evaluation"]

    # The baseline predicts the mean, so its cross-validated R2 is at best 0 and usually negative.
    assert evaluation["baseline"]["label"] == "Baseline (predict the mean)"
    assert evaluation["baseline"]["rmse"] is not None
    assert evaluation["baseline"]["r2"] <= 0.05
    assert evaluation["beatsBaseline"] is True
    assert evaluation["improvementOverBaseline"] > 0


def test_models_that_cannot_beat_the_baseline_are_reported_as_such():
    report = analyze(NO_SIGNAL_CSV)

    # This dataset's target is unrelated to its features, so no honest report can claim a useful model.
    assert report["source"] == "uploaded"
    assert report["evaluation"]["beatsBaseline"] is False
    assert report["evaluation"]["improvementOverBaseline"] < 0
    assert any("beat the mean baseline" in caveat and "little signal" in caveat for caveat in report["caveats"])


def test_target_redundancy_is_flagged_as_a_leakage_risk():
    report = analyze(REDUNDANT_CSV, target="yield")

    check = next(item for item in report["quality"] if item["label"] == "Target redundancy")
    assert check["status"] == "warning"
    assert "yield_last_year" in check["detail"]
    assert any("restatements of the target" in caveat for caveat in report["caveats"])


def test_redundancy_is_not_claimed_when_no_feature_restates_the_target():
    report = analyze(CATEGORICAL_CSV)

    check = next(item for item in report["quality"] if item["label"] == "Target redundancy")
    assert check["status"] == "good"


def test_entity_columns_that_span_the_split_are_reported():
    report = analyze(GROUPED_CSV)

    check = next(item for item in report["quality"] if item["label"] == "Train/test overlap")
    assert check["status"] == "warning"
    overlap = report["evaluation"]["validation"]["groupOverlap"]
    assert [item["column"] for item in overlap] == ["plot_id"]
    assert any("interpolation between known entities" in caveat for caveat in report["caveats"])


def test_ordinary_shared_categorical_features_are_not_reported_as_overlap():
    # A three-level `region` legitimately repeats across train and test; only entity keys are a risk.
    report = analyze(CATEGORICAL_CSV)

    assert report["evaluation"]["validation"]["groupOverlap"] == []


def test_a_lookalike_temporal_column_is_disclosed_as_not_a_forecast_test():
    csv = b"yield,harvest_date\n" + b"".join(f"{3.0 + index * 0.2:.1f},2024-0{1 + index % 9}-1{index % 9}\n".encode() for index in range(12))

    report = analyze(csv)

    assert report["evaluation"]["validation"]["temporalColumn"] == "harvest_date"
    assert any("not a forecast accuracy" in caveat for caveat in report["caveats"])


# Dates and yields both rise, so ordering rows by the date is a real chronological order.
TEMPORAL_CSV = b"yield,harvest_date,rainfall\n" + b"".join(
    f"{3.0 + index * 0.2:.2f},2024-01-{index + 1:02d},{600 + (index * 53) % 300}\n".encode() for index in range(16)
)


def analyze_with(content: bytes, target: str, validation: str, name: str = "field.csv"):
    """Upload, then re-run with an explicit strategy, which is what switching in the report does."""
    payload = upload("/dataset/analyze", content, name).json()
    if payload.get("status") == "needs-target":
        payload = client.post("/analysis/run", json={"analysisId": payload["analysisId"], "target": target}).json()
    return client.post("/analysis/run", json={"analysisId": payload["analysisId"], "target": target, "validation": validation})


def test_every_strategy_is_offered_with_a_reason_when_it_cannot_be_used():
    report = upload("/dataset/analyze", SINGLE_TARGET_CSV).json()
    options = {option["key"]: option for option in report["evaluation"]["validation"]["options"]}

    # This dataset has no entity key and no date, so only the random split is honest to offer.
    assert set(options) == {"random", "grouped", "temporal"}
    assert options["random"]["available"] is True
    assert options["grouped"]["available"] is False and options["grouped"]["reason"]
    assert options["temporal"]["available"] is False and options["temporal"]["reason"]
    assert report["evaluation"]["validation"]["strategy"] == "random"
    assert report["evaluation"]["validation"]["label"] == "Random split"


def test_strategies_are_offered_when_the_dataset_supports_them():
    report = upload("/dataset/analyze", GROUPED_CSV).json()
    options = {option["key"]: option for option in report["evaluation"]["validation"]["options"]}

    assert options["grouped"]["available"] is True
    assert options["grouped"]["label"] == "Grouped by plot_id"


def test_grouped_validation_removes_the_entity_overlap_it_exists_to_remove():
    response = analyze_with(GROUPED_CSV, "yield", "grouped")

    assert response.status_code == 200
    report = response.json()
    validation = report["evaluation"]["validation"]
    assert validation["strategy"] == "grouped"
    assert validation["label"] == "Grouped by plot_id"
    # Grouping by plot_id puts each plot wholly on one side, so the overlap warning must disappear.
    assert validation["groupOverlap"] == []
    check = next(item for item in report["quality"] if item["label"] == "Train/test overlap")
    assert check["status"] == "good"
    assert all("grouped cross-validation" in model["crossValidation"] for model in report["models"])
    assert any("transfer to an unseen entity" in caveat for caveat in report["caveats"])


def test_random_validation_keeps_reporting_the_overlap_it_cannot_avoid():
    report = analyze_with(GROUPED_CSV, "yield", "random").json()

    assert report["evaluation"]["validation"]["strategy"] == "random"
    assert [item["column"] for item in report["evaluation"]["validation"]["groupOverlap"]] == ["plot_id"]
    assert all("shuffled cross-validation" in model["crossValidation"] for model in report["models"])


def test_temporal_validation_holds_out_the_latest_rows():
    report = analyze_with(TEMPORAL_CSV, "yield", "temporal").json()
    validation = report["evaluation"]["validation"]

    assert validation["strategy"] == "temporal"
    assert validation["label"] == "Temporal, ordered by harvest_date"
    assert "held out" in validation["note"]
    assert all("forward-chaining" in model["crossValidation"] for model in report["models"])
    assert report["evaluation"]["holdoutSummary"].startswith("Temporal, ordered by harvest_date holdout")
    # The split is now a forecast test, so the random-split disclaimer must not be repeated.
    assert not any("not a forecast accuracy" in caveat for caveat in report["caveats"])


def test_a_strategy_the_dataset_cannot_support_is_rejected_with_its_reason():
    payload = upload("/dataset/analyze", SINGLE_TARGET_CSV).json()

    response = client.post("/analysis/run", json={"analysisId": payload["analysisId"], "target": "yield", "validation": "grouped"})

    assert response.status_code == 400
    assert "cannot be used for this dataset" in response.json()["detail"]
    assert "entity column" in response.json()["detail"]


def test_an_unknown_strategy_is_rejected_by_the_request_model():
    payload = upload("/dataset/analyze", SINGLE_TARGET_CSV).json()

    response = client.post("/analysis/run", json={"analysisId": payload["analysisId"], "target": "yield", "validation": "leave-one-out"})

    assert response.status_code == 422


def test_attribution_is_reused_instead_of_recomputed_for_every_prediction(monkeypatch):
    calls = {"count": 0}
    original = analysis.feature_insights

    def counting(*args, **kwargs):
        calls["count"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(analysis, "feature_insights", counting)
    payload = upload("/dataset/analyze", SINGLE_TARGET_CSV).json()

    # Building the report attributes the selected model exactly once.
    assert calls["count"] == 1
    assert predict(payload["analysisId"]).status_code == 200
    after_first_prediction = calls["count"]

    # The first prediction may attribute its own model, but repeats must reuse it.
    assert predict(payload["analysisId"]).status_code == 200
    assert predict(payload["analysisId"]).status_code == 200
    assert calls["count"] == after_first_prediction


@pytest.mark.parametrize(
    ("feature_ids", "expected"),
    [
        (["farm_id"], "farm_id"),
        (["planted_on"], "planted_on"),
        (["missing"], "missing"),
        (["rainfall", "rainfall"], "unique"),
    ],
)
def test_predictions_reject_ineligible_unknown_and_duplicate_features(feature_ids, expected):
    content = IDENTIFIER_CSV if feature_ids[0] in {"farm_id", "planted_on"} else SINGLE_TARGET_CSV
    dataset_id = upload("/datasets", content).json()["datasetId"]

    response = predict(dataset_id, featureColumnIds=feature_ids, inputRecord=dict.fromkeys(feature_ids, 900))

    assert response.status_code == 400
    assert expected in response.json()["detail"]


def test_predictions_reject_columns_that_define_the_target():
    area = pd.Series(range(1, 25), dtype=float)
    yield_values = pd.Series([3 + (index % 6) * 0.2 for index in range(24)])
    frame = pd.DataFrame({"area": area, "production": area * yield_values, "yield": yield_values, "rainfall": range(500, 524)})
    dataset_id = upload("/datasets", frame.to_csv(index=False).encode()).json()["datasetId"]

    response = predict(dataset_id, featureColumnIds=["area", "production"], inputRecord={"area": 5, "production": 20})

    assert response.status_code == 400
    assert "area" in response.json()["detail"]
    assert "production" in response.json()["detail"]


def test_model_selection_uses_unrounded_cross_validated_rmse(monkeypatch):
    frame = pd.DataFrame({"rainfall": range(24), "yield": [3 + index * 0.1 for index in range(24)]})
    record = analysis.DatasetRecord("raw-rmse", frame, "raw.csv", 1, "CSV", [])
    errors = {"Ridge": 1.00004, "Lasso": 1.00003, "ElasticNet": 1.5, "RandomForestRegressor": 1.6, "DummyRegressor": 2.0}

    def predictions_with_near_tied_errors(_frame, y, _features, estimator, _cv):
        error = errors[type(estimator).__name__]
        return y.to_numpy() + error, y.to_numpy()

    monkeypatch.setattr(analysis, "cross_validated", predictions_with_near_tied_errors)

    fitted = analysis.fit_models(record, "yield", ["rainfall"])

    ridge, lasso = fitted.evaluations[:2]
    assert ridge["rmse"] == lasso["rmse"] == 1.0
    assert lasso["selected"] is True


def test_the_prediction_interval_uses_the_scored_strategy():
    payload = upload("/dataset/analyze", GROUPED_CSV).json()
    dataset_id = payload["analysisId"]
    grouped = client.post("/analysis/run", json={"analysisId": dataset_id, "target": "yield", "validation": "grouped"}).json()

    response = client.post(
        "/predictions",
        json={
            "datasetId": dataset_id,
            "targetColumnId": "yield",
            "featureColumnIds": ["rainfall", "fertiliser"],
            "inputRecord": {"rainfall": 900, "fertiliser": 120},
            "validation": "grouped",
        },
    )

    assert response.status_code == 200
    interval = response.json()["interval"]
    # The cached error for a shuffled split must not be reused for a grouped one.
    assert "cross-validated RMSE" in interval["method"]
    selected = next(model for model in grouped["models"] if model["selected"])
    assert response.json()["model"] == selected["model"]
    assert interval["halfWidth"] == pytest.approx(round(1.96 * selected["rmse"], 4), abs=1e-3)


def test_attribution_method_matches_the_winning_model_family():
    report = analyze(SINGLE_TARGET_CSV)
    selected = next(model for model in report["models"] if model["selected"])

    expected = "permutation-importance" if selected["model"] == "random-forest" else "standardized-coefficients"
    assert report["insightsMethod"] == expected
    assert report["insightsNote"]
    # Permutation importance is measured in target units and carries no direction.
    if expected == "permutation-importance":
        feature_ids = {column["id"] for column in report["inputColumns"]}
        assert all(item["feature"] in feature_ids for item in report["insights"])
        assert all("Shuffling" in item["interpretation"] for item in report["insights"])


def test_the_report_says_how_much_holdout_evidence_it_is_showing():
    report = analyze(SINGLE_TARGET_CSV)
    prediction = report["prediction"]

    assert prediction["evidenceTotal"] == len(prediction["actualVsPredicted"])
    assert prediction["evidenceShown"] == prediction["evidenceTotal"]
    # Every published point carries its own residual, and they agree.
    for point in prediction["actualVsPredicted"]:
        assert point["residual"] == pytest.approx(point["actual"] - point["predicted"], abs=1e-3)


def test_prediction_label_names_the_actual_target():
    report = analyze(SINGLE_TARGET_CSV)

    assert report["prediction"]["label"] == "Representative predicted yield"


def test_report_prediction_carries_an_rmse_error_band_with_its_method():
    interval = analyze(SINGLE_TARGET_CSV)["prediction"]["interval"]

    assert "level" not in interval
    assert interval["lower"] < interval["upper"]
    assert interval["halfWidth"] > 0
    assert "cross-validated RMSE" in interval["method"]
    assert "not a calibrated prediction interval" in interval["method"]


def test_field_prediction_returns_an_interval_and_extrapolation_notices():
    dataset = upload("/datasets", SINGLE_TARGET_CSV).json()

    inside = predict(dataset["datasetId"]).json()
    assert inside["interval"]["lower"] < inside["value"] < inside["interval"]["upper"]
    assert inside["notices"] == []

    # Asking for a yield far outside the observed range must be flagged, not silently returned.
    outside = predict(dataset["datasetId"], inputRecord={"rainfall": 9000, "temperature": 27, "soil": "loam"}).json()
    assert any("above the highest observed" in notice for notice in outside["notices"])


def test_every_model_discloses_the_constants_it_ran_with():
    report = analyze(SINGLE_TARGET_CSV)

    assert all(model["parameters"] for model in report["models"])


def test_stores_are_bounded_and_evict_the_oldest_entry():
    registry: OrderedDict = OrderedDict()
    for index in range(MAX_DATASETS + 5):
        store(registry, f"key-{index}", index, MAX_DATASETS)

    assert len(registry) == MAX_DATASETS
    assert load(registry, "key-0") is None
    assert load(registry, f"key-{MAX_DATASETS + 4}") == MAX_DATASETS + 4


def test_stored_entries_expire_instead_of_living_forever(monkeypatch):
    clock = {"now": 1_000.0}
    monkeypatch.setattr(main.time, "monotonic", lambda: clock["now"])
    registry: OrderedDict = OrderedDict()
    store(registry, "entry", "value", MAX_DATASETS)
    assert load(registry, "entry") == "value"

    clock["now"] += STORE_TTL_SECONDS + 1

    assert load(registry, "entry") is None
    assert len(registry) == 0
