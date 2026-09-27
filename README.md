# CropCast

CropCast is a local, end-to-end crop-yield analysis app. Upload a field dataset and the FastAPI backend profiles it, identifies or asks for a numeric target, compares regression models against a mean baseline, and returns an evidence-based report to the React frontend.

## What it does

- Accepts **CSV**, **XLSX**, and ZIP archives containing **exactly one CSV**.
- Enforces a **10 MB** upload limit in the browser and again on the server.
- Detects crop-output targets with names such as `yield` and `production`.
- Asks you to pick the target whenever it cannot identify one safely, instead of guessing a column.
- Compares **Ridge, Lasso, Elastic Net, and Random Forest** using k-fold cross-validation, with a 75/25 holdout split reported alongside.
- Lets you choose what the scores actually measure: a **random split**, a **grouped split** that holds out whole entities, or a **temporal split** that trains on earlier rows and tests on later ones. Each option carries its own caveat text, and an option the dataset cannot support stays visible and disabled with the reason.
- Adds a **mean baseline** (`DummyRegressor`) as a reference row, and reports whether anything actually beat it. The selected model is the one with the **lowest cross-validated RMSE**.
- Reports every metric as `null` rather than `0` when a statistic is undefined. A model with a missing metric can never be selected.
- Imputes missing values and applies unknown-safe categorical encoding inside each model pipeline.
- Excludes identifier and date columns from model features, and flags interquartile-range outliers as review items.
- Detects and discloses three ways a score can be misleading: **target redundancy** (a feature that restates the target), **train/test entity overlap** (rows sharing a field or plot across the split), and a **lookalike temporal column** that would make a random split look like a forecast test. Overlap under the strategy actually used is stated once rather than repeated across validation and caveats.
- Validates **every backend response** against a hand-written **zod** schema at the network boundary, so a drifted field name or type fails with the offending path instead of surfacing as `undefined` deep in the UI.
- Ranks drivers with **standardized coefficients** for linear models and **training-set permutation importance** for tree ensembles, and labels which method produced the numbers.
- Returns an **RMSE-based error band** with the report estimate and with every field prediction. It is disclosed as a heuristic range, not a calibrated prediction interval.
- Flags predictions that fall outside the observed target range as extrapolation.
- Provides interactive API docs at `http://localhost:8000/docs`.

## Requirements

- Node.js 22+ and npm
- Python 3.14+ (or a Python version supported by the pinned backend packages)

## Run locally

### Install dependencies

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
Copy-Item .env.example .env
```

`backend/requirements.txt` covers running the service. `backend/requirements-dev.txt` adds `ruff` and `ty` for the lint, format, and type gates.

The copied `.env` file contains:

```env
VITE_API_BASE_URL=http://localhost:8000
```

The backend accepts an optional `CROPCAST_ALLOWED_ORIGINS` environment variable (comma-separated). It defaults to the local Vite dev and preview origins on ports `5173` and `4173`.

### Start the app

Use two terminals:

```powershell
# terminal 1
npm run dev:api

# terminal 2
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API health check |
| `POST` | `/dataset/analyze` | Upload and analyze data; returns a report or target candidates |
| `POST` | `/analysis/run` | Continue after selecting an ambiguous target, optionally under a chosen validation strategy |
| `POST` | `/datasets` | Inspect a dataset for the prediction workbench contract |
| `POST` | `/predictions` | Automatically select the lowest-CV-RMSE candidate for the requested fields and predict one record |
| `POST` | `/explanations` | Return a summary for a stored prediction |

Every metric in a report may be `null`: the API reports an undefined statistic as missing rather than as `0`. The interface renders those as `—`.

`POST /analysis/run` and `POST /predictions` both accept an optional `validation` of `random`, `grouped`, or `temporal`, defaulting to `random`. A strategy the dataset cannot support is rejected with a `400` naming the missing entity or date column. A field prediction's error band is taken from the split the report was actually scored under, falling back to the random split only if that strategy was never scored.

When `model` is omitted, field predictions compare all four candidates for the requested feature set and reuse the one with the lowest raw cross-validated RMSE. An explicit `model` remains accepted for backward compatibility. The API rejects unknown, duplicate, identifier-like, date, constant, target-defining, and otherwise ineligible feature columns before fitting anything. Submitted strings are coerced, missing values are imputed, unseen categories are handled, and `notices` report extrapolation beyond the observed target range.

## Test and build

```powershell
npm run check          # frontend lint + types + tests, then backend lint + types
npm run lint           # oxlint
npm run typecheck      # tsc -b
npm test               # vitest
npm run lint:api       # ruff check
npm run format:api     # ruff format
npm run test:api       # pytest
npm run build          # tsc -b && vite build
```

CI runs the frontend job (lint, `tsc -b`, tests, build) and the backend job (`ruff check`, `ruff format --check`, `ty check`, pytest) on every push and pull request.

## Datasets

Provide at least eight rows and two columns. The selected target must have at least eight numeric values. Identifier-like fields are excluded from model features. A pair that arithmetically reproduces the target, such as `Yield ≈ Production / Area`, is also excluded; analysis stops if no safe predictors remain. Useful feature columns include rainfall, temperature, soil properties, irrigation status, and fertilizer.

### The bundled sample dataset

`public/sample-datasets/sample-field-trials.csv` (288 rows) is synthetic and generated on purpose to exercise the app rather than flatter it:

- a **saturating** fertiliser response and a **pest threshold**, which linear models genuinely cannot fit
- a **rainfall × irrigation interaction**, so no single rainfall coefficient works for both groups
- irreducible noise of roughly 12% of the target spread, which puts R² in a realistic 0.6–0.7 band
- the **same 96 fields recorded over three seasons**, so a shuffled split really does contain entity overlap
- scattered missing values, a few impossible rainfall readings, two failed plots, and one near-useless feature

The result is that the four models separate meaningfully and **Random Forest wins on merit** — which is the point of comparing four models. Regenerate it with:

```powershell
npm run generate:sample
```

The demo shown by **Run demo analysis** is a recorded run over that same file, so the two can never disagree. Regenerate it after changing the engine or the dataset:

```powershell
npm run generate:demo
```

Aim for roughly 100+ rows for stable held-out metrics; with fewer than 20 usable target rows the report flags that its metrics are indicative only.

## Limitations

- This is a local development app, not a deployed agricultural advisory service.
- Datasets and fitted models are held only in server memory and disappear on restart. The store is capped at 16 datasets and 200 predictions and expires entries after one hour, so a long-lived process does not grow without bound.
- Display units are **inferred from the column name** and are labelled as inferred wherever they appear. Confirm the unit against your own data before relying on it.
- Cross-validated metrics use every usable row, while holdout metrics come from a single split of those same rows. They are shown side by side for transparency and are not directly comparable.
- The default validation is a **random split**, which measures interpolation between known conditions. Choose **grouped** to estimate transfer to an unseen field, or **temporal** to train on earlier rows and test on later ones. The report states which question the displayed numbers answer; the random split remains an upper bound on transfer unless you switch.
- Hyperparameters are **fixed constants**, reported as such. There is no hyperparameter search, so a model's defaults are not tuned to your dataset.
- Prediction intervals are **residual-based** (±1.96 × cross-validated RMSE), not calibrated coverage guarantees.
- The **summary is template-composed** in English, Hindi, and Telugu. No language model is involved and nothing in the interface claims otherwise.
- Results apply only to the uploaded dataset. They are not a pre-trained regional model, do not establish causation, and should not be the sole basis for farming or financial decisions.

## Performance and how the numbers are verified

On the bundled sample dataset (288 rows) a full analysis takes roughly **23–25 s**. Where the time goes, measured rather than guessed:

- The Random Forest is ~69% of model fitting and all of the ~9 s attribution step; the three linear models together take well under a second.
- The forest is deliberately **serial** (`n_jobs` left at its default). Parallel trees would make 5-fold cross-validation ~41% faster (15.1 s → 8.9 s), but the same forest also scores `permutation_importance`, which makes 91 small predictions — and each is ~2.4× slower when the forest predicts across threads (62 ms vs 150 ms). The two effects net out ~1 s *slower*, and parallel prediction changes floating-point summation order, so scores would stop being bit-reproducible. Both measurements are recorded next to the code in `backend/app/analysis.py`.
- The real lever is **tree count**: `n_estimators=300` → 200 costs one thousandth of an R² point (0.6654 → 0.6659, i.e. no meaningful loss) for ~30% less total engine time. That is a modelling choice, not a defect, so it is left to the reader.
- `permutation_importance` is likewise serial **on purpose**: `n_jobs != 1` there spawns worker *processes* (not threads) that each pickle the fitted forest, and measured 9.3 s serial vs 14.4 s with two workers.

Correctness is tested against **external sources of truth**, not just the report's own consistency — see `backend/tests/test_ground_truth.py`. The hand-built out-of-fold loop (which replaced `cross_val_predict`, since the latter refuses forward-chaining splits) is asserted bit-identical to sklearn's reference implementation; a noise-free linear relationship must be recovered; a target independent of its features must fail to beat the baseline; a column that restates the target must be flagged as leakage; and the engine's Ridge score on the bundled diabetes dataset must match an independently written cross-validation and the band reported in the literature.

**Large datasets** (above 5,000 usable rows) switch the Random Forest to a reduced budget — 60 trees, a 2,500-row bootstrap cap per tree, and thread-parallel tree building — which brought a real 19,689-row state harvest dataset from *never finishing* (one 300-tree fit alone measured ~493 s) to **~2 minutes end to end**, while datasets at or below the threshold keep their exact previous budget and byte-identical scores. Permutation importance on large frames is measured on a seeded random sample of 3,000 rows with 5 repeats, and the report's insight notes disclose that sample. The reduced hyperparameters are shown in the report rather than hidden behind the small-dataset constants, and the browser request deadline (180 s) is sized to the documented large-dataset budget.

## References

- [FastAPI](https://github.com/fastapi/fastapi): typed multipart APIs, OpenAPI docs, and `TestClient`.
- [scikit-learn](https://github.com/scikit-learn/scikit-learn): tabular preprocessing, regression pipelines, `DummyRegressor` baselines, and `permutation_importance`.
- [zod](https://zod.dev): runtime validation of backend responses against shared TypeScript types at the client boundary.
- [Full Stack FastAPI Template](https://github.com/fastapi/full-stack-fastapi-template): larger React/FastAPI reference; its database, authentication, proxy, and deployment stack are intentionally excluded here.
