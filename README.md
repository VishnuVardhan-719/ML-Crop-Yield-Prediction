# CropCast

CropCast is a local, end-to-end crop-yield analysis app. Upload a field dataset and the FastAPI backend profiles it, identifies or asks for a numeric target, compares Ridge/Lasso/Elastic Net regression models, and returns an evidence-based report to the React frontend.

## What it does

- Accepts **CSV**, **XLSX**, and ZIP archives containing **exactly one CSV**.
- Enforces a **10 MB** upload limit in the browser and again on the server.
- Detects crop-output targets with names such as `yield` and `production`.
- Uses a deterministic 75/25 train-test split to compare Ridge, Lasso, and Elastic Net.
- Imputes missing values and applies unknown-safe categorical encoding inside each model pipeline.
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
Copy-Item .env.example .env
```

The copied `.env` file contains:

```env
VITE_API_BASE_URL=http://localhost:8000
```

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
| `POST` | `/analysis/run` | Continue after selecting an ambiguous target |
| `POST` | `/datasets` | Inspect a dataset for the prediction workbench contract |
| `POST` | `/predictions` | Fit the selected regression type and predict one record |
| `POST` | `/explanations` | Return an explanation for a stored prediction |

## Test and build

```powershell
npm run lint
npm test
npm run build
npm run test:api
```

## Dataset guidance

Provide at least eight rows and two columns. The selected target must have at least eight numeric values. Identifier-like fields are excluded from model features. Useful feature columns include rainfall, temperature, soil properties, irrigation status, area, and fertilizer.

## Limitations

- This is a local development app, not a deployed agricultural advisory service.
- Datasets and fitted models are held only in server memory and disappear on restart.
- The report’s representative estimate uses median numeric and modal categorical values from the upload. Use `/predictions` for a specific record.
- Results apply only to the uploaded dataset. They are not a pre-trained regional model, do not establish causation, and should not be the sole basis for farming or financial decisions.

## References

- [FastAPI](https://github.com/fastapi/fastapi): typed multipart APIs, OpenAPI docs, and `TestClient`.
- [scikit-learn](https://github.com/scikit-learn/scikit-learn): tabular preprocessing and regression pipelines.
- [Full Stack FastAPI Template](https://github.com/fastapi/full-stack-fastapi-template): larger React/FastAPI reference; its database, authentication, proxy, and deployment stack are intentionally excluded here.
