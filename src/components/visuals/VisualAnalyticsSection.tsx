import type { AnalysisReport } from '../../types/analysis'
import { ActualVsPredictedScatter } from './ActualVsPredictedScatter'
import { ResidualChart } from './ResidualChart'
import { ModelPerformanceChart } from './ModelPerformanceChart'
import { TargetHistogram } from './TargetHistogram'
import { CorrelationBars } from './CorrelationBars'
import { FeatureImportanceChart } from './FeatureImportanceChart'

type Props = { report: AnalysisReport | null }

/**
 * VisualAnalyticsSection — FINAL report section ("Visuals").
 * Composes the 5 (+1) standalone SVG+Tailwind charts into a single gallery.
 * No backend change. Each child handles its own preview/empty state,
 * so the grid always renders — users see what will appear before upload.
 */
export function VisualAnalyticsSection({ report }: Props) {
  return (
    <section
      id="visuals"
      className="scroll-mt-20 report-section"
      aria-labelledby="visuals-title"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">
            Visual Analytics
          </p>
          <h2 id="visuals-title" className="!mb-1">
            At-a-glance evidence
          </h2>
          <p className="m-0 max-w-[68ch] text-sm leading-relaxed text-[var(--muted)]">
            All charts are live from your uploaded dataset. Upload or run demo to populate.
          </p>
        </div>
        {report ? (
          <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] border border-[var(--line)]">
            live
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
            Preview
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5">
        {/* Row 1 — hero full-width: Target distribution */}
        <div className="lg:col-span-2">
          <TargetHistogram
            bins={
              report
                ? report.profile.targetSummary.map((b) => ({ label: b.label, value: b.value }))
                : null
            }
            targetLabel={report?.dataset.target}
            unit={report?.prediction.unit}
          />
        </div>

        {/* Row 2 — diagnostics pair */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ActualVsPredictedScatter
            data={
              report
                ? report.prediction.actualVsPredicted
                    .filter(
                      (p): p is { actual: number; predicted: number; residual: number | null } =>
                        typeof p.actual === 'number' &&
                        Number.isFinite(p.actual) &&
                        typeof p.predicted === 'number' &&
                        Number.isFinite(p.predicted),
                    )
                    .map((p) => ({ actual: p.actual, predicted: p.predicted, residual: p.residual }))
                : null
            }
            evidenceTotal={report?.prediction.evidenceTotal}
            targetLabel={report?.dataset.target}
          />
          <ResidualChart
            residuals={report ? report.prediction.residuals : null}
            actualVsPredicted={report ? report.prediction.actualVsPredicted : undefined}
          />
        </div>

        {/* Row 3 — model bars | correlation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ModelPerformanceChart
            models={
              report
                ? report.models.map((m) => ({
                    model: m.model,
                    label: m.label,
                    rmse: m.rmse,
                    mae: m.mae,
                    r2: m.r2,
                    selected: m.selected,
                  }))
                : null
            }
            baseline={
              report
                ? {
                    label: report.evaluation.baseline.label,
                    rmse: report.evaluation.baseline.rmse,
                    mae: report.evaluation.baseline.mae,
                    r2: report.evaluation.baseline.r2,
                  }
                : null
            }
          />
          <CorrelationBars
            correlations={
              report
                ? report.profile.correlations.map(({ feature, value }) => ({ feature, value }))
                : null
            }
          />
        </div>

        {/* Row 4 — importance full-width */}
        <div className="lg:col-span-2">
          <FeatureImportanceChart
            insights={
              report
                ? report.insights.map(({ feature, coefficient, interpretation }) => ({
                    feature,
                    coefficient,
                    interpretation,
                  }))
                : null
            }
            method={report ? report.insightsMethod : null}
            note={report?.insightsNote}
          />
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--muted)]">
        Tip: Download test evidence CSV from the report header for offline plotting. Charts are derived
        from the current <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-[11px]">AnalysisReport</code>{' '}
        only — no additional network requests.
      </p>
    </section>
  )
}

export default VisualAnalyticsSection
