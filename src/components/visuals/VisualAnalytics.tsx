import type { AnalysisReport, InsightsMethod, ModelEvaluation, BaselineEvaluation } from '../../types/analysis'
import { TargetHistogram } from './TargetHistogram'
import { CorrelationBars } from './CorrelationBars'
import { ActualVsPredictedScatter } from './ActualVsPredictedScatter'
import { ResidualChart } from './ResidualChart'

type Props = { report: AnalysisReport | null; preview?: boolean }

// ---------- small helpers (pure, no deps) ----------
function fmt(n: number | null | undefined, d = 2) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  const v = Object.is(n, -0) ? 0 : n
  return v.toFixed(d)
}

// ---------- Model performance — grouped horizontal bars ----------
function ModelBars({ models, baseline }: { models: ModelEvaluation[]; baseline: BaselineEvaluation }) {
  const rows = [...models].sort((a, b) => {
    const av = typeof a.rmse === 'number' && Number.isFinite(a.rmse) ? a.rmse : Infinity
    const bv = typeof b.rmse === 'number' && Number.isFinite(b.rmse) ? b.rmse : Infinity
    return av - bv
  })
  const allErr = [...rows.flatMap((m) => [m.rmse, m.mae]), baseline.rmse, baseline.mae].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  const maxErr = Math.max(...allErr, 1)
  const hasAny = allErr.length > 0

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Model comparison</p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">Model Performance</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">RMSE & MAE (lower is better). R² shown as pill. Selected ringed.</p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-2 text-[11px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5"><i className="w-3 h-2 rounded-sm bg-[var(--accent)] inline-block" aria-hidden /> RMSE</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-3 h-2 rounded-sm inline-block border border-[var(--accent)] bg-[var(--accent-soft)]" aria-hidden /> MAE</span>
        </span>
      </div>

      {!hasAny ? (
        <div className="mt-4 grid place-items-center min-h-[10rem] border border-dashed border-[var(--line-strong)] rounded-[var(--radius)] bg-[var(--surface)] p-4 text-center">
          <p className="text-xs text-[var(--muted)]">Insufficient data for this chart.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {rows.map((m) => {
            const rmseW = typeof m.rmse === 'number' && Number.isFinite(m.rmse) ? (m.rmse / maxErr) * 100 : 0
            const maeW = typeof m.mae === 'number' && Number.isFinite(m.mae) ? (m.mae / maxErr) * 100 : 0
            return (
              <div
                key={m.model}
                className={`rounded-xl border p-3 ${m.selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]/40 ring-1 ring-[var(--accent)]/20' : 'border-[var(--line)] bg-[var(--surface-2)]/35'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[var(--ink)] flex items-center gap-2">
                    {m.label}
                    {m.selected && <span className="inline-flex items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] px-2 py-0.5 text-[10px] font-bold tracking-wide">Selected</span>}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--muted)]">R² {fmt(m.r2)}</span>
                </div>
                <div className="mt-2 grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-[11px] font-medium text-[var(--muted)]">RMSE</span>
                    <div className="flex-1 h-2.5 rounded-full bg-[var(--surface)] border border-[var(--line)] overflow-hidden">
                      <i className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(rmseW, 2)}%` }} aria-hidden />
                    </div>
                    <span className="w-14 text-right text-xs tabular-nums font-semibold text-[var(--ink)]">{fmt(m.rmse)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-[11px] font-medium text-[var(--muted)]">MAE</span>
                    <div className="flex-1 h-2.5 rounded-full bg-[var(--surface)] border border-[var(--line)] overflow-hidden">
                      <i className="block h-full rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/30" style={{ width: `${Math.max(maeW, 2)}%` }} aria-hidden />
                    </div>
                    <span className="w-14 text-right text-xs tabular-nums font-semibold text-[var(--ink)]">{fmt(m.mae)}</span>
                  </div>
                </div>
              </div>
            )
          })}
          {/* baseline row muted dashed */}
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-[var(--muted)] italic">{baseline.label} <span className="ml-1 inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold not-italic">Reference</span></span>
              <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--muted)]">R² {fmt(baseline.r2)}</span>
            </div>
            <div className="mt-2 grid gap-1.5 opacity-80">
              <div className="flex items-center gap-2">
                <span className="w-10 text-[11px] font-medium text-[var(--muted)]">RMSE</span>
                <div className="flex-1 h-2.5 rounded-full bg-[var(--surface)] border border-[var(--line)] overflow-hidden">
                  <i className="block h-full rounded-full bg-[var(--line-strong)]" style={{ width: `${typeof baseline.rmse === 'number' && Number.isFinite(baseline.rmse) ? (baseline.rmse / maxErr) * 100 : 0}%` }} aria-hidden />
                </div>
                <span className="w-14 text-right text-xs tabular-nums font-semibold text-[var(--muted)]">{fmt(baseline.rmse)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 text-[11px] font-medium text-[var(--muted)]">MAE</span>
                <div className="flex-1 h-2.5 rounded-full bg-[var(--surface)] border border-[var(--line)] overflow-hidden">
                  <i className="block h-full rounded-full bg-[var(--surface-3)] border border-[var(--line-strong)]" style={{ width: `${typeof baseline.mae === 'number' && Number.isFinite(baseline.mae) ? (baseline.mae / maxErr) * 100 : 0}%` }} aria-hidden />
                </div>
                <span className="w-14 text-right text-xs tabular-nums font-semibold text-[var(--muted)]">{fmt(baseline.mae)}</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[var(--muted)]">Bars share one scale (max {fmt(maxErr)}). Shorter is better. R² not on same scale — shown numerically.</p>
        </div>
      )}
    </div>
  )
}

// ---------- Feature importance — horizontal bars ----------
const INSIGHT_TITLES: Record<InsightsMethod, string> = {
  'standardized-coefficients': 'Standardized coefficients',
  'permutation-importance': 'Permutation importance',
}

function ImportanceBars({
  insights,
  method,
  note,
}: {
  insights: Array<{ feature: string; coefficient: number | null; interpretation: string }>
  method: InsightsMethod
  note: string
}) {
  const rows = insights.filter((r): r is { feature: string; coefficient: number; interpretation: string } => typeof r.coefficient === 'number' && Number.isFinite(r.coefficient))
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.coefficient)), 1)
  const isDiverging = method === 'standardized-coefficients'
  const hasData = rows.length > 0

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Attribution</p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">Feature Importance</h3>
          <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-[var(--muted)]">
            <strong className="font-semibold text-[var(--ink)]">{INSIGHT_TITLES[method]}.</strong> {note}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[var(--muted)]">{method}</span>
      </div>

      {!hasData ? (
        <div className="mt-4 grid place-items-center min-h-[10rem] border border-dashed border-[var(--line-strong)] rounded-[var(--radius)] bg-[var(--surface)] p-4 text-center">
          <p className="text-xs text-[var(--muted)]">Insufficient data for this chart.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {rows.map((row, i) => {
            const v = row.coefficient
            const absW = (Math.abs(v) / maxAbs) * 100
            const isNeg = v < 0
            // diverging: bar from center 50% outward; non-directional: from 0% with full accent
            // simpler: unified track, fill width absW, color by sign when diverging, else emerald
            const fill = !isDiverging ? 'var(--accent)' : isNeg ? 'var(--error)' : 'var(--accent)'
            return (
              <div key={`${row.feature}-${i}`} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[var(--ink)]">
                    <span className="text-[11px] font-bold tabular-nums text-[var(--muted)] mr-2">{i + 1}.</span>
                    {row.feature}
                  </span>
                  <span className="text-xs tabular-nums font-semibold" style={{ color: fill }}>{fmt(v)}</span>
                </div>
                <div className="relative h-2.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden">
                  {/* center line when diverging */}
                  {isDiverging && <span className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--line-strong)]" aria-hidden />}
                  <i
                    className="absolute top-0 bottom-0 rounded-full"
                    style={{
                      background: fill,
                      width: `${Math.max(absW, 2)}%`,
                      left: isDiverging ? (isNeg ? `calc(50% - ${absW}%)` : '50%') : '0',
                      opacity: 0.95,
                    }}
                    aria-hidden
                  />
                </div>
                <p className="m-0 text-[11px] leading-relaxed text-[var(--muted)]">{row.interpretation}</p>
              </div>
            )
          })}
          {isDiverging && (
            <div className="flex items-center gap-3 text-[11px] text-[var(--muted)] pt-1 border-t border-[var(--line)] mt-1">
              <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-[var(--accent)] inline-block" aria-hidden /> positive</span>
              <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-[var(--error)] inline-block" aria-hidden /> negative</span>
              <span className="ml-auto">center 0 · length ∝ |coefficient|</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Orchestrator ----------
export function VisualAnalytics({ report }: Props) {
  const hasReport = !!report?.profile

  // gallery empty: only when truly no report and no preview allowed
  // We always show at least previews for the two hero charts when report==null
  const showGalleryEmpty = !hasReport && false // keep cards visible as previews instead

  return (
    <section id="visuals" className="scroll-mt-20 report-section" aria-labelledby="visuals-title">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Visual Analytics</p>
          <h2 id="visuals-title" className="!mb-1">Visuals</h2>
          <p className="m-0 max-w-[68ch] text-sm leading-relaxed text-[var(--muted)]">
            Polished charts from the same live analysis — histogram, diagnostics, model comparison, correlations, and attribution. No new backend calls; SVG + Tailwind only.
          </p>
        </div>
        {hasReport && <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] border border-[var(--line)]">live</span>}
      </div>

      {showGalleryEmpty ? (
        <div className="grid place-items-center min-h-[18rem] border border-dashed border-[var(--line-strong)] rounded-[var(--radius)] bg-[var(--surface)] p-6 text-center">
          <p className="text-[var(--muted)] text-sm">No analysis data yet — upload a dataset to see visuals.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4">
          {/* Row 1 — hero full-width: Target distribution */}
          <TargetHistogram
            bins={report ? report.profile.targetSummary.map((b) => ({ label: b.label, value: b.value })) : null}
            targetLabel={report?.dataset.target}
            unit={report?.prediction.unit}
          />

          {/* Row 2 — diagnostics pair */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ActualVsPredictedScatter
              data={
                report
                  ? report.prediction.actualVsPredicted
                      .filter((p): p is { actual: number; predicted: number; residual: number | null } => typeof p.actual === 'number' && Number.isFinite(p.actual) && typeof p.predicted === 'number' && Number.isFinite(p.predicted))
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report ? (
              <ModelBars models={report.models} baseline={report.evaluation.baseline} />
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5 opacity-90">
                <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Model comparison</p>
                <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">Model Performance</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">Preview — upload a dataset for live RMSE/MAE.</p>
                <div className="mt-4 grid gap-3 opacity-60">
                  {['Random Forest', 'Gradient Boosting', 'Ridge'].map((label) => (
                    <div key={label} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 p-3">
                      <div className="flex justify-between"><span className="text-[13px] font-semibold text-[var(--ink)]">{label}</span><span className="text-xs tabular-nums text-[var(--muted)]">R² —</span></div>
                      <div className="mt-2 h-2.5 rounded-full bg-[var(--surface)] border border-[var(--line)] overflow-hidden"><i className="block h-full bg-[var(--accent)] w-[62%]" aria-hidden /></div>
                    </div>
                  ))}
                </div>
                <span className="mt-3 inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Preview</span>
              </div>
            )}
            <CorrelationBars correlations={report ? report.profile.correlations.map(({ feature, value }) => ({ feature, value })) : null} />
          </div>

          {/* Row 4 — importance full-width */}
          {report ? (
            <ImportanceBars insights={report.insights} method={report.insightsMethod} note={report.insightsNote} />
          ) : (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5 opacity-90">
              <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Attribution</p>
              <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">Feature Importance</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">Preview — upload a dataset for live attribution.</p>
              <div className="mt-4 grid gap-2 opacity-60">
                {['Rainfall', 'Temperature', 'Soil pH'].map((f, i) => (
                  <div key={f} className="grid gap-1">
                    <div className="flex justify-between"><span className="text-[13px] font-semibold text-[var(--ink)]">{i + 1}. {f}</span><span className="text-xs tabular-nums text-[var(--muted)]">0.{6 - i}</span></div>
                    <div className="h-2.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden"><i className="block h-full bg-[var(--accent)]" style={{ width: `${72 - i * 18}%` }} aria-hidden /></div>
                  </div>
                ))}
              </div>
              <span className="mt-3 inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Preview</span>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Charts are derived from the current <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-[11px]">AnalysisReport</code> only — no additional network requests. Y-axes are scaled to the data present, not to external benchmarks.
      </p>
    </section>
  )
}

export default VisualAnalytics
