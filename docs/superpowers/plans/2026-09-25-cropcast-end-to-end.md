# CropCast End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CropCast runnable locally from dataset upload through regression analysis and rendered report.

**Architecture:** Preserve the existing Vite/React report contract. Add a small FastAPI service with an in-memory analysis store; it validates and parses tabular uploads, trains three scikit-learn regression pipelines, and returns report JSON. The frontend points at it through `VITE_API_BASE_URL`.

**Tech Stack:** React 19, TypeScript, Vite, FastAPI, pandas, scikit-learn, pytest.

**Spec:** `docs/superpowers/specs/2026-09-14-crop-yield-frontend-design.md`

## Global Constraints

- Keep the existing Vite, React, TypeScript, React Router, and Tailwind dependencies.
- Do not add a UI library or charting package.
- Do not invent ML accuracy, model metrics, or live-data claims.
- Accept CSV, XLSX, and ZIP uploads up to 10 MB; the server revalidates all browser inputs.
- Keep uploaded datasets in memory only for local development.

---

### Task 1: Backend project and upload contract

**Files:** Create `backend/app/main.py`, `backend/tests/test_api.py`, `backend/requirements.txt`.

**Interfaces:** `POST /dataset/analyze` accepts multipart field `file`; it returns either an uploaded `AnalysisReport` or `{status, analysisId, fileName, candidates}`.

- [ ] Write API tests for health, invalid uploads, unambiguous CSV analysis, and ambiguous target selection.
- [ ] Run `pytest backend/tests -q` and observe import/route failures.
- [ ] Implement bounded CSV/XLSX/single-CSV-ZIP parsing and target candidate discovery.
- [ ] Run `pytest backend/tests -q` and confirm passing contract tests.

### Task 2: Model training and report construction

**Files:** Create `backend/app/analysis.py`; modify `backend/app/main.py`, `backend/tests/test_api.py`.

**Interfaces:** `build_report(analysis_id, upload, target) -> dict` trains Ridge, Lasso, and Elastic Net using imputation, scaling, and unknown-safe categorical encoding.

- [ ] Write a test requiring three finite evaluation results, one selected model, and held-out actual/predicted points.
- [ ] Run the focused test and observe failure.
- [ ] Implement a deterministic train/test split and report projection from real model results.
- [ ] Run all backend tests and confirm the API report matches the frontend contract.

### Task 3: Secondary API endpoints

**Files:** Modify `backend/app/main.py`, `backend/tests/test_api.py`.

**Interfaces:** `POST /datasets`, `POST /predictions`, and `POST /explanations` support the existing typed frontend services.

- [ ] Write tests for dataset inspection, a fitted-model prediction, and an English explanation.
- [ ] Run focused tests and observe failure.
- [ ] Implement only the endpoint behavior used by the existing frontend contract.
- [ ] Run all backend tests and confirm passing.

### Task 4: Local developer workflow and docs

**Files:** Create `.env.example`; modify `README.md`, `.gitignore`, `package.json`.

**Interfaces:** `npm run dev:api` starts `uvicorn backend.app.main:app --reload --port 8000`; `.env.example` defines `VITE_API_BASE_URL=http://localhost:8000`.

- [ ] Document installation, two-terminal startup, API docs, input constraints, and limitations.
- [ ] Ignore local environment, caches, uploads, and temporary captures.
- [ ] Validate commands from a clean dependency setup where possible.

### Task 5: Verification

**Files:** Verify all created and modified files.

- [ ] Run `python -m pytest backend/tests -q`.
- [ ] Run `npm run lint`, `npm test`, and `npm run build`.
- [ ] Start the API and upload a sample CSV through HTTP to confirm a report response.
- [ ] Record any environment-specific limitations rather than claiming unverified results.

## Self-Review

- Spec coverage: the plan preserves the existing UI while replacing the missing backend with a live local inference service, includes validation, accessible frontend compatibility, and documented setup.
- Deliberate omissions: database, authentication, remote deployment, background jobs, and a generated client are unnecessary for the local classroom-scale workflow.
- Interface consistency: analysis endpoints match `src/services/analysisService.ts`; supporting endpoints match `src/services/predictionService.ts` and `src/services/explanationService.ts`.