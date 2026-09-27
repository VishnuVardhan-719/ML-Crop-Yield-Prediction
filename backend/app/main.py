from __future__ import annotations

import os
import time
from collections import OrderedDict
from typing import Any, Literal, TypeVar
from uuid import uuid4

import numpy as np
import pandas as pd
from fastapi import FastAPI, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .analysis import (
    MODEL_DEFINITIONS,
    VALIDATION_RANDOM,
    DatasetRecord,
    build_input_row,
    build_report,
    candidate_targets,
    column_descriptor,
    explanations,
    fail,
    fit_models,
    fitted_model,
    inferred_unit,
    json_number,
    model_insights,
    read_dataset,
    target_rows,
    unseen_value_notices,
    usable_features,
)

Stored = TypeVar("Stored")

STORE_TTL_SECONDS = 60 * 60
MAX_DATASETS = 16
MAX_PREDICTIONS = 200
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"


def allowed_origins() -> list[str]:
    configured = os.environ.get("CROPCAST_ALLOWED_ORIGINS", DEFAULT_ORIGINS)
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


app = FastAPI(title="CropCast API", version="0.1.0", description="Local tabular regression service for CropCast.")
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins(), allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

# Bounded, expiring in-memory stores: an unbounded module-level dict would grow forever on a long-lived process.
datasets: OrderedDict[str, tuple[float, DatasetRecord]] = OrderedDict()
predictions: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()


ValidationStrategy = Literal["random", "grouped", "temporal"]


class ResumeRequest(BaseModel):
    analysisId: str
    target: str
    validation: ValidationStrategy = "random"


class PredictionRequest(BaseModel):
    datasetId: str
    targetColumnId: str
    featureColumnIds: list[str]
    # Optional on purpose: the analysis already ranked the candidates, so the best validated model is
    # used unless a caller deliberately asks for a specific one.
    model: Literal["ridge", "lasso", "elastic-net", "random-forest"] | None = None
    inputRecord: dict[str, Any]
    validation: ValidationStrategy = "random"


class ExplanationRequest(BaseModel):
    predictionId: str
    language: Literal["en", "hi", "te"]


def store(registry: OrderedDict[str, tuple[float, Any]], key: str, value: Any, limit: int) -> Any:
    registry[key] = (time.monotonic(), value)
    registry.move_to_end(key)
    while len(registry) > limit:
        registry.popitem(last=False)
    return value


def load(registry: OrderedDict[str, tuple[float, Any]], key: str) -> Any | None:
    entry = registry.get(key)
    if entry is None:
        return None
    stored_at, value = entry
    if time.monotonic() - stored_at > STORE_TTL_SECONDS:
        registry.pop(key, None)
        return None
    return value


def remember(record: DatasetRecord) -> DatasetRecord:
    return store(datasets, record.dataset_id, record, MAX_DATASETS)


def get_dataset(dataset_id: str) -> DatasetRecord:
    record = load(datasets, dataset_id)
    if record is None:
        raise fail("This dataset is no longer available. Upload it again.", 404)
    return record


def analyze_record(record: DatasetRecord) -> dict[str, Any]:
    candidates = candidate_targets(record.frame)
    if not candidates:
        raise fail("CropCast could not find a numeric target column. Include a numeric yield or production column.")
    if len(candidates) > 1:
        return {"status": "needs-target", "analysisId": record.dataset_id, "fileName": record.file_name, "candidates": candidates}
    return build_report(record, candidates[0])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/dataset/analyze")
async def analyze_dataset(file: UploadFile):
    record = remember(await read_dataset(file))
    # Parsing, candidate detection, and model fitting are CPU-bound; keep them off the event loop.
    return await run_in_threadpool(analyze_record, record)


@app.post("/analysis/run")
def run_analysis(request: ResumeRequest):
    return build_report(get_dataset(request.analysisId), request.target, request.validation)


@app.post("/datasets")
async def inspect_dataset(file: UploadFile):
    record = remember(await read_dataset(file))
    return {
        "datasetId": record.dataset_id,
        "fileName": record.file_name,
        "rowCount": len(record.frame),
        "columnCount": len(record.frame.columns),
        "columns": [column_descriptor(record.frame, column) for column in record.frame.columns],
    }


def prediction_interval(
    record: DatasetRecord, pipeline, target: str, features: list[str], model: str, value: float, strategy: str = "random"
) -> dict[str, Any]:
    """Return an RMSE-based error band, preferring the validation strategy the report used."""
    cross_validated_rmse = record.cv_rmse.get((target, tuple(features), model, strategy))
    if cross_validated_rmse is None:
        # The report may have been scored under another strategy, or a prediction may arrive first.
        cross_validated_rmse = record.cv_rmse.get((target, tuple(features), model, "random"))
    if cross_validated_rmse is not None:
        half_width = 1.96 * cross_validated_rmse
        method = f"RMSE-based error band: estimate ± 1.96 × this model's cross-validated RMSE ({json_number(cross_validated_rmse)}). This is not a calibrated prediction interval."
        in_sample = False
    else:
        frame, y = target_rows(record, target, features)
        residual = y.to_numpy() - pipeline.predict(frame)
        half_width = 1.96 * float(np.std(residual, ddof=1))
        method = "RMSE-based error band: estimate ± 1.96 × the fitted model's residual standard error on its own training rows. This is in-sample, not calibrated, and understates the true error."
        in_sample = True
    return {
        "lower": round(value - half_width, 4),
        "upper": round(value + half_width, 4),
        "halfWidth": json_number(half_width),
        "inSample": in_sample,
        "method": method,
    }


def selected_kind(record: DatasetRecord, target: str, features: list[str], strategy: str) -> str:
    """The model the analysis chose for this feature set.

    Scoring happens while the report is built, so the choice is normally already cached. A caller that
    sends a feature set the report never scored has nothing ranked yet, so it is ranked here rather
    than silently falling back to the first candidate.
    """
    key = (target, tuple(features), strategy)
    if key not in record.selected:
        fit_models(record, target, features, strategy)
    return record.selected.get(key) or record.selected.get((target, tuple(features), VALIDATION_RANDOM)) or MODEL_DEFINITIONS[0][0]


@app.post("/predictions")
def predict(request: PredictionRequest):
    record = get_dataset(request.datasetId)
    if request.targetColumnId not in candidate_targets(record.frame):
        raise fail("Choose one of the numeric target candidates returned for this dataset.")
    features = usable_features(record.frame, request.targetColumnId, request.featureColumnIds)
    kind = request.model or selected_kind(record, request.targetColumnId, features, request.validation)
    pipeline = fitted_model(record, request.targetColumnId, features, kind)
    row = build_input_row(record.frame, features, request.inputRecord)
    value = float(pipeline.predict(row)[0])
    if not np.isfinite(value):
        raise fail("CropCast could not produce a finite prediction for these values. Check the submitted record.")
    unit = inferred_unit(request.targetColumnId)
    frame, y = target_rows(record, request.targetColumnId, features)
    _, insights = model_insights(record, request.targetColumnId, features, kind, pipeline, frame, y)
    prediction_id = uuid4().hex
    store(
        predictions,
        prediction_id,
        {
            "model": kind,
            "target": request.targetColumnId,
            "value": value,
            "features": insights,
        },
        MAX_PREDICTIONS,
    )
    # Flag extrapolation: an estimate outside the values the model has ever seen is not interpolating.
    observed = pd.to_numeric(record.frame[request.targetColumnId], errors="coerce").dropna()
    notices: list[str] = []
    if value < float(observed.min()):
        notices.append(f"This estimate is below the lowest observed {request.targetColumnId} ({json_number(observed.min())}).")
    if value > float(observed.max()):
        notices.append(f"This estimate is above the highest observed {request.targetColumnId} ({json_number(observed.max())}).")
    return {
        "predictionId": prediction_id,
        "targetColumnId": request.targetColumnId,
        "value": round(value, 4),
        "model": kind,
        "unit": unit,
        "unitInferred": bool(unit),
        "interval": prediction_interval(record, pipeline, request.targetColumnId, features, kind, value, request.validation),
        "notices": [*unseen_value_notices(record.frame, features, request.inputRecord), *notices],
    }


@app.post("/explanations")
def explain(request: ExplanationRequest):
    prediction = load(predictions, request.predictionId)
    if prediction is None:
        raise fail("This prediction is no longer available.", 404)
    model = {
        "ridge": "Ridge",
        "lasso": "Lasso",
        "elastic-net": "Elastic Net",
        "random-forest": "Random Forest",
    }[prediction["model"]]
    text = explanations(model, prediction["target"], prediction["features"])[request.language]
    return {"predictionId": request.predictionId, "language": request.language, "text": text}
