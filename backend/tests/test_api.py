from io import BytesIO

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)

SINGLE_TARGET_CSV = b"rainfall,temperature,soil,yield\n600,24,loam,3.1\n700,25,clay,3.8\n800,26,loam,4.4\n900,27,sandy,4.7\n1000,28,clay,5.1\n1100,29,loam,5.5\n1200,30,sandy,5.8\n1300,31,clay,6.2\n"
AMBIGUOUS_CSV = b"rainfall,yield,production\n600,3.1,310\n700,3.8,380\n800,4.4,440\n900,4.7,470\n1000,5.1,510\n1100,5.5,550\n1200,5.8,580\n1300,6.2,620\n"


def upload(path: str, content: bytes, name: str = "field.csv"):
    return client.post(path, files={"file": (name, BytesIO(content), "text/csv")})


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
    assert len(report["models"]) == 3
    assert sum(model["selected"] for model in report["models"]) == 1
    assert report["prediction"]["actualVsPredicted"]
    assert any(column["id"] == "rainfall" and column["eligibleAsFeature"] for column in report["inputColumns"])


def test_analysis_requests_target_selection_when_multiple_numeric_targets_exist():
    response = upload("/dataset/analyze", AMBIGUOUS_CSV)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "needs-target"
    assert payload["candidates"] == ["yield", "production"]

    resumed = client.post("/analysis/run", json={"analysisId": payload["analysisId"], "target": "yield"})
    assert resumed.status_code == 200
    assert resumed.json()["dataset"]["target"] == "yield"


def test_dataset_prediction_and_explanation_endpoints_use_a_fitted_model():
    inspected = upload("/datasets", SINGLE_TARGET_CSV)

    assert inspected.status_code == 200
    dataset = inspected.json()
    assert dataset["columnCount"] == 4
    assert any(column["id"] == "yield" and column["eligibleAsTarget"] for column in dataset["columns"])

    prediction = client.post("/predictions", json={
        "datasetId": dataset["datasetId"],
        "targetColumnId": "yield",
        "featureColumnIds": ["rainfall", "temperature", "soil"],
        "model": "ridge",
        "inputRecord": {"rainfall": 950, "temperature": 27, "soil": "loam"},
    })
    assert prediction.status_code == 200
    prediction_data = prediction.json()
    assert prediction_data["model"] == "ridge"
    assert isinstance(prediction_data["value"], float)

    explanation = client.post("/explanations", json={"predictionId": prediction_data["predictionId"], "language": "en"})
    assert explanation.status_code == 200
    assert "Ridge" in explanation.json()["text"]