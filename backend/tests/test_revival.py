"""Focused regressions for backend input and validation integrity."""

import asyncio
import json
import threading
from io import BytesIO

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from sklearn.linear_model import Ridge
from sklearn.model_selection import TimeSeriesSplit

import backend.app.analysis as analysis
import backend.app.main as main


def record_for(frame):
    return analysis.DatasetRecord("revival", frame, "revival.csv", 1, "CSV", [])


def frame_for(periods=None):
    frame = pd.DataFrame({"rainfall": np.arange(12) * 13 + 500, "yield": [3.1, 4.2, 2.3, 5.4] * 3})
    if periods is not None:
        frame["harvest_date"] = periods
    return frame


def options_for(frame):
    return {item["key"]: item for item in analysis.validation_options(frame, "yield")}


def split_for(frame, strategy="temporal"):
    usable, y = analysis.target_rows(record_for(frame), "yield", ["rainfall"])
    return analysis.validation_split(frame, usable, y, "yield", strategy)


def test_descriptors_exclude_constant_and_missing_columns_and_report_target():
    frame = frame_for().assign(constant=1, absent=np.nan, constant_label="loam")
    report = analysis.build_report(record_for(frame), "yield")
    descriptors = {item["id"]: item for item in report["inputColumns"]}
    for column in ("constant", "absent", "constant_label", "yield"):
        assert descriptors[column]["eligibleAsFeature"] is False
    assert descriptors["rainfall"]["eligibleAsFeature"] is True
    assert analysis.column_descriptor(frame, "constant")["eligibleAsFeature"] is False


def test_report_prediction_shows_exact_typical_input_record():
    frame = frame_for().assign(
        rainfall=lambda data: data["rainfall"] + 0.0000005,
        soil=pd.Categorical(["loam", "loam", "clay"] * 4),
        constant=1,
        absent=np.nan,
    )
    record = record_for(frame)
    report = analysis.build_report(record, "yield")
    inputs = report["prediction"]["inputRecord"]
    assert inputs == {"rainfall": float(frame["rainfall"].median()), "soil": "loam"}
    assert type(inputs["rainfall"]) is float
    assert type(inputs["soil"]) is str
    assert np.isfinite(inputs["rainfall"])
    assert json.loads(json.dumps(inputs, allow_nan=False)) == inputs
    fitted = analysis.fit_models(record, "yield", ["rainfall", "soil"])
    estimate = fitted.pipeline.predict(pd.DataFrame([inputs], columns=["rainfall", "soil"]))[0]
    assert report["prediction"]["value"] == round(float(estimate), 4)


def test_report_prediction_is_labelled_as_an_example():
    report = analysis.build_report(record_for(frame_for()), "yield")
    assert report["prediction"]["label"] == "Example prediction using typical inputs"


@pytest.mark.parametrize("strategy", ["random", "grouped", "temporal"])
def test_report_discloses_holdout_overlaps_model_selection_cv(strategy):
    frame = frame_for(np.arange(12)).assign(farm_id=["a", "b", "c"] * 4)
    note = analysis.build_report(record_for(frame), "yield", strategy)["evaluation"]["note"].lower()
    assert "holdout overlaps" in note
    assert "model-selection cross-validation" in note
    assert "not an independent final test" in note
    assert "only rows tested" in note


def test_temporal_dates_parse_chronologically_not_lexically():
    frame = frame_for(["2024-10-1", "2024-2-1", "2024-1-1"] * 4)
    order = analysis.temporal_order(frame, "harvest_date")
    assert frame.iloc[order]["harvest_date"].tolist() == ["2024-1-1"] * 4 + ["2024-2-1"] * 4 + ["2024-10-1"] * 4


def test_temporal_holdout_and_cv_keep_entire_periods():
    frame = frame_for([2020] * 7 + [2021] * 2 + [2022] * 2 + [2023])
    split = split_for(frame)
    periods = frame["harvest_date"]
    for train, test in [(split.train_positions, split.test_positions), *split.cv]:
        assert periods.iloc[train].max() < periods.iloc[test].min()
        for period in periods.iloc[test].unique():
            assert set(np.flatnonzero(periods.eq(period))) <= set(test)


def test_unique_time_cv_and_holdout_keep_existing_positions():
    frame = frame_for(np.arange(12))
    split = split_for(frame)
    assert split.train_positions.tolist() == list(range(9))
    assert split.test_positions.tolist() == [9, 10, 11]
    for (train, test), (expected_train, expected_test) in zip(split.cv, TimeSeriesSplit(n_splits=3).split(frame), strict=True):
        np.testing.assert_array_equal(train, expected_train)
        np.testing.assert_array_equal(test, expected_test)


def test_temporal_report_describes_only_tested_cv_rows_and_date_convention():
    report = analysis.build_report(record_for(frame_for(np.arange(12))), "yield", "temporal")
    assert "every usable row" not in report["evaluation"]["note"]
    assert "ISO" in report["evaluation"]["validation"]["note"]


@pytest.mark.parametrize("bad", [None, "garbage", "2024-02-30", np.inf])
def test_temporal_invalid_or_missing_labelled_values_are_unavailable(bad):
    frame = frame_for([2020.0, 2021.0, 2022.0] * 4 if bad == np.inf else ["2024-01-01", "2024-02-01", "2024-03-01"] * 4)
    frame.loc[0, "harvest_date"] = bad
    option = options_for(frame)["temporal"]
    assert option["available"] is False
    assert option["reason"]
    with pytest.raises(HTTPException) as error:
        split_for(frame)
    assert error.value.status_code == 400


def test_temporal_needs_three_labelled_periods():
    frame = frame_for([2020] * 4 + [2021] * 4 + [2022] * 4)
    frame.loc[8:, "yield"] = np.nan
    assert options_for(frame)["temporal"]["available"] is False
    with pytest.raises(HTTPException):
        split_for(frame)


def test_unlabelled_invalid_time_does_not_disable_valid_strategy():
    frame = frame_for(["2024-01-01", "2024-02-01", "2024-03-01"] * 4)
    frame.loc[0, "yield"] = np.nan
    frame.loc[0, "harvest_date"] = "invalid"
    assert options_for(frame)["temporal"]["available"] is True
    assert split_for(frame).strategy == "temporal"


def test_grouped_needs_two_labelled_groups():
    frame = frame_for().assign(plot_id=["A"] * 8 + ["B"] * 4)
    frame.loc[8:, "yield"] = np.nan
    assert options_for(frame)["grouped"]["available"] is False
    with pytest.raises(HTTPException) as error:
        split_for(frame, "grouped")
    assert error.value.status_code == 400


@pytest.mark.parametrize("expression_zero", [True, False])
def test_definition_screen_validates_contradictory_zero_rows(expression_zero):
    frame = pd.DataFrame({"production": np.arange(1, 13) * 2.5, "area": np.arange(1, 13) ** 2 + 1.0})
    frame["yield"] = frame["production"] / frame["area"]
    if expression_zero:
        frame.loc[0, "production"] = 0
    else:
        frame.loc[0, "yield"] = 0
    assert analysis.defining_features(frame, "yield", ["production", "area"]) == []


def test_rounding_helper_accepts_consistent_zeros_without_warnings():
    with np.errstate(divide="raise", invalid="raise"):
        assert analysis.matches_stored_rounding(pd.Series([0, 1.2, 2.3]), pd.Series([0, 1.21, 2.31]))
        assert not analysis.matches_stored_rounding(pd.Series([1, 1.2, 2.3]), pd.Series([0, 1.21, 2.31]))
        assert analysis.matches_stored_rounding(pd.Series([0, 0]), pd.Series([0, 0]))


@pytest.mark.parametrize("value", ["inf", "-inf", "Infinity", "1e309"])
def test_infinite_uploaded_numeric_values_return_400(value):
    client = TestClient(main.app)
    body = "rainfall,yield\n" + "\n".join(f"{value if i == 0 else 500 + i}, {3 + i / 10}" for i in range(12))
    response = client.post("/datasets", files={"file": ("bad.csv", body.encode(), "text/csv")})
    assert response.status_code == 400


@pytest.mark.parametrize("value", ["oops", "NaN", "inf", "-inf", "1e309", [], {}, True])
def test_numeric_prediction_inputs_reject_malformed_or_nonfinite_values(value):
    with pytest.raises(HTTPException) as error:
        analysis.build_input_row(frame_for(), ["rainfall"], {"rainfall": value})
    assert error.value.status_code == 400


@pytest.mark.parametrize("values", [{}, {"rainfall": None}])
def test_absent_numeric_prediction_values_remain_imputable(values):
    assert analysis.build_input_row(frame_for(), ["rainfall"], values)["rainfall"].isna().all()


def test_boolean_feature_accepts_boolean_prediction_input():
    frame = frame_for().assign(irrigated=[True, False] * 6)
    row = analysis.build_input_row(frame, ["irrigated"], {"irrigated": True})
    assert row["irrigated"].iloc[0] == 1


@pytest.mark.parametrize("value", ["oops", "NaN", "Infinity", "1e309", [], {}, True])
def test_malformed_numeric_prediction_inputs_return_400(value):
    record = main.remember(record_for(frame_for()))
    response = TestClient(main.app).post(
        "/predictions",
        json={
            "datasetId": record.dataset_id,
            "targetColumnId": "yield",
            "featureColumnIds": ["rainfall"],
            "inputRecord": {"rainfall": value},
            "model": "ridge",
        },
    )
    assert response.status_code == 400
    assert "rainfall" in response.json()["detail"]


@pytest.mark.parametrize("numeric", [True, False])
def test_imputers_keep_all_missing_training_fold_features(numeric):
    frame = pd.DataFrame({"feature": [np.nan] * 4 + ([1.0, 2.0] if numeric else ["clay", "loam"])})
    if not numeric:
        frame["feature"] = frame["feature"].astype(object)
    pipeline = analysis.make_pipeline(frame, ["feature"], Ridge()).fit(frame.iloc[:4], [1, 2, 3, 4])
    assert np.isfinite(pipeline.predict(frame.iloc[4:])).all()
    transformer = pipeline.named_steps["preprocessor"].named_transformers_["numeric" if numeric else "categorical"]
    assert transformer.named_steps["imputer"].keep_empty_features is True


def test_explicit_model_still_rejects_unavailable_validation():
    record = main.remember(record_for(frame_for()))
    response = TestClient(main.app).post(
        "/predictions",
        json={
            "datasetId": record.dataset_id,
            "targetColumnId": "yield",
            "featureColumnIds": ["rainfall"],
            "inputRecord": {},
            "model": "ridge",
            "validation": "temporal",
        },
    )
    assert response.status_code == 400


def test_explicit_model_is_ranked_under_requested_strategy_before_prediction():
    record = main.remember(record_for(frame_for(np.arange(12))))
    response = TestClient(main.app).post(
        "/predictions",
        json={
            "datasetId": record.dataset_id,
            "targetColumnId": "yield",
            "featureColumnIds": ["rainfall"],
            "inputRecord": {},
            "model": "lasso",
            "validation": "temporal",
        },
    )
    assert response.status_code == 200, response.text
    assert ("yield", ("rainfall",), "temporal") in record.selected
    rmse = record.cv_rmse[("yield", ("rainfall",), "lasso", "temporal")]
    assert response.json()["interval"]["halfWidth"] == round(1.96 * rmse, 4)
    assert response.json()["interval"]["inSample"] is False


def test_interval_does_not_fall_back_to_random_strategy():
    record = record_for(frame_for())
    pipeline = analysis.fitted_model(record, "yield", ["rainfall"], "ridge")
    record.cv_rmse[("yield", ("rainfall",), "ridge", "random")] = 999
    interval = main.prediction_interval(record, pipeline, "yield", ["rainfall"], "ridge", 4, "temporal")
    assert interval["inSample"] is True
    assert interval["halfWidth"] < 999


def test_explanation_templates_do_not_claim_an_override_won_ranking():
    summaries = analysis.explanations("Lasso", "yield", [{"feature": "rainfall"}])
    for text in summaries.values():
        assert "RMSE" not in text
        assert "Lasso" in text and "rainfall" in text


def test_dataset_parsing_runs_off_the_event_loop(monkeypatch):
    loop_thread = threading.get_ident()
    original = analysis.parse_dataset
    parsing_threads = []

    def traced(*args):
        parsing_threads.append(threading.get_ident())
        return original(*args)

    monkeypatch.setattr(analysis, "parse_dataset", traced)
    file = UploadFile(filename="thread.csv", file=BytesIO(frame_for().to_csv(index=False).encode()))
    result = asyncio.run(analysis.read_dataset(file))
    assert len(result.frame) == 12
    assert parsing_threads and parsing_threads[0] != loop_thread
