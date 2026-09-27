"""Data-integrity rules: what CropCast must refuse to treat as a driver.

A well-formed report can still be wrong. Three failure modes produce a valid payload with a
misleading conclusion, so each one is pinned here:

- a feature *combination* that defines the target (`yield = production / area`), which inflates every
  score while looking like a genuine discovery
- padded categorical labels carried over from the source file (`"Kharif     "`), which split one real
  category into several
- a many-level column rendered as free text, where one typo silently becomes an unseen category
"""

from io import BytesIO

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

import backend.app.analysis as analysis
from backend.app.main import app

client = TestClient(app)


def upload(path: str, frame: pd.DataFrame, name: str = "integrity.csv"):
    body = frame.to_csv(index=False).encode()
    return client.post(path, files={"file": (name, BytesIO(body), "text/csv")})


def report_for(frame: pd.DataFrame, target: str):
    """Analyze a frame, answering the target question when CropCast asks for one."""
    payload = upload("/dataset/analyze", frame).json()
    if payload.get("status") == "needs-target":
        payload = client.post("/analysis/run", json={"analysisId": payload["analysisId"], "target": target}).json()
    return payload


def descriptor_for(frame: pd.DataFrame, column: str):
    payload = upload("/datasets", frame).json()
    return next(item for item in payload["columns"] if item["id"] == column)


def ratio_frame(rows: int = 60) -> pd.DataFrame:
    """`yield` is exactly `production / area`; the two noise columns carry no signal at all."""
    rng = np.random.default_rng(0)
    area = rng.uniform(1.0, 10.0, rows)
    expected = rng.uniform(2.0, 6.0, rows)
    return pd.DataFrame(
        {
            "production": expected * area,
            "area": area,
            "yield": expected,
            "noise_a": rng.normal(size=rows),
            "noise_b": rng.normal(size=rows),
        }
    )


def test_a_feature_pair_that_defines_the_target_is_excluded():
    report = report_for(ratio_frame(), "yield")

    used = [row["feature"] for row in report["profile"]["numericSummary"]]
    assert "production" not in used
    assert "area" not in used
    descriptors = {column["id"]: column for column in report["inputColumns"]}
    assert descriptors["production"]["eligibleAsFeature"] is False
    assert descriptors["area"]["eligibleAsFeature"] is False
    assert descriptors["noise_a"]["eligibleAsFeature"] is True

    redundancy = next(check for check in report["quality"] if check["label"] == "Target redundancy")
    assert redundancy["status"] == "warning"
    assert "production" in redundancy["detail"]
    assert "area" in redundancy["detail"]
    assert any("production" in caveat and "area" in caveat for caveat in report["caveats"])


def test_excluding_the_defining_pair_removes_the_inflation():
    """Once `production` and `area` are gone, only noise remains, so no model can look skilful."""
    report = report_for(ratio_frame(), "yield")

    scored = [model["r2"] for model in report["models"] if model["r2"] is not None]
    assert scored, "expected at least one reported R² to compare against"
    assert max(scored) < 0.5


def test_analysis_refuses_to_train_when_only_target_defining_features_remain():
    frame = ratio_frame().drop(columns=["noise_a", "noise_b"])

    start = upload("/dataset/analyze", frame).json()
    response = client.post("/analysis/run", json={"analysisId": start["analysisId"], "target": "yield"})

    assert response.status_code == 400
    assert "no non-leaking feature columns remain" in response.json()["detail"].lower()


def test_a_skewed_target_does_not_make_nuisance_pairs_look_defining():
    """One extreme target value must not shrink every pair's error below a range-based threshold."""
    rng = np.random.default_rng(4)
    rows = 200
    area = rng.uniform(100, 10_000, rows)
    yield_values = rng.uniform(1, 8, rows)
    yield_values[-1] = 20_000
    frame = pd.DataFrame(
        {
            "area": area,
            "production": yield_values * area,
            "fertilizer": area * rng.uniform(80, 160, rows),
            "rainfall": rng.uniform(400, 1_500, rows),
            "yield": yield_values,
        }
    )

    definitions = analysis.defining_features(frame, "yield", analysis.candidate_features(frame, "yield"))

    assert definitions == [("area", "production", "production / area")]


def test_padded_categorical_labels_collapse_to_one_category():
    frame = pd.DataFrame(
        {
            "season": ["Kharif     ", "Rabi       "] * 6,
            "yield": [3.1, 3.4, 3.2, 3.5, 3.3, 3.6, 3.0, 3.7, 3.15, 3.45, 3.25, 3.55],
        }
    )
    descriptor = descriptor_for(frame, "season")

    assert sorted(descriptor["allowedValues"]) == ["Kharif", "Rabi"]


def test_a_many_level_column_is_a_closed_choice_not_free_text():
    frame = pd.DataFrame(
        {
            "crop_name": [f"Crop {index:02d}" for index in range(40)],
            "yield": [2.0 + index * 0.05 for index in range(40)],
        }
    )
    descriptor = descriptor_for(frame, "crop_name")

    assert descriptor["dataType"] == "category"
    assert len(descriptor["allowedValues"]) == 40


def test_prediction_uses_the_best_validated_model_without_being_told_which():
    frame = pd.DataFrame(
        {
            "rainfall": [600 + index * 40 for index in range(24)],
            "temperature": [22 + (index % 6) for index in range(24)],
            "yield": [3.0 + index * 0.11 + (index % 3) * 0.05 for index in range(24)],
        }
    )
    report = report_for(frame, "yield")
    chosen = next(model["model"] for model in report["models"] if model["selected"])

    response = client.post(
        "/predictions",
        json={
            "datasetId": report["analysisId"],
            "targetColumnId": "yield",
            "featureColumnIds": ["rainfall", "temperature"],
            "inputRecord": {"rainfall": 900, "temperature": 25},
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["model"] == chosen


def test_a_category_the_dataset_never_contained_is_reported_not_ignored():
    frame = pd.DataFrame(
        {
            "soil": ["loam", "clay", "sand"] * 8,
            "rainfall": [600 + index * 25 for index in range(24)],
            "yield": [3.0 + index * 0.09 for index in range(24)],
        }
    )
    report = report_for(frame, "yield")

    response = client.post(
        "/predictions",
        json={
            "datasetId": report["analysisId"],
            "targetColumnId": "yield",
            "featureColumnIds": ["soil", "rainfall"],
            "inputRecord": {"soil": "sandstone", "rainfall": 800},
            "model": "ridge",
        },
    )

    assert response.status_code == 200, response.text
    assert any("soil" in notice for notice in response.json()["notices"])
