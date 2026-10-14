# CropCast Revival Implementation Plan

> **For agentic workers:** Execute regression-first fixes with separate backend and frontend file ownership. Preserve existing uncommitted changes; do not commit or deploy automatically.

**Goal:** Make the local upload-to-prediction workflow reliable and document its actual delivery limits.

**Architecture:** Keep the existing React client, FastAPI API and scikit-learn pipelines. Repair shared eligibility, validation and response contracts instead of adding a database or another ML framework.

**Tech Stack:** React 19, TypeScript, Zod, Vite, FastAPI, pandas 3, scikit-learn 1.9, pytest and Vitest.

**Spec:** User request to revive the existing project, audit missing functionality and assess whether its logic can be delivered.

## Constraints

- Preserve pre-existing edits in the README, analysis engine and dashboard tests.
- Use installed dependencies. Keep the service local and unauthenticated; do not publish it.
- Error bands are heuristic, not calibrated confidence intervals.
- Long commands run in logged background processes because the command tool times out after 30 seconds.

## Tasks

- [ ] Establish baseline with `npm run check` and `npm run build`; distinguish timeouts from failures.
- [ ] Add a failing schema regression for report and prediction `unit: null`, then normalize it to `undefined` at the response boundary.
- [ ] Add backend regressions for constant-column eligibility, chronological period-disjoint validation, labelled-group availability, contradictory zero rows, non-finite inputs and entirely missing training-fold features. Repair the shared helpers and run backend tests, lint, format and types.
- [ ] Add dashboard regressions for static demo behavior and stale prediction/explanation requests. Abort and invalidate requests on changed inputs; disable prediction while validation is pending; use accurate summary/export labels.
- [ ] Run a real browser smoke test against both servers, including unknown-unit upload, prediction, summary and validation change. Check actual API responses against frontend schemas.
- [ ] Correct unsupported README claims and record tested delivery scope, ML limitations and production work still required.
- [ ] Review final diffs and run all checks again. No commit, merge or deployment is part of this task.