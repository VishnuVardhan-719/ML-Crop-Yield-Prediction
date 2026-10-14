# Real wheat-yield benchmark

National annual wheat averages for Bangladesh, China, India, Nepal and Pakistan; **not farm-level predictions**.

Training: 1962-2019 (290 rows). Final test: 2020, 2021, 2022, 2023, 2024 (25 rows).
Selected by earlier-year CV only: **ridge**. Features: country, year, previous-year yield.

| Final-test estimator | RMSE (t/ha) | MAE (t/ha) | R2 |
|---|---:|---:|---:|
| selected_model | 0.1034 | 0.0870 | 0.9905 |
| training_mean | 1.9665 | 1.6572 | -2.4498 |
| previous_year | 0.1200 | 0.0951 | 0.9872 |

| Country | Model RMSE (t/ha) | Previous-year RMSE (t/ha) |
|---|---:|---:|
| Bangladesh | 0.1256 | 0.1656 |
| China | 0.1010 | 0.1000 |
| India | 0.0783 | 0.0589 |
| Nepal | 0.1119 | 0.1163 |
| Pakistan | 0.0937 | 0.1326 |

The CV-selected model **beats** the previous-year baseline on pooled final-test RMSE. No tuning was performed after reading the test results.

## Protocol and limits

- Three expanding-window folds use entire years strictly before the final test. Imputation, scaling and encoding are fitted within each training fold. Features are predefined, with no full-target feature screening.
- The selected model is refitted once on pre-test years and frozen. Later test years use the preceding realized yield as an input: this is rolling one-year-ahead evaluation, **not** five-year-ahead forecasting from one origin. Reuse of past labels as permitted lag features is explicit, not an independent-observation claim.
- This retrospective snapshot may contain revisions unavailable at historical forecast dates. Previous-year yields must have been published before the forecast. Publication delays are not modeled: this is not an as-of backtest.
- Countries repeat across training and test; no unseen-location generalization is claimed. Pooled R2 includes between-country differences; inspect country/year errors in the JSON report.
- One crop, five countries and 25 test rows cannot establish farm-level or multi-crop accuracy. Weather, soil, management and crop-calendar inputs are absent; uncertainty is not calibrated.
- Manually uploading the CSV uses the app's exploratory validation, not this locked benchmark protocol. The earlier app limitations still apply.

## Provenance and reproduction

Source: Food and Agriculture Organization of the United Nations (2025) and other sources, processed by Our World in Data (Wheat yields). Units: tonnes per hectare. Full attribution, retrieval date, provider metadata and snapshot SHA-256 are in `public/sample-datasets/real-wheat-yields.metadata.json`.

From the repository root, run `python -m backend.scripts.benchmark_real_data` using the project virtual environment. No network is used; modified snapshots are rejected. Complete CV scores, test predictions, per-year metrics and environment versions are in `docs/real-data-benchmark.json`.
