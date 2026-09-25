# Crop Yield Frontend Design

## Goal

Replace the static, broken landing page with a responsive crop-yield prediction interface that clearly demonstrates the project's ML workflow and can later connect to a real inference API.

## Current-State Findings

- Only `/` is defined even though the header and footer link to four nonexistent routes.
- The CSS uses custom properties that are not defined in the active stylesheet, so much of the intended visual system cannot render reliably.
- Static text has character-encoding corruption.
- The app contains no prediction interaction, result state, validation state, model comparison, or mobile navigation.
- There is no backend or model endpoint in this repository. The UI must label its output as a demo prediction until an API is integrated.

## Product Direction

Create one focused, single-page product experience instead of several empty pages:

1. A credible dashboard hero explains what the model estimates and exposes a clear “Run prediction” action.
2. A structured prediction form captures the minimum agronomic inputs suitable for a classroom ML demo.
3. A results panel returns a deterministic demo estimate, confidence band, and the drivers used in that estimate.
4. A model comparison area explains Ridge, Lasso, and Elastic Net without fabricated performance metrics.
5. Supporting sections describe the data inputs and workflow briefly, rather than burying the product under academic filler.

## Architecture

- React Router continues to serve `/`; header links scroll to page sections rather than dead routes.
- `prediction.ts` owns input types, validation, and deterministic demo-estimate logic.
- The prediction form owns editable state and calls a typed submit callback only when valid.
- The result panel is a pure presenter so a real API can replace the demo function without rewriting layout code.
- Reusable visual primitives are deliberately avoided; this small app does not justify a component library.

## Visual System

- Use an editorial agricultural direction: warm paper background, near-black ink, forest green primary action, amber data accent, and restrained blue for analysis.
- Use native system fonts; external font loading is unnecessary and makes the demo less reliable.
- Use CSS variables in the active stylesheet, with responsive layout, clear focus states, and reduced-motion support.
- Use inline SVG/icons only; no image assets or external icon packages are needed.

## Form and Demo Data

Required fields:

- Crop: Rice, Wheat, Maize, Cotton
- Region: Punjab, Maharashtra, Karnataka, Tamil Nadu
- Season: Kharif, Rabi, Zaid
- Area in hectares: 0.1–10,000
- Rainfall in millimeters: 0–5,000
- Average temperature in °C: -5–60
- Fertilizer in kilograms/hectare: 0–1,000

The estimate uses a transparent deterministic heuristic and must be labeled “Demo estimate — connect your trained model for production predictions.” It must not claim an actual model prediction or fabricated accuracy.

## Interaction Requirements

- Header navigation scrolls to valid sections and highlights no fake pages.
- Mobile menu opens and closes from the visible menu control.
- Form validation is inline, readable, and announced to assistive technology.
- Submission shows a brief processing state before revealing results.
- Reset restores defined demo defaults.
- The page works at small mobile widths, common tablet widths, and desktop widths.

## Validation

- `npm run build` must pass.
- `npm run lint` must pass.
- Manually check the prediction flow, validation, reset, keyboard focus, responsive menu, and no dead internal routes.

## Constraints

- Keep the existing Vite, React, TypeScript, React Router, and Tailwind dependencies.
- Do not add a UI library or charting package.
- Do not invent ML accuracy, model metrics, or live-data claims.
- Do not depend on a backend endpoint in this change.
