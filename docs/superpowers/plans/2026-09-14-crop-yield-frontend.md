# Crop Yield Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, usable crop-yield prediction frontend with an honest deterministic demo result.

**Architecture:** Keep a single route and convert navigation to valid page anchors. Isolate prediction inputs, validation, and demo calculation in `src/lib/prediction.ts`; render the interactive form and result panel from typed data so a future API can replace the demo engine.

**Tech Stack:** React 19, TypeScript, Vite 8, React Router 7, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-09-14-crop-yield-frontend-design.md`

## Global Constraints

- Keep the existing Vite, React, TypeScript, React Router, and Tailwind dependencies.
- Do not add a UI library or charting package.
- Do not invent ML accuracy, model metrics, or live-data claims.
- Do not depend on a backend endpoint in this change.

---

### Task 1: Establish the visual foundation

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/index.css`

**Interfaces:**
- Produces: globally available design tokens, base styles, and utility classes used by all page components.

- [ ] **Step 1: Replace incomplete global CSS**

Define active color, shadow, spacing, typography, focus, and responsive container rules in `src/styles/globals.css`, starting with:

```css
:root {
  --ink: #16231b;
  --paper: #f5f2e9;
  --forest: #1c6b47;
  --amber: #d58d2b;
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npm run build`

Expected: `tsc -b && vite build` exits with status 0.

### Task 2: Add prediction domain logic

**Files:**
- Create: `src/lib/prediction.ts`

**Interfaces:**
- Produces: `PredictionInputs`, `PredictionResult`, `defaultPredictionInputs`, `validatePredictionInputs`, and `createDemoPrediction`.

- [ ] **Step 1: Define typed inputs and result**

```ts
export type PredictionInputs = {
  crop: 'Rice' | 'Wheat' | 'Maize' | 'Cotton'
  region: 'Punjab' | 'Maharashtra' | 'Karnataka' | 'Tamil Nadu'
  season: 'Kharif' | 'Rabi' | 'Zaid'
  area: number
  rainfall: number
  temperature: number
  fertilizer: number
}
```

- [ ] **Step 2: Implement range validation and a deterministic demo calculation**

Return one readable error per invalid numeric value. Calculate an estimate in tonnes/hectare from crop, climate, fertilizer, and seasonal factors, then calculate a conservative range around that estimate.

- [ ] **Step 3: Verify type-checking**

Run: `npm run build`

Expected: Build exits with status 0.

### Task 3: Build the prediction interaction

**Files:**
- Create: `src/components/prediction/PredictionForm.tsx`
- Create: `src/components/prediction/PredictionResult.tsx`
- Create: `src/components/prediction/PredictionWorkspace.tsx`

**Interfaces:**
- Consumes: `PredictionInputs`, `PredictionResult`, `defaultPredictionInputs`, `validatePredictionInputs`, and `createDemoPrediction`.
- Produces: `PredictionWorkspace`, rendered inside the main page.

- [ ] **Step 1: Implement controlled form fields**

Use native labels, `select`, and `input` controls for every property in `PredictionInputs`. Render validation errors with `aria-describedby`.

- [ ] **Step 2: Implement submit, loading, reset, and result states**

On valid submit, show a short “Estimating yield…” state and then call `createDemoPrediction`. Reset the form and remove the result.

- [ ] **Step 3: Render transparent output**

Display estimate, range, crop/context summary, key drivers, and the exact demo disclaimer from the spec.

- [ ] **Step 4: Verify the production build**

Run: `npm run build`

Expected: Build exits with status 0.

### Task 4: Replace the page architecture and navigation

**Files:**
- Modify: `src/components/layout/Navbar.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/components/landing/Hero.tsx`
- Create: `src/components/landing/ModelComparison.tsx`
- Create: `src/components/landing/WorkflowOverview.tsx`

**Interfaces:**
- Consumes: `PredictionWorkspace`.
- Produces: valid internal anchors matching rendered section `id` values.

- [ ] **Step 1: Replace dead routes with anchors**

Use `#predict`, `#models`, `#workflow`, and `#about` in the header and footer. Add a controlled mobile-menu state in `Navbar`.

- [ ] **Step 2: Add a concise dashboard hero**

Render product statement, CTA to `#predict`, live-demo badge, and an at-a-glance facts card without unsupported accuracy claims.

- [ ] **Step 3: Compose focused home sections**

Render hero, prediction workspace, model comparison, workflow overview, and a concise limitations/about section. Remove the unused static landing sections from the page composition.

- [ ] **Step 4: Verify valid navigation and responsive layout**

Run: `npm run build`

Expected: Build exits with status 0.

### Task 5: Lint and final verification

**Files:**
- Modify as required only to resolve direct lint/build failures.

**Interfaces:**
- Produces: a buildable, lint-clean application.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: exits with status 0.

- [ ] **Step 2: Run final build**

Run: `npm run build`

Expected: exits with status 0.

- [ ] **Step 3: Inspect source for dead internal paths**

Run: `rg 'to="/|href="/' src`

Expected: no links to missing application routes.
