"""Offline national wheat-yield benchmark; run with python -m backend.scripts.benchmark_real_data."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from importlib.metadata import version
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit

from backend.app.analysis import MODEL_DEFINITIONS, estimator_for, make_pipeline

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "sample-datasets" / "real-wheat-yields.csv"
MANIFEST = DATA.with_suffix(".metadata.json")
REPORT = ROOT / "docs" / "real-data-benchmark.json"
SOURCE = "https://ourworldindata.org/grapher/wheat-yields"
COUNTRIES = ("Bangladesh", "China", "India", "Nepal", "Pakistan")
FEATURES = ["country", "year", "previous_season_t_ha"]
TARGET = "yield_t_ha"


def prepare_dataset(raw: pd.DataFrame) -> pd.DataFrame:
    """Require complete annual panels; derive only the preceding country's observed yield."""
    required = ["country", "year", TARGET]
    if not set(required).issubset(raw.columns):
        raise ValueError(f"Dataset needs columns: {', '.join(required)}")
    frame = raw[required].copy()
    if frame.empty or frame.country.isna().any() or not frame.country.map(lambda value: isinstance(value, str) and bool(value.strip())).all():
        raise ValueError("Country names must be non-empty strings.")
    for column in ("year", TARGET):
        frame[column] = pd.to_numeric(frame[column], errors="raise")
        if not np.isfinite(frame[column].to_numpy(dtype=float)).all():
            raise ValueError(f"{column} must contain finite numbers.")
    if not frame.year.eq(frame.year.round()).all() or frame[TARGET].lt(0).any():
        raise ValueError("Years must be integers and yields non-negative.")
    frame["year"] = frame.year.astype(int)
    if frame.duplicated(["country", "year"]).any():
        raise ValueError("Duplicate country/year records are not supported.")
    frame = frame.sort_values(["country", "year"]).reset_index(drop=True)
    groups = frame.groupby("country")
    if not groups.year.diff().dropna().eq(1).all():
        raise ValueError("Missing annual observations: cannot construct a previous-year feature.")
    counts = frame.groupby("year").country.nunique()
    if not counts.eq(frame.country.nunique()).all():
        raise ValueError("Countries must cover the same complete annual period.")
    frame["previous_season_t_ha"] = groups[TARGET].shift(1)
    return frame.dropna(subset=["previous_season_t_ha"]).sort_values(["year", "country"]).reset_index(drop=True)


def split_years(frame: pd.DataFrame, holdout_years: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    years = np.sort(frame.year.unique())
    if holdout_years < 1 or len(years) - holdout_years < 6:
        raise ValueError("Reserve at least one test year and retain at least six training years.")
    boundary = years[-holdout_years]
    return frame[frame.year.lt(boundary)].copy(), frame[frame.year.ge(boundary)].copy()


def metrics(actual: Any, predicted: Any) -> dict[str, float | None]:
    actual = np.asarray(actual, dtype=float)
    return {
        "rmse_t_ha": float(np.sqrt(mean_squared_error(actual, predicted))),
        "mae_t_ha": float(mean_absolute_error(actual, predicted)),
        "r2": float(r2_score(actual, predicted)) if len(actual) > 1 and np.ptp(actual) > 0 else None,
    }


def evaluate(frame: pd.DataFrame, holdout_years: int = 5) -> dict[str, Any]:
    """Freeze selection and fitting before the final rolling one-year-ahead evaluation."""
    train, test = split_years(frame, holdout_years)
    years = np.sort(train.year.unique())
    folds = []
    partitions = []
    for earlier, later in TimeSeriesSplit(n_splits=3).split(years):
        fitting = train[train.year.isin(years[earlier])]
        validation = train[train.year.isin(years[later])]
        partitions.append((fitting, validation))
        folds.append({"train_years": years[earlier].tolist(), "validation_years": years[later].tolist()})
    candidates: list[dict[str, Any]] = []
    for kind, label, _, _ in MODEL_DEFINITIONS:
        actual, predicted = [], []
        for fitting, validation in partitions:
            estimator, _ = estimator_for(kind, len(fitting))
            pipeline = make_pipeline(fitting, FEATURES, estimator).fit(fitting[FEATURES], fitting[TARGET])
            actual.extend(validation[TARGET].tolist())
            predicted.extend(pipeline.predict(validation[FEATURES]).tolist())
        candidates.append({"model": kind, "label": label, **metrics(actual, predicted)})
    selected = min(candidates, key=lambda item: item["rmse_t_ha"])
    estimator, parameters = estimator_for(selected["model"], len(train))
    pipeline = make_pipeline(train, FEATURES, estimator).fit(train[FEATURES], train[TARGET])
    prediction = pipeline.predict(test[FEATURES])
    mean_prediction = np.full(len(test), float(train[TARGET].mean()))
    previous = test.previous_season_t_ha.to_numpy()

    def comparison(actual, estimated, mean, lag):
        return {"selected_model": metrics(actual, estimated), "training_mean": metrics(actual, mean), "previous_year": metrics(actual, lag)}

    result = comparison(test[TARGET], prediction, mean_prediction, previous)
    evidence = test[["country", "year", TARGET, "previous_season_t_ha"]].copy()
    evidence["predicted"] = prediction
    evidence["training_mean"] = mean_prediction
    return {
        "protocol": "Frozen model; rolling one-year-ahead forecasts using known previous-year yields. Not a five-year forecast or field-yield validation.",
        "features": FEATURES,
        "training": {"first_year": int(train.year.min()), "last_year": int(train.year.max()), "rows": len(train)},
        "holdout": {"years": sorted(test.year.unique().tolist()), "rows": len(test)},
        "selection": {
            "model": selected["model"],
            "parameters": parameters,
            "rule": "Lowest pooled forward-validation RMSE on pre-holdout years only",
            "candidates": candidates,
            "folds": folds,
        },
        "metrics": result,
        "beats_previous_year": result["selected_model"]["rmse_t_ha"] < result["previous_year"]["rmse_t_ha"],
        "by_country": {
            str(country): comparison(group[TARGET], group.predicted, group.training_mean, group.previous_season_t_ha)
            for country, group in evidence.groupby("country")
        },
        "by_year": {
            str(year): comparison(group[TARGET], group.predicted, group.training_mean, group.previous_season_t_ha) for year, group in evidence.groupby("year")
        },
        "predictions": evidence.to_dict(orient="records"),
    }


def download_snapshot() -> None:
    if DATA.exists() or MANIFEST.exists():
        raise ValueError("Snapshot already exists. Run without --download to preserve the evaluated data.")
    with httpx.Client(timeout=20, follow_redirects=True, headers={"User-Agent": "Our World In Data data fetch/1.0"}) as client:
        response = client.get(SOURCE + ".csv?tab=table")
        response.raise_for_status()
        metadata_response = client.get(SOURCE + ".metadata.json?tab=table")
        metadata_response.raise_for_status()
    metadata = metadata_response.json()
    indicator = metadata["columns"]["Wheat yield"]
    if indicator["unit"] != "tonnes per hectare":
        raise ValueError("Source units changed; review the benchmark before downloading.")
    raw = pd.read_csv(BytesIO(response.content))
    subset = raw[raw.Entity.isin(COUNTRIES) & raw.Year.between(1961, 2024)]
    subset = subset.rename(columns={"Entity": "country", "Year": "year", "Wheat yield": TARGET})[["country", "year", TARGET]]
    prepared = prepare_dataset(subset)
    if len(prepared) != len(COUNTRIES) * 63:
        raise ValueError("Expected five complete country series covering 1961-2024.")
    # Include the lag for manual uploads, but always reconstruct it in the benchmark.
    subset = subset.merge(prepared[["country", "year", "previous_season_t_ha"]], on=["country", "year"], how="left")
    payload = subset.sort_values(["year", "country"]).to_csv(index=False, lineterminator="\n").encode()
    manifest = {
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_url": SOURCE,
        "source_csv_url": str(response.url),
        "source_metadata_url": str(metadata_response.url),
        "source_csv_sha256": hashlib.sha256(response.content).hexdigest(),
        "snapshot_sha256": hashlib.sha256(payload).hexdigest(),
        "countries": list(COUNTRIES),
        "years": [1961, 2024],
        "rows": len(subset),
        "crop": "Wheat",
        "unit": "tonnes per hectare",
        "transformation": "Filter five countries and 1961-2024; rename columns; add country-specific previous-year yield; do not round source values.",
        "reuse": "Credit FAO and Our World in Data. Third-party data remain subject to original provider terms; see source page. Do not relabel as synthetic or field measurements.",
        "source_metadata": metadata,
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_bytes(payload)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_report(result: dict[str, Any]) -> None:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    rows = [
        "# Real wheat-yield benchmark",
        "",
        "National annual wheat averages for Bangladesh, China, India, Nepal and Pakistan; **not farm-level predictions**.",
        "",
        f"Training: {result['training']['first_year']}-{result['training']['last_year']} ({result['training']['rows']} rows). Final test: {', '.join(map(str, result['holdout']['years']))} ({result['holdout']['rows']} rows).",
        f"Selected by earlier-year CV only: **{result['selection']['model']}**. Features: country, year, previous-year yield.",
        "",
        "| Final-test estimator | RMSE (t/ha) | MAE (t/ha) | R2 |",
        "|---|---:|---:|---:|",
    ]
    for name, score in result["metrics"].items():
        r2 = "undefined" if score["r2"] is None else f"{score['r2']:.4f}"
        rows.append(f"| {name} | {score['rmse_t_ha']:.4f} | {score['mae_t_ha']:.4f} | {r2} |")
    rows += ["", "| Country | Model RMSE (t/ha) | Previous-year RMSE (t/ha) |", "|---|---:|---:|"]
    for country, scores in result["by_country"].items():
        rows.append(f"| {country} | {scores['selected_model']['rmse_t_ha']:.4f} | {scores['previous_year']['rmse_t_ha']:.4f} |")
    verdict = "beats" if result["beats_previous_year"] else "does not beat"
    rows += [
        "",
        f"The CV-selected model **{verdict}** the previous-year baseline on pooled final-test RMSE. No tuning was performed after reading the test results.",
        "",
        "## Protocol and limits",
        "",
        "- Three expanding-window folds use entire years strictly before the final test. Imputation, scaling and encoding are fitted within each training fold. Features are predefined, with no full-target feature screening.",
        "- The selected model is refitted once on pre-test years and frozen. Later test years use the preceding realized yield as an input: this is rolling one-year-ahead evaluation, **not** five-year-ahead forecasting from one origin. Reuse of past labels as permitted lag features is explicit, not an independent-observation claim.",
        "- This retrospective snapshot may contain revisions unavailable at historical forecast dates. Previous-year yields must have been published before the forecast. Publication delays are not modeled: this is not an as-of backtest.",
        "- Countries repeat across training and test; no unseen-location generalization is claimed. Pooled R2 includes between-country differences; inspect country/year errors in the JSON report.",
        "- One crop, five countries and 25 test rows cannot establish farm-level or multi-crop accuracy. Weather, soil, management and crop-calendar inputs are absent; uncertainty is not calibrated.",
        "- Manually uploading the CSV uses the app's exploratory validation, not this locked benchmark protocol. The earlier app limitations still apply.",
        "",
        "## Provenance and reproduction",
        "",
        "Source: Food and Agriculture Organization of the United Nations (2025) and other sources, processed by Our World in Data (Wheat yields). Units: tonnes per hectare. Full attribution, retrieval date, provider metadata and snapshot SHA-256 are in `public/sample-datasets/real-wheat-yields.metadata.json`.",
        "",
        "From the repository root, run `python -m backend.scripts.benchmark_real_data` using the project virtual environment. No network is used; modified snapshots are rejected. Complete CV scores, test predictions, per-year metrics and environment versions are in `docs/real-data-benchmark.json`.",
    ]
    REPORT.with_suffix(".md").write_text("\n".join(rows) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Acquire the fixed 1961-2024 snapshot once; existing snapshots are not overwritten.")
    args = parser.parse_args()
    try:
        if args.download:
            download_snapshot()
        if not DATA.exists() or not MANIFEST.exists():
            raise ValueError("Snapshot missing. Run once with --download.")
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        payload = DATA.read_bytes()
        if hashlib.sha256(payload).hexdigest() != manifest["snapshot_sha256"]:
            raise ValueError("Snapshot checksum mismatch; restore the recorded dataset before evaluating.")
        result = evaluate(prepare_dataset(pd.read_csv(BytesIO(payload))))
        result["provenance"] = manifest
        result["environment"] = {name: version(name) for name in ("pandas", "scikit-learn", "numpy")}
        write_report(result)
        print(
            json.dumps(
                {"selected_model": result["selection"]["model"], "metrics": result["metrics"], "beats_previous_year": result["beats_previous_year"]}, indent=2
            )
        )
        print(f"Evidence saved to {REPORT.with_suffix('.md')}")
    except (ValueError, KeyError, OSError, httpx.HTTPError) as error:
        parser.exit(1, f"Benchmark failed: {error}\n")


if __name__ == "__main__":
    main()
