# CropCast — Crop Yield Prediction App

> Upload a supported agricultural table, compare regression models, and predict individual records locally. Prediction quality depends on the dataset and validation strategy.

**Preparing to present?** See `PRESENTATION_README.md` in the project root for a beginner-friendly explanation of all nine report sections, formulas, algorithms, low/high values, demo scripts, viva answers and a prompt for ChatGPT coaching.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Folder Structure](#4-folder-structure)
5. [ML Pipeline (Backend)](#5-ml-pipeline-backend)
6. [API Reference](#6-api-reference)
7. [Frontend Pages & Components](#7-frontend-pages--components)
8. [Validation Strategies](#8-validation-strategies)
9. [Setup & Running Locally](#9-setup--running-locally)
10. [Scripts & Tooling](#10-scripts--tooling)
11. [Testing](#11-testing)
12. [Design Decisions & Tradeoffs](#12-design-decisions--tradeoffs)

---

## 1. Project Overview

**CropCast** is a full-stack local web application for crop yield analysis and prediction. The user uploads a CSV or Excel dataset (or tries the built-in demo), and the app:

- Auto-detects the numeric target column (yield, production, output, harvest)
- Compares **4 ML models**: Ridge, Lasso, Elastic Net, Random Forest
- Compares them against a mean-baseline (DummyRegressor)
- Selects the best model by lowest cross-validated RMSE
- Returns a full analysis report: metrics (R2, MAE, RMSE), feature importance/coefficients, validation notes, and dataset health warnings
- Lets the user fill in custom field values and get a **prediction with a heuristic RMSE-based error band**, not a calibrated confidence interval
- Provides a **template-based model summary** in English, Hindi, or Telugu, not a causal explanation of an individual field

Everything runs **locally** — no cloud ML, no fabricated numbers in the browser.

### Delivery scope and remaining work

This is a local course-project application for tabular regression, not a validated agronomic advisory service. The bundled sample is synthetic; it demonstrates the workflow rather than proving accuracy on real farms.

For a project submission, demonstrate a supported upload, target selection when ambiguous, model/baseline comparison, a field prediction, a model summary and the validation caveats. Use ISO dates (`YYYY-MM-DD`) or numeric years for temporal evaluation; ambiguous regional date strings can be interpreted incorrectly. Temporal validation needs at least three complete, distinct labelled periods. The prediction form stays tied to the analyzed target; upload again to analyze a different target.

### Presentation walkthrough

1. Upload a CSV, or download and upload the bundled synthetic sample. **Run demo analysis** only replays a saved report; it does not train a new model or accept manual predictions.
2. Compare models and the mean baseline. Explain that RMSE and MAE are errors in the target's units; R² is not an accuracy percentage. The lowest cross-validated RMSE selects the model, even if it does not improve enough on the baseline.
3. Choose **Predict a new record**. The target and feature set stay fixed to the report. Enter known inputs, or choose **Fill typical inputs** to use upload-derived numeric medians and categorical modes. The target is the answer being estimated, not an input to supply.
4. Show the returned value, units, model and RMSE-based error band. The model is fitted on usable labelled rows from the upload. The estimate is for one observation, not the dataset average. The band has no calibrated 95% coverage guarantee.
5. Review **Model testing evidence**. “Test record 1…” labels are display positions for historical holdout comparisons, not new generated records or source row IDs. The preview starts with 10; expansion and CSV export include all returned comparisons (at most 250). The holdout overlaps model-selection CV, so it is not an untouched independent final test.
6. If switching validation, let the re-score finish before predicting again. Entered inputs stay, but previous predictions and summaries are cleared so they cannot be mistaken for the new model's output.

Before claiming real-world forecasting accuracy:

- Obtain a documented, real dataset with crop, location, season, target units and collection provenance. Use only inputs available at the time the forecast will be made.
- Reserve an untouched future season or location for final evaluation. The current model-selection CV and displayed holdout use overlapping data; the holdout is not an independent final test of the selected model.
- Review automatic target-definition screening with domain knowledge. It examines the full uploaded target column, so the entire evaluation must not be described as strictly fold-isolated or leakage-free.
- Measure errors separately by crop and geography, compare a meaningful agronomic baseline, and verify whether the selected model improves on it. A runnable pipeline cannot guarantee useful predictions.
- Calibrate uncertainty if coverage claims are needed. Current error bands are heuristic; feature importance and template summaries are associations, not causal or record-specific explanations.

Before public or multi-user deployment, add authentication and dataset ownership, resource/concurrency limits, persistent storage or explicit session handling, reproducible model/data artifacts and operational monitoring. The current in-memory store expires after one hour and disappears on restart; use one backend worker. Do not expose this unauthenticated local API to the internet.

The CSV download contains the displayed holdout sample, not a batch prediction for every uploaded row. Batch inference and complete dataset exports are not implemented.

### Real-data benchmark

A separate reproducible benchmark uses national annual wheat yields from FAO, processed by Our World in Data, for Bangladesh, China, India, Nepal and Pakistan (1961-2024). Source units are tonnes per hectare. The snapshot, attribution and checksum are bundled; no account or network access is needed to rerun it.

From `C:\2ND YEAR ODD SEM\ML\crop-yield-app`, run:

```powershell
npm run benchmark:real
```

It selects among the existing four models using chronological CV on 1962-2019, then freezes the chosen model before evaluating 2020-2024. Features are predefined: country, year and previous-year yield. The previous-year feature allows rolling one-year-ahead evaluation; this is not a five-year-ahead forecast. Mean and previous-year baselines, per-country/year errors and all test predictions are included.

Evidence: `C:\2ND YEAR ODD SEM\ML\crop-yield-app\docs\real-data-benchmark.md` and the adjacent JSON report. Uploadable data: `C:\2ND YEAR ODD SEM\ML\crop-yield-app\public\sample-datasets\real-wheat-yields.csv`. The adjacent metadata JSON records the source and dataset hash. Uploading this CSV into the app runs exploratory analysis, **not** the separately locked benchmark protocol.

This adds real-data evidence, not farm-level validation. National averages hide field variation; historical revisions and publication delays are not simulated. Previous-year yields must actually be available at forecast time. No weather/soil/management observations, calibrated uncertainty or unseen-country test are supplied.

---

## 2. Architecture

```
+----------------------------------------------------------+
|                     Browser (React SPA)                   |
|  Home Page  -->  Analysis Page  -->  Prediction Form      |
|  (Vite + React 19 + React Router 7 + Tailwind CSS v4)    |
+---------------------+------------------------------------+
                      |  HTTP (fetch / AbortController)
                      |  JSON API
+---------------------v------------------------------------+
|               FastAPI Backend  (Python 3.14)              |
|                                                           |
|   POST /dataset/analyze   --> Auto-detects target         |
|   POST /analysis/run      --> Re-scores with a target     |
|   POST /datasets          --> Inspects columns            |
|   POST /predictions       --> Field-level prediction      |
|   POST /explanations      --> Language explanation        |
|   GET  /health                                            |
|                                                           |
|  In-memory bounded store (OrderedDict, TTL = 1 hour)      |
|  All CPU-bound work runs off the event loop               |
|  (run_in_threadpool)                                      |
+---------------------+------------------------------------+
                      |  scikit-learn Pipelines
+---------------------v------------------------------------+
|                  analysis.py  (ML Engine)                 |
|                                                           |
|  - Reads CSV / XLSX / ZIP                                 |
|  - Cleans, imputes, encodes                               |
|  - Fits 4 models via sklearn Pipeline                     |
|  - Cross-validates (random / grouped / temporal)          |
|  - Computes permutation importance (trees) or             |
|    standardized coefficients (linear)                     |
|  - Builds JSON report                                     |
+-----------------------------------------------------------+
```

**Key architectural choices:**
- **No database** — datasets live in a bounded, TTL-expiring in-memory `OrderedDict` (max 16 datasets, max 200 predictions). Stateless between restarts.
- **No browser-side ML** — all model training and scoring happens in the Python process.
- **AbortController on the frontend** — every long analysis request can be cancelled when the user uploads a new file.
- **Adaptive forest** — on large datasets (>5,000 rows) the Random Forest automatically drops from 300 trees to 60 trees with a capped bootstrap sample, so a large upload degrades in speed, not into a browser timeout.

---

## 3. Tech Stack

### Frontend

| Tool | Version | Role |
|------|---------|------|
| React | 19 | UI library |
| React Router | 7 | Client-side routing |
| TypeScript | 6 | Type safety |
| Vite | 8 | Dev server & bundler |
| Tailwind CSS | 4 | Styling |
| Zod | 4 | API response schema validation |
| Vitest | 5 | Unit tests |
| @testing-library/react | 16 | Component tests |
| oxlint | 1.8 | Linter |

### Backend

| Tool | Version | Role |
|------|---------|------|
| Python | 3.14 | Runtime |
| FastAPI | 0.141 | REST API framework |
| Uvicorn | 0.41 | ASGI server |
| scikit-learn | 1.9 | ML models & pipelines |
| pandas | 3.0 | Data loading & manipulation |
| openpyxl | 3.1 | Excel file support |
| python-multipart | 0.0.22 | File upload parsing |
| httpx | 0.28 | HTTP client (used in tests) |
| pytest | 9.0 | Backend tests |
| ruff | (dev) | Linting & formatting |

---

## 4. Folder Structure

```
crop-yield-app/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI app, routes, in-memory store
│   │   └── analysis.py      # Full ML engine (~1,200 lines)
│   ├── scripts/
│   │   ├── generate_sample_dataset.py
│   │   └── generate_demo_fixture.py
│   ├── tests/               # pytest API tests
│   └── requirements.txt
│
├── src/
│   ├── App.tsx              # Router setup (/, /analysis)
│   ├── main.tsx             # React root
│   ├── pages/
│   │   ├── Home.tsx         # Landing page
│   │   └── Analysis.tsx     # Main analysis workspace
│   ├── components/
│   │   ├── analysis/        # AnalysisDashboard, AnalysisProgress
│   │   ├── dataset/         # FileDropzone
│   │   ├── prediction/      # Prediction form & results
│   │   ├── explanation/     # Multi-language explanation card
│   │   ├── landing/         # Hero, WorkflowOverview, ProductDetails
│   │   ├── layout/          # Nav, footer
│   │   └── voice/           # Voice/tone components
│   ├── services/
│   │   ├── analysisService.ts   # analyzeDataset, resumeAnalysis
│   │   └── predictionService.ts # predict, explain
│   ├── types/
│   │   ├── analysis.ts      # AnalysisState discriminated union
│   │   └── cropcast.ts      # ValidationStrategy, Report types
│   ├── schemas/             # Zod schemas for API validation
│   ├── demo/                # Static demo fixture (offline demo mode)
│   └── styles/              # Global CSS
│
├── public/                  # Static assets
├── index.html
├── vite.config.ts
├── tsconfig.*.json
├── package.json
├── pyproject.toml           # ruff config
└── .env.example
```

---

## 5. ML Pipeline (Backend)

All ML logic lives in `backend/app/analysis.py`.

### 5.1 Data Ingestion

- Accepts: `.csv`, `.xlsx`, `.zip` (containing exactly one CSV)
- Max upload: **10 MB**
- Reads with `pandas` + `openpyxl`

### 5.2 Feature Preprocessing (sklearn Pipeline)

Each model is wrapped in a **sklearn `Pipeline`** with a `ColumnTransformer`:

```
ColumnTransformer
├── Numeric columns  -->  SimpleImputer(median)   -->  StandardScaler
└── Categorical cols -->  SimpleImputer(most_frequent) -->  OneHotEncoder(handle_unknown='ignore')
```

### 5.3 Models Compared

| ID | Name | Algorithm | Key Hyperparams |
|----|------|-----------|----------------|
| `ridge` | Ridge | Ridge | alpha = 1.0 |
| `lasso` | Lasso | Lasso | alpha = 0.05 |
| `elastic-net` | Elastic Net | ElasticNet | alpha = 0.08, l1_ratio = 0.4 |
| `random-forest` | Random Forest | RandomForestRegressor | n_estimators = 300, random_state = 42 |

A **`DummyRegressor(strategy="mean")`** provides the baseline. A model must beat it by at least 5% of baseline error to be called informative.

### 5.4 Model Selection

The selected model is the one with the **lowest cross-validated RMSE** across all four candidates. Results are cached in `DatasetRecord.selected` so re-predictions don't re-train.

### 5.5 Feature Importance / Coefficients

- **Linear models** → Standardized coefficients (directional and comparable in size)
- **Random Forest** → Permutation importance (shuffles each column on the fitted model, measures RMSE rise; on large datasets uses a subsample of ≤3,000 rows with 5 repeats, disclosed in the report)

### 5.6 Prediction Interval

RMSE-based error band:

```
estimate ± 1.96 × cross-validated RMSE
```

If cross-validated RMSE is unavailable, falls back to residual standard error on training data (in-sample, disclosed to the user).

### 5.7 Dataset Health Warnings

The engine detects and discloses:

- **Target-redundancy risk** — a feature correlated >= 0.95 with the target (flagged, not removed)
- **Group leakage** — the same entity appears on both sides of a random split
- **Temporal leakage** — a date/year column exists and random split is used
- **Unseen categories** — a categorical value in the prediction form was never in training data
- **Extrapolation** — a predicted value is outside the observed target range

---

## 6. API Reference

Base URL (local): `http://localhost:8000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/dataset/analyze` | Upload file, auto-detect target, return full report |
| `POST` | `/analysis/run` | Re-run analysis with an explicit target column |
| `POST` | `/datasets` | Inspect a file's columns (no training) |
| `POST` | `/predictions` | Make a field-level prediction |
| `POST` | `/explanations` | Get a plain-language explanation (en / hi / te) |

### POST `/dataset/analyze`

- Body: `multipart/form-data` with `file` field (CSV, XLSX, ZIP)
- Returns: full analysis report, OR `{ "status": "needs-target", "candidates": [...] }` if multiple numeric columns are detected

### POST `/predictions`

```json
{
  "datasetId": "...",
  "targetColumnId": "yield_t_ha",
  "featureColumnIds": ["rainfall_mm", "temperature", "crop_type"],
  "model": null,
  "inputRecord": {
    "rainfall_mm": 850,
    "temperature": 28,
    "crop_type": "Rice"
  },
  "validation": "random"
}
```

Response:

```json
{
  "predictionId": "...",
  "value": 3.84,
  "model": "random-forest",
  "unit": "t/ha",
  "interval": { "lower": 2.1, "upper": 5.58, "halfWidth": 1.74, "inSample": false },
  "notices": []
}
```

### POST `/explanations`

```json
{ "predictionId": "...", "language": "hi" }
```

Response: `{ "text": "..." }` — a paragraph-length explanation in the requested language.

---

## 7. Frontend Pages & Components

### Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Home` | Landing page — hero, workflow overview, product details |
| `/analysis` | `Analysis` | Upload, analysis, and prediction workspace |
| `*` | `NotFound` | 404 fallback |

### Analysis Page State Machine

The `Analysis` page uses a **discriminated union state** (`AnalysisState`):

```
idle
  --> processing
        --> complete
        --> needs-target  (multiple numeric columns detected)
              --> processing --> complete
        --> error
```

The user can also change the **validation strategy** on a completed report to re-score all models under a new split strategy, without clearing the current report from view.

### Key Components

| Component | Purpose |
|-----------|---------|
| `FileDropzone` | Drag-and-drop + click-to-upload CSV/XLSX |
| `AnalysisProgress` | Loading indicator while analysis runs |
| `AnalysisDashboard` | Full report: metrics, charts, feature importance |
| Prediction form | Dynamic form built from dataset column types |
| Explanation card | Plain-language explanation of the prediction |

### Demo Mode

A static pre-computed fixture in `src/demo/` lets users explore the report without uploading a real file. It cannot re-train models or predict a new field. Upload the downloadable sample dataset with the API running to test the complete workflow.

---

## 8. Validation Strategies

| Strategy | What it tests | When to use |
|----------|--------------|-------------|
| `random` | Rows split at random 75/25 | Default; fastest |
| `grouped` | Split by entity (crop/district) — no entity on both sides | Estimating transfer to an unseen entity |
| `temporal` | Later complete periods held out, with forward-chaining validation | Estimating earlier-to-later extrapolation |

Grouped and temporal scores may be worse than random-split scores because they test a different kind of generalization. Choose the strategy that matches the intended use; do not choose it just to maximize the score.

---

## 9. Setup & Running Locally

### Prerequisites

- Node.js 20.19+ or 22.12+ (CI uses Node 22)
- Python 3.14 (the configured lint target and CI version)

### 1. Clone & Install

```bash
git clone <repo-url>
cd crop-yield-app

# Python virtualenv
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r backend/requirements-dev.txt

# Node dependencies
npm install
```

### 2. Environment

```bash
cp .env.example .env
# No secrets needed for local dev
```

### 3. Run (two terminals)

**Terminal 1 — API:**

```bash
npm run dev:api
# FastAPI on http://localhost:8000
```

**Terminal 2 — Frontend:**

```bash
npm run dev
# Vite on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## 10. Scripts & Tooling

| npm script | What it does |
|-----------|-------------|
| `npm run dev` | Vite dev server (frontend) |
| `npm run dev:api` | Uvicorn dev server (backend, hot-reload) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run typecheck` | tsc --noEmit (frontend) |
| `npm run typecheck:api` | ty check backend |
| `npm run lint` | oxlint (frontend) |
| `npm run lint:api` | ruff check (backend) |
| `npm run format:api` | ruff format (backend) |
| `npm run test` | vitest run (frontend unit tests) |
| `npm run test:api` | pytest (backend tests) |
| `npm run check` | Full gate: lint + typecheck + tests (both stacks) |
| `npm run generate:sample` | Generate a sample CSV dataset |
| `npm run generate:demo` | Regenerate the static demo fixture |
| `npm run benchmark:real` | Offline real-data benchmark with held-out future years |

---

## 11. Testing

### Frontend

```bash
npm test
# Vitest + @testing-library/react
```

Key test files:
- `src/App.test.tsx` — routing smoke tests
- `src/pages/Analysis.test.tsx` — upload & state machine tests

### Backend

```bash
npm run test:api
# pytest backend/tests/
# Uses httpx + FastAPI TestClient for end-to-end API coverage
```

---

## 12. Design Decisions & Tradeoffs

### Why no database?

CropCast is a local analysis tool, not a multi-user SaaS. A bounded in-memory `OrderedDict` with a 1-hour TTL and a 16-dataset cap keeps the architecture zero-dependency and stateless. Upload again if the session expires.

### Why 4 models?

Ridge / Lasso / Elastic Net cover the regularization spectrum for linear relationships; Random Forest handles nonlinearities. Comparing all four gives the user a transparent view of which algorithm fits their data best, rather than forcing a single black-box choice.

### Why not run Random Forest with n_jobs=-1 always?

Benchmarked on a 19,689-row dataset: parallel tree building saves ~6s in fitting but **costs ~7s** in permutation importance (many small parallel predictions are slower than serial). Net: ~1s *slower*, and scores stop being bit-reproducible. CropCast keeps `n_jobs=1` for small datasets, and only enables parallelism on large datasets where single-tree cost is hundreds of milliseconds.

### Why Zod on the frontend?

FastAPI returns JSON; Zod validates and narrows the shape at the fetch boundary so TypeScript downstream is genuinely safe — not just type-cast.

### Why no browser-side training?

Transparency. If the model runs in Python, the user gets real cross-validated metrics. Browser-side training (TF.js etc.) would make auditing model behavior much harder and adds significant bundle weight.

### Why plain-language explanations in 3 languages?

Agricultural decision-makers in India are often more comfortable in Hindi or Telugu than English. The explanation endpoint is a lightweight template system — no LLM, no latency, no cost.

---

*Built as an ML course project — 2nd Year Odd Semester.*
