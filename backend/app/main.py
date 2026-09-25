from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

import pandas as pd
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .analysis import DatasetRecord, MODEL_DEFINITIONS, build_report, candidate_targets, column_descriptor, explanations, fail, feature_insights, make_pipeline, read_dataset, usable_features


app = FastAPI(title="CropCast API", version="0.1.0", description="Local tabular regression service for CropCast.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])
datasets: dict[str, DatasetRecord] = {}
predictions: dict[str, dict[str, Any]] = {}


class ResumeRequest(BaseModel):
    analysisId: str
    target: str


class PredictionRequest(BaseModel):
    datasetId: str
    targetColumnId: str
    featureColumnIds: list[str]
    model: Literal["ridge", "lasso", "elastic-net", "random-forest"]
    inputRecord: dict[str, Any]


class ExplanationRequest(BaseModel):
    predictionId: str
    language: Literal["en", "hi", "te"]


def remember(record: DatasetRecord) -> DatasetRecord:
    datasets[record.dataset_id] = record
    return record


def get_dataset(dataset_id: str) -> DatasetRecord:
    record = datasets.get(dataset_id)
    if not record:
        raise fail("This dataset is no longer available. Upload it again.", 404)
    return record


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/dataset/analyze")
async def analyze_dataset(file: UploadFile):
    record = remember(await read_dataset(file))
    candidates = candidate_targets(record.frame)
    if not candidates:
        raise fail("CropCast could not find a numeric target column. Include a numeric yield or production column.")
    if len(candidates) > 1:
        return {"status": "needs-target", "analysisId": record.dataset_id, "fileName": record.file_name, "candidates": candidates}
    return build_report(record, candidates[0])


@app.post("/analysis/run")
def run_analysis(request: ResumeRequest):
    return build_report(get_dataset(request.analysisId), request.target)


@app.post("/datasets")
async def inspect_dataset(file: UploadFile):
    record = remember(await read_dataset(file))
    return {"datasetId": record.dataset_id, "fileName": record.file_name, "rowCount": len(record.frame), "columnCount": len(record.frame.columns), "columns": [column_descriptor(record.frame, column) for column in record.frame.columns]}


@app.post("/predictions")
def predict(request: PredictionRequest):
    record = get_dataset(request.datasetId)
    features = usable_features(record.frame, request.targetColumnId, request.featureColumnIds)
    if request.targetColumnId not in candidate_targets(record.frame):
        raise fail("Choose an eligible numeric target from this dataset.")
    estimator = next(definition[2] for definition in MODEL_DEFINITIONS if definition[0] == request.model)
    target = pd.to_numeric(record.frame[request.targetColumnId], errors="coerce")
    valid = target.notna()
    pipeline = make_pipeline(record.frame, features, estimator).fit(record.frame.loc[valid, features], target.loc[valid])
    value = float(pipeline.predict(pd.DataFrame([request.inputRecord], columns=features))[0])
    prediction_id = uuid4().hex
    predictions[prediction_id] = {"model": request.model, "target": request.targetColumnId, "value": value, "features": feature_insights(pipeline, request.targetColumnId)}
    response: dict[str, Any] = {"predictionId": prediction_id, "targetColumnId": request.targetColumnId, "value": round(value, 4), "model": request.model}
    if "yield" in request.targetColumnId.lower():
        response["unit"] = "t/ha"
    return response


@app.post("/explanations")
def explain(request: ExplanationRequest):
    prediction = predictions.get(request.predictionId)
    if not prediction:
        raise fail("This prediction is no longer available.", 404)
    model = {"ridge": "Ridge", "lasso": "Lasso", "elastic-net": "Elastic Net", "random-forest": "Random Forest"}[prediction["model"]]
    text = explanations(model, prediction["target"], prediction["features"])[request.language]
    return {"predictionId": request.predictionId, "language": request.language, "text": text}