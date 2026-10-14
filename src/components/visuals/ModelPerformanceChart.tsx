import { useMemo } from 'react'

export type ModelPerformanceRow = {
  model: string
  label: string
  rmse: number | null
  mae: number | null
  r2: number | null
  selected: boolean
}

type Props = {
  models: ModelPerformanceRow[] | null
  baseline?: { label?: string; rmse: number | null; mae: number | null; r2?: number | null } | null
  preview?: boolean
}

// Poster fallback — only when models == null (preview). Never in live path.
const POSTER_ROWS: ReadonlyArray<{ model: string; label: string; rmse: number; mae: number; r2: number }> = [
  { model: 'ridge', label: 'Ridge', rmse: 1.82, mae: 1.34, r2: 0.71 },
  { model: 'lasso', label: 'Lasso', rmse: 1.76, mae: 1.28, r2: 0.73 },
  { model: 'elastic-net', label: 'Elastic Net', rmse: 1.69, mae: 1.24, r2: 0.75 },
  { model: 'random-forest', label: 'Random Forest', rmse: 1.52, mae: 1.11, r2: 0.80 },
]

const formatNum = (v: number | null | undefined, digits = 2): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—'

function niceMax(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 1
  const padded = rawMax * 1.08
  const mag = Math.pow(10, Math.floor(Math.log10(padded)))
  const norm = padded / mag
  let nice: number
  if (norm <= 1) nice = 1
  else if (norm <= 2) nice = 2
  else if (norm <= 5) nice = 5
  else nice = 10
  return nice * mag
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const step = niceMax(max) / count
  const mag = Math.pow(10, Math.floor(Math.log10(step)))
  const norm = step / mag
  let q: number
  if (norm <= 1) q = 1 * mag
  else if (norm <= 2) q = 2 * mag
  else if (norm <= 5) q = 5 * mag
  else q = 10 * mag
  const ticks: number[] = []
  const niceCeil = Math.ceil(max / q) * q
  for (let v = 0; v <= niceCeil + 1e-9; v += q) ticks.push(Number(v.toFixed(10)))
  return ticks
}

export function ModelPerformanceChart({ models, baseline, preview }: Props) {
  const isPreview = preview === true || models == null || models.length === 0

  const { rows, maxError, ticks, selectedLabel } = useMemo(() => {
    if (isPreview) {
      const previewRows: ModelPerformanceRow[] = POSTER_ROWS.map((r) => ({
        ...r,
        selected: r.model === 'random-forest',
      }))
      const rawMax = Math.max(...POSTER_ROWS.flatMap((r) => [r.rmse, r.mae]))
      const m = niceMax(rawMax)
      const t = niceTicks(m, 4)
      return { rows: previewRows, maxError: m, ticks: t, selectedLabel: 'Random Forest' }
    }
    const live = [...(models as ModelPerformanceRow[])].sort((a, b) => {
      const av = typeof a.rmse === 'number' && Number.isFinite(a.rmse) ? a.rmse : Infinity
      const bv = typeof b.rmse === 'number' && Number.isFinite(b.rmse) ? b.rmse : Infinity
      return av - bv
    })
    const finiteErrors: number[] = []
    for (const r of live) {
      if (typeof r.rmse === 'number' && Number.isFinite(r.rmse)) finiteErrors.push(r.rmse)
      if (typeof r.mae === 'number' && Number.isFinite(r.mae)) finiteErrors.push(r.mae)
    }
    if (baseline && typeof baseline.rmse === 'number' && Number.isFinite(baseline.rmse)) finiteErrors.push(baseline.rmse)
    if (baseline && typeof baseline.mae === 'number' && Number.isFinite(baseline.mae)) finiteErrors.push(baseline.mae)
    const rawMax = finiteErrors.length ? Math.max(...finiteErrors) : 1
    const m = niceMax(rawMax)
    const t = niceTicks(m, 4)
    const sel = live.find((r) => r.selected)?.label ?? null
    return { rows: live, maxError: m, ticks: t, selectedLabel: sel }
  }, [isPreview, models, baseline])

  const cardBase = 'rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5'

  const scalePct = (v: number | null): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || maxError <= 0) return 0
    return Math.max(0, Math.min(100, (v / maxError) * 100))
  }

  const baselineLabel = baseline?.label ?? 'Baseline (mean)'

  return (
    <article className={cardBase} aria-labelledby="mpc-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-[0.14em] uppercase text-[var(--muted)] font-semibold">
            Model diagnostics
          </p>
          <h3 id="mpc-title" className="text-sm font-semibold text-[var(--ink)] mt-1">
            Model Performance — Visual Comparison
          </h3>
          <p className="text-xs leading-relaxed text-[var(--muted)] mt-1">
            Lower RMSE / MAE is better. Selected by lowest cross-validated RMSE.
            {isPreview ? null : selectedLabel ? (
              <span className="ml-1 hidden sm:inline opacity-80">· Selected: {selectedLabel}</span>
            ) : null}
          </p>
        </div>
        {isPreview && (
          <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Preview
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-3 h-3 rounded-sm bg-[var(--accent)]" aria-hidden />
          RMSE
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-3 h-3 rounded-sm" style={{ background: '#7fb0d6' }} aria-hidden />
          MAE
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-3 h-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--line-strong)]" aria-hidden />
          R² (higher is better)
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] tracking-wide uppercase text-[var(--muted)]">
          <span>Error (t/ha) →</span>
          <span className="tabular-nums normal-case tracking-normal text-[11px]">max {formatNum(maxError)}</span>
        </div>
        <svg
          role="img"
          aria-label={`Error scale from 0 to ${formatNum(maxError)} tonnes per hectare`}
          viewBox="0 0 480 28"
          className="w-full h-auto block select-none mt-1"
          preserveAspectRatio="xMidYMid meet"
        >
          <title>Error scale 0 to {formatNum(maxError)} t/ha</title>
          <line x1={0} x2={480} y1={8} y2={8} stroke="var(--line-strong)" strokeWidth={1.1} />
          {ticks.map((t) => {
            const x = (t / maxError) * 480
            const clamped = Math.max(0, Math.min(480, x))
            return (
              <g key={`tick-${t}`}>
                <line x1={clamped} x2={clamped} y1={8} y2={14} stroke="var(--line-strong)" strokeWidth={1} />
                <text
                  x={clamped}
                  y={24}
                  textAnchor={clamped < 12 ? 'start' : clamped > 468 ? 'end' : 'middle'}
                  fontSize={10}
                  fill="var(--muted)"
                >
                  {t === 0 ? '0' : formatNum(t)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className={isPreview ? 'mt-3 grid gap-3 opacity-60' : 'mt-3 grid gap-3'}>
        {rows.map((r) => {
          const isSelected = r.selected
          const rmsePct = scalePct(r.rmse)
          const maePct = scalePct(r.mae)
          return (
            <div
              key={r.model}
              className={
                isSelected
                  ? 'rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)]/40 p-3 md:p-3.5'
                  : 'rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 md:p-3.5'
              }
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-[var(--ink)] truncate">{r.label}</span>
                  {isSelected && (
                    <span className="inline-flex items-center rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--on-accent)] shrink-0">
                      Selected
                    </span>
                  )}
                </span>
                <span
                  className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] tabular-nums shrink-0"
                  title={`R squared ${formatNum(r.r2)}`}
                >
                  R² {formatNum(r.r2)}
                </span>
              </div>

              <div className="mt-3 grid gap-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium text-[var(--muted)]">RMSE</span>
                  <span className="tabular-nums font-semibold text-[var(--ink)]">{formatNum(r.rmse)}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${rmsePct}%`, background: 'var(--accent)', minWidth: rmsePct > 0 ? 6 : 0 }}
                    role="img"
                    aria-label={`RMSE ${formatNum(r.rmse)}`}
                  >
                    <title>RMSE {formatNum(r.rmse)} t/ha</title>
                  </div>
                </div>
              </div>

              <div className="mt-2.5 grid gap-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium text-[var(--muted)]">MAE</span>
                  <span className="tabular-nums font-semibold text-[var(--ink)]">{formatNum(r.mae)}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full transition-all border"
                    style={{
                      width: `${maePct}%`,
                      background: '#7fb0d6',
                      borderColor: 'color-mix(in srgb, #7fb0d6 85%, var(--line-strong))',
                      minWidth: maePct > 0 ? 6 : 0,
                    }}
                    role="img"
                    aria-label={`MAE ${formatNum(r.mae)}`}
                  >
                    <title>MAE {formatNum(r.mae)} t/ha</title>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {!isPreview && baseline && (typeof baseline.rmse === 'number' || typeof baseline.mae === 'number') ? (
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)]/60 p-3 md:p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium italic text-[var(--muted)]">
                {baselineLabel}
                <span className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] not-italic">
                  Reference
                </span>
              </span>
              <span className="text-[11px] tabular-nums text-[var(--muted)]">R² {formatNum(baseline.r2 ?? null)}</span>
            </div>
            <div className="mt-3 grid gap-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                <span>RMSE</span>
                <span className="tabular-nums font-medium">{formatNum(baseline.rmse)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--surface)] border border-[var(--line)] overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-[var(--line-strong)]"
                  style={{ width: `${scalePct(baseline.rmse)}%`, minWidth: scalePct(baseline.rmse) > 0 ? 6 : 0 }}
                />
              </div>
            </div>
            <div className="mt-2 grid gap-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                <span>MAE</span>
                <span className="tabular-nums font-medium">{formatNum(baseline.mae)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--surface)] border border-[var(--line)] overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${scalePct(baseline.mae)}%`,
                    background: 'color-mix(in srgb, #7fb0d6 55%, var(--line-strong))',
                    minWidth: scalePct(baseline.mae) > 0 ? 6 : 0,
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {isPreview && (
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)]/60 p-3 md:p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium italic text-[var(--muted)]">Mean baseline</span>
              <span className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Reference
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted)] mt-1">Preview reference — real baseline appears after upload.</p>
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--muted)] mt-3">
        {isPreview ? (
          <>Preview — upload a dataset to see live comparison. Lower is better.</>
        ) : (
          <>
            Lower RMSE / MAE indicates better performance.{' '}
            {selectedLabel ? `Selected: ${selectedLabel} (lowest cross-validated RMSE).` : 'Selected by lowest cross-validated RMSE.'} Baseline is
            a mean-prediction reference every model must beat.
          </>
        )}
      </p>
    </article>
  )
}

export default ModelPerformanceChart
