import { useMemo, useState } from 'react'

export type ActualVsPredictedPoint = {
  actual: number
  predicted: number
  residual?: number | null
}

type Props = {
  data: ActualVsPredictedPoint[] | null
  evidenceTotal?: number
  targetLabel?: string
}

// ViewBox 520x360 — spec task 2
const VB_W = 520
const VB_H = 360
const PAD = { top: 16, right: 16, bottom: 44, left: 48 }

function extent(values: number[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return [lo, hi]
}

function scaleLinear(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain
  const [r0, r1] = range
  const dSpan = d1 - d0 || 1
  const rSpan = r1 - r0
  return (v: number) => r0 + ((v - d0) / dSpan) * rSpan
}

function niceTicks(domain: [number, number], count = 5): number[] {
  const [d0, d1] = domain
  const span = d1 - d0 || 1
  // raw step
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  let step: number
  if (norm < 1.5) step = mag
  else if (norm < 3.5) step = 2 * mag
  else if (norm < 7.5) step = 5 * mag
  else step = 10 * mag
  const start = Math.ceil(d0 / step) * step
  const ticks: number[] = []
  for (let v = start; v <= d1 + 1e-9; v += step) {
    // avoid floating drift
    const rounded = Math.round(v / step) * step
    ticks.push(Number(rounded.toFixed(10)))
  }
  // ensure at least 2 ticks: fallback to domain ends
  if (ticks.length < 2) return [d0, d1]
  return ticks
}

function r2Score(points: ActualVsPredictedPoint[]): number | null {
  if (points.length < 2) return null
  let sum = 0
  for (const p of points) sum += p.actual
  const mean = sum / points.length
  let ssRes = 0
  let ssTot = 0
  for (const p of points) {
    const e = p.actual - p.predicted
    ssRes += e * e
    const d = p.actual - mean
    ssTot += d * d
  }
  if (ssTot === 0) return null
  return 1 - ssRes / ssTot
}

function formatTick(v: number): string {
  const abs = Math.abs(v)
  if (abs !== 0 && (abs >= 1000 || abs < 0.1)) return v.toExponential(1)
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 10) return v.toFixed(1)
  return v.toFixed(2).replace(/\.?0+$/, '')
}

export function ActualVsPredictedScatter({ data, evidenceTotal, targetLabel }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const filtered = useMemo(() => {
    if (!data?.length) return []
    const out: ActualVsPredictedPoint[] = []
    for (const d of data) {
      if (typeof d.actual !== 'number' || !Number.isFinite(d.actual)) continue
      if (typeof d.predicted !== 'number' || !Number.isFinite(d.predicted)) continue
      out.push(d)
      if (out.length >= 250) break
    }
    return out
  }, [data])

  const empty = filtered.length === 0

  const { domain, sx, sy, ticks, r2 } = useMemo(() => {
    if (empty) {
      const d: [number, number] = [0, 1]
      return {
        domain: d,
        sx: scaleLinear(d, [PAD.left, VB_W - PAD.right]),
        sy: scaleLinear(d, [VB_H - PAD.bottom, PAD.top]),
        ticks: niceTicks(d),
        r2: null as number | null,
      }
    }
    const vals = filtered.flatMap((p) => [p.actual, p.predicted])
    let [lo, hi] = extent(vals)
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0
      hi = 1
    }
    if (lo === hi) {
      const pad = Math.abs(lo) * 0.05 || 1
      lo -= pad
      hi += pad
    } else {
      const pad = (hi - lo) * 0.05
      lo -= pad
      hi += pad
    }
    const domain: [number, number] = [lo, hi]
    const sx = scaleLinear(domain, [PAD.left, VB_W - PAD.right])
    const sy = scaleLinear(domain, [VB_H - PAD.bottom, PAD.top])
    const ticks = niceTicks(domain, 5)
    const r2 = r2Score(filtered)
    return { domain, sx, sy, ticks, r2 }
  }, [empty, filtered])

  const hoverPoint = hoverIdx !== null ? filtered[hoverIdx] ?? null : null

  // Card shell — same tokens as globals.css so dark-mode adapts via CSS vars
  const cardBase =
    'rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5'

  if (empty) {
    return (
      <article className={cardBase} aria-labelledby="avp-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-[0.14em] uppercase text-[var(--muted)] font-semibold">Model diagnostics</p>
            <h3 id="avp-title" className="text-sm font-semibold text-[var(--ink)] mt-1">Actual vs Predicted</h3>
            <p className="text-xs text-[var(--muted)] mt-1">Historical holdout — diagonal is perfect prediction</p>
          </div>
        </div>
        <div className="mt-4 grid place-items-center min-h-[18rem] border border-dashed border-[var(--line-strong)] rounded-[var(--radius)] bg-[var(--surface)] p-6 text-center">
          <div>
            <p className="text-[var(--muted)] text-sm">Upload a dataset to see actual vs predicted scatter</p>
            <p className="text-[var(--muted)] text-xs mt-1">Points appear after a successful analysis with holdout evidence.</p>
          </div>
        </div>
      </article>
    )
  }

  const [d0, d1] = domain
  const diagX1 = sx(d0)
  const diagY1 = sy(d0)
  const diagX2 = sx(d1)
  const diagY2 = sy(d1)

  const shown = filtered.length
  const total = evidenceTotal ?? shown
  const evidenceNote =
    total > shown ? `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} holdout points` : `Showing ${shown.toLocaleString()} holdout points`

  return (
    <article className={cardBase} aria-labelledby="avp-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-[0.14em] uppercase text-[var(--muted)] font-semibold">Model diagnostics</p>
          <h3 id="avp-title" className="text-sm font-semibold text-[var(--ink)] mt-1">Actual vs Predicted</h3>
          <p className="text-xs text-[var(--muted)] mt-1">Historical holdout — diagonal is perfect prediction</p>
        </div>
        {r2 !== null && Number.isFinite(r2) && (
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] tabular-nums">
            R² {r2.toFixed(2)}
          </span>
        )}
      </div>

      <p className="text-[11px] text-[var(--muted)] mt-2">{evidenceNote}{targetLabel ? ` · target: ${targetLabel}` : ''}</p>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-3 h-[2px] rounded-full bg-[var(--line-strong)]" style={{ borderTop: '2px dashed var(--line-strong)', background: 'transparent', height: 0, width: 14 }} aria-hidden />
          <span className="inline-block w-[14px] border-t-2 border-dashed border-[var(--line-strong)]" aria-hidden />
          diagonal y = x
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--accent)] opacity-80" aria-hidden />
          predicted
        </span>
      </div>

      <div className="relative mt-3">
        <svg
          role="img"
          aria-label={`Actual vs predicted scatter with ${shown} points. Diagonal is perfect prediction.`}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full h-auto block select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <title>Actual vs predicted — {shown} holdout points</title>
          {/* Grid */}
          {ticks.map((t) => {
            const y = sy(t)
            const x = sx(t)
            return (
              <g key={`grid-${t}`}>
                <line x1={PAD.left} x2={VB_W - PAD.right} y1={y} y2={y} stroke="var(--line)" strokeWidth={0.9} strokeDasharray="0" opacity={0.9} />
                <line x1={x} x2={x} y1={PAD.top} y2={VB_H - PAD.bottom} stroke="var(--line)" strokeWidth={0.7} opacity={0.45} />
              </g>
            )
          })}

          {/* Axes */}
          <line x1={PAD.left} x2={VB_W - PAD.right} y1={VB_H - PAD.bottom} y2={VB_H - PAD.bottom} stroke="var(--line-strong)" strokeWidth={1.1} />
          <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={VB_H - PAD.bottom} stroke="var(--line-strong)" strokeWidth={1.1} />

          {/* Diagonal y=x */}
          <line x1={diagX1} y1={diagY1} x2={diagX2} y2={diagY2} stroke="var(--line-strong)" strokeWidth={1.25} strokeDasharray="6 5" opacity={0.95} />

          {/* Points */}
          {filtered.map((p, i) => {
            const cx = sx(p.actual)
            const cy = sy(p.predicted)
            const isHover = hoverIdx === i
            return (
              <circle
                key={`${p.actual}-${p.predicted}-${i}`}
                cx={cx}
                cy={cy}
                r={isHover ? 5 : 3.5}
                fill="var(--accent)"
                opacity={isHover ? 1 : 0.78}
                stroke="var(--surface)"
                strokeWidth={isHover ? 1.2 : 0.9}
                tabIndex={0}
                role="img"
                aria-label={`Point ${i + 1}: actual ${formatTick(p.actual)}, predicted ${formatTick(p.predicted)}`}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                onFocus={() => setHoverIdx(i)}
                onBlur={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                style={{ cursor: 'pointer' }}
              >
                <title>{`Actual ${formatTick(p.actual)} · Predicted ${formatTick(p.predicted)}${p.residual != null && Number.isFinite(p.residual) ? ` · Residual ${formatTick(p.residual)}` : ''}`}</title>
              </circle>
            )
          })}

          {/* X ticks & labels */}
          {ticks.map((t) => {
            const x = sx(t)
            return (
              <g key={`xt-${t}`}>
                <line x1={x} x2={x} y1={VB_H - PAD.bottom} y2={VB_H - PAD.bottom + 4} stroke="var(--line-strong)" strokeWidth={1} />
                <text x={x} y={VB_H - PAD.bottom + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">{formatTick(t)}</text>
              </g>
            )
          })}
          {/* Y ticks & labels */}
          {ticks.map((t) => {
            const y = sy(t)
            return (
              <g key={`yt-${t}`}>
                <line x1={PAD.left} x2={PAD.left - 4} y1={y} y2={y} stroke="var(--line-strong)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize={11} fill="var(--muted)">{formatTick(t)}</text>
              </g>
            )
          })}

          {/* Axis titles */}
          <text x={(PAD.left + VB_W - PAD.right) / 2} y={VB_H - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--muted)">
            Actual{targetLabel ? ` — ${targetLabel}` : ''}
          </text>
          <text
            x={12}
            y={(PAD.top + VB_H - PAD.bottom) / 2}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="var(--muted)"
            transform={`rotate(-90 12 ${(PAD.top + VB_H - PAD.bottom) / 2})`}
          >
            Predicted{targetLabel ? ` — ${targetLabel}` : ''}
          </text>
        </svg>

        {/* Floating tooltip for hover/focus — positioned via viewBox percentages */}
        {hoverPoint && hoverIdx !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg bg-[var(--ink)] text-[var(--surface)] text-xs leading-4 px-2.5 py-1.5 shadow-lg border border-[var(--line-strong)]"
            style={{
              left: `${(sx(hoverPoint.actual) / VB_W) * 100}%`,
              top: `${(sy(hoverPoint.predicted) / VB_H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 10px))',
              whiteSpace: 'nowrap',
            }}
            role="status"
            aria-live="polite"
          >
            <span className="font-semibold tabular-nums">A {formatTick(hoverPoint.actual)}</span>
            <span className="mx-1 opacity-70">·</span>
            <span className="tabular-nums">P {formatTick(hoverPoint.predicted)}</span>
            {hoverPoint.residual != null && Number.isFinite(hoverPoint.residual) && (
              <span className="ml-1 opacity-80 tabular-nums">({hoverPoint.residual > 0 ? '+' : ''}{formatTick(hoverPoint.residual)})</span>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-[var(--muted)] mt-2">X = actual, Y = predicted. Points on the dashed diagonal are exactly correct; distance from it is the residual.</p>
    </article>
  )
}

export default ActualVsPredictedScatter
