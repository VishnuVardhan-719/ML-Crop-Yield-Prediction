# Real-data benchmark implementation plan

**Goal:** Deliver reproducible, honest out-of-time evidence using documented real wheat yields, not another UI feature.

**Architecture:** An offline CLI reuses the application's four estimators and preprocessing pipeline. Keep the latest five whole years out of model selection. Choose a model using expanding chronological folds on earlier years, refit on earlier years only, then evaluate once. Fixed features are country, year and the immediately preceding year's yield. Later test-year lag values represent rolling one-year-ahead forecasts, not a five-year forecast from one origin. No automatic target screening uses the test targets.

**Stack:** Existing Python, pandas, scikit-learn, httpx and pytest; no new dependencies. Preserve current edits; no commit or deployment.

## Deliverable and checks

- [x] Verify OWID/FAOSTAT source, units and attribution; save source metadata, snapshot checksums and an uploadable five-country wheat subset.
- [x] Write focused regressions for chronological lag preparation, duplicate/non-finite input rejection, whole-year holdout, and unchanged model selection when final targets change. Run them before implementation (eight expected failures for the missing CLI).
- [x] Implement `backend/scripts/benchmark_real_data.py`: `prepare_dataset`, `split_years`, `evaluate`, acquisition with a timeout, offline checksum verification and JSON/Markdown evidence output.
- [x] Run `python -m pytest backend/tests/test_real_benchmark.py -q`, Ruff and ty on the new files; run `python -m backend.scripts.benchmark_real_data --download` once, then rerun offline. Initial eight regressions passed; offline evidence was byte-identical. Two additional snapshot safeguards included in final verification.
- [x] Document observed results, per-country errors, baseline comparisons, snapshot/revision and reporting-lag limitations. Do not tune after looking at the final test.

All commands run from `C:\2ND YEAR ODD SEM\ML\crop-yield-app` using its `.venv\Scripts\python.exe`. No full slow backend rerun or frontend changes are needed for this isolated CLI.