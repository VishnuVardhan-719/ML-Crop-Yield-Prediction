import { useMemo, useState } from 'react'
import type { ActualVsPredicted } from '../../types/analysis'

type ResidualChartProps = {
  residuals: Array<number | null> | null
  actualVsPredicted?: ActualVsPredicted[]
}

// ---- pure helpers (no deps) -------------------------------------------------

function extent(values: number[]): [number, number] | null {
  if (!values.length) return null
  let lo = values[0]
  let hi = values[0]
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.05 || 1
    return [lo - pad, hi + pad]
  }
  const pad = (hi - lo) * 0.05
  return [lo - pad, hi + pad]
}

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const m = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0)
  return (v: number) => r0 + (v - d0) * m
}

function niceTicks(domain: [number, number], count = 4): number[] {
  const [lo, hi] = domain
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  const step = (hi - lo) / count
  if (step === 0) return [lo]
  const ticks: number[] = []
  for (let i = 0; i <= count; i++) ticks.push(lo + step * i)
  return ticks
}

function binResiduals(values: number[], bins = 10) {
  if (!values.length) return [] as Array<{ x0: number; x1: number; count: number; mid: number }>
  const e = extent(values)
  if (!e) return []
  const [lo, hi] = e
  // use tight extent for binning, not padded extent, so bars fill range
  const tLo = Math.min(...values)
  const tHi = Math.max(...values)
  const span = tHi - tLo || 1
  const step = span / bins
  const out = Array.from({ length: bins }, (_, i) => {
    const x0 = tLo + step * i
    const x1 = i === bins - 1 ? tHi : x0 + step
    return { x0, x1, count: 0, mid: x0 + step / 2 }
  })
  for (const v of values) {
    let idx = Math.floor((v - tLo) / step)
    if (idx < 0) idx = 0
    if (idx >= bins) idx = bins - 1
    out[idx].count++
  }
  // keep original padded edges for scale, but label with actual bin edges
  void lo; void hi
  return out
}

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return '—'
  // avoid -0.00
  const v = Object.is(n, -0) ? 0 : n
  return v.toFixed(d)
}

// ---- component --------------------------------------------------------------

export function ResidualChart({ residuals, actualVsPredicted }: ResidualChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const cleanResiduals = useMemo(() => {
    const src = residuals ?? []
    return src.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  }, [residuals])

  const scatterPoints = useMemo(() => {
    if (!actualVsPredicted?.length) return [] as Array<{ predicted: number; residual: number; actual: number | null }>
    return actualVsPredicted
      .filter(
        (p): p is { actual: number | null; predicted: number; residual: number } =>
          typeof p.predicted === 'number' &&
          Number.isFinite(p.predicted) &&
          typeof p.residual === 'number' &&
          Number.isFinite(p.residual),
      )
      .map((p) => ({ predicted: p.predicted, residual: p.residual, actual: p.actual }))
  }, [actualVsPredicted])

  // fallback: if residuals empty but scatter has residuals, derive from scatter
  const histValues = cleanResiduals.length ? cleanResiduals : scatterPoints.map((p) => p.residual)
  const hasScatter = scatterPoints.length > 0
  const hasHist = histValues.length > 0
  const isEmpty = !hasScatter && !hasHist

  const histBins = useMemo(() => binResiduals(histValues, 10), [histValues])

  // scales for scatter -------------------------------------------------------
  const SC_W = 480
  const SC_H = 200
  const SC_PAD = { l: 44, r: 16, t: 16, b: 28 }

  const scatterScales = useMemo(() => {
    if (!hasScatter) return null
    const xs = scatterPoints.map((p) => p.predicted)
    const ys = scatterPoints.map((p) => p.residual)
    const xDom = extent(xs) ?? [0, 1]
    const yDom = extent(ys) ?? [-1, 1]
    // ensure zero is inside y domain for reference line visibility
    const yLo = Math.min(yDom[0], 0)
    const yHi = Math.max(yDom[1], 0)
    const sx = scaleLinear(xDom, [SC_PAD.l, SC_W - SC_PAD.r])
    const sy = scaleLinear([yLo, yHi], [SC_H - SC_PAD.b, SC_PAD.t])
    return { xDom, yDom: [yLo, yHi] as [number, number], sx, sy, xs, ys }
  }, [hasScatter, scatterPoints])

  // scales for histogram -----------------------------------------------------
  const HI_W = 480
  const HI_H = 110
  const HI_PAD = { l: 44, r: 16, t: 12, b: 26 }
  const histScales = useMemo(() => {
    if (!hasHist || !histBins.length) return null
    const maxC = Math.max(...histBins.map((b) => b.count), 1)
    const yDom: [number, number] = [0, Math.ceil(maxC * 1.1) || 1]
    const residualsExtent = extent(histValues) ?? [-1, 1]
    // x scale for positioning bars by bin mid
    const sx = scaleLinear(residualsExtent, [HI_PAD.l, HI_W - HI_PAD.r])
    const sy = scaleLinear(yDom, [HI_H - HI_PAD.b, HI_PAD.t])
    return { yDom, sx, sy, maxC, residualsExtent }
  }, [hasHist, histBins, histValues])

  if (isEmpty) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Diagnostics</p>
            <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight">Residual Analysis</h3>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-[52ch]">
              Positive = model underestimated, negative = overestimated. Bar length is error magnitude.
            </p>
          </div>
          <span className="inline-flex h-6 items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[10px] font-semibold tracking-widest uppercase text-[var(--muted)]">
            No data
          </span>
        </div>
        <div className="grid place-items-center min-h-[18rem] border border-dashed border-[var(--line-strong)] rounded-[var(--radius)] bg-[var(--surface)] p-6 text-center">
          <div>
            <p className="text-[var(--muted)] text-sm">No analysis data yet — upload a dataset to see visuals.</p>
            <p className="text-[var(--muted)] text-xs mt-1">Residuals appear after a model is evaluated on held-out rows.</p>
          </div>
        </div>
      </div>
    )
  }

  const hoverPoint = hoverIdx !== null ? scatterPoints[hoverIdx] ?? null : null

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Diagnostics</p>
          <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight">Residual Analysis</h3>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-[60ch]">
            Positive = model underestimated, negative = overestimated. Bar length is error magnitude.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden /> underestimate
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--error)' }} aria-hidden /> overestimate
          </span>
        </div>
      </div>

      {/* (a) scatter: Residual vs Predicted */}
      {hasScatter && scatterScales ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--ink)]">Residual vs Predicted</p>
            <span className="text-[11px] text-[var(--muted)]">{scatterPoints.length} points {scatterPoints.length >= 250 ? '· sampled' : ''}</span>
          </div>
          <div className="relative mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 p-2">
            <svg
              viewBox={`0 0 ${SC_W} ${SC_H}`}
              className="w-full h-auto block"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Residual vs predicted scatter, ${scatterPoints.length} points`}
            >
              <title>Residual vs predicted — horizontal is predicted value, vertical is residual (actual minus predicted)</title>
              {/* grid */}
              {niceTicks(scatterScales.yDom, 4).map((t) => {
                const y = scatterScales.sy(t)
                return <line key={`gy-${t}`} x1={SC_PAD.l} x2={SC_W - SC_PAD.r} y1={y} y2={y} stroke="var(--line)" strokeWidth={0.8} opacity={0.9} />
              })}
              {niceTicks(scatterScales.xDom, 4).map((t) => {
                const x = scatterScales.sx(t)
                return <line key={`gx-${t}`} x1={x} x2={x} y1={SC_PAD.t} y2={SC_H - SC_PAD.b} stroke="var(--line)" strokeWidth={0.7} opacity={0.55} />
              })}
              {/* zero line */}
              {(() => {
                const y0 = scatterScales.sy(0)
                return <line x1={SC_PAD.l} x2={SC_W - SC_PAD.r} y1={y0} y2={y0} stroke="var(--line-strong)" strokeWidth={1.2} strokeDasharray="6 4" />
              })()}
              {/* axes */}
              <line x1={SC_PAD.l} x2={SC_W - SC_PAD.r} y1={SC_H - SC_PAD.b} y2={SC_H - SC_PAD.b} stroke="var(--line-strong)" strokeWidth={1} />
              <line x1={SC_PAD.l} x2={SC_PAD.l} y1={SC_PAD.t} y2={SC_H - SC_PAD.b} stroke="var(--line-strong)" strokeWidth={1} />
              {/* ticks + labels */}
              {niceTicks(scatterScales.yDom, 4).map((t) => {
                const y = scatterScales.sy(t)
                return (
                  <g key={`ty-${t}`}>
                    <text x={SC_PAD.l - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">{fmt(t, 1)}</text>
                  </g>
                )
              })}
              {niceTicks(scatterScales.xDom, 4).map((t) => {
                const x = scatterScales.sx(t)
                return (
                  <text key={`tx-${t}`} x={x} y={SC_H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)">{fmt(t, 0)}</text>
                )
              })}
              <text x={SC_W / 2} y={SC_H - 2} textAnchor="middle" fontSize={10} fill="var(--muted)" fontWeight={600}>Predicted</text>
              <text transform={`rotate(-90 ${12} ${SC_H / 2})`} x={12} y={SC_H / 2} textAnchor="middle" fontSize={10} fill="var(--muted)" fontWeight={600}>Residual</text>

              {/* points */}
              {scatterPoints.map((pt, i) => {
                const cx = scatterScales.sx(pt.predicted)
                const cy = scatterScales.sy(pt.residual)
                const isHover = i === hoverIdx
                const fill = pt.residual >= 0 ? 'var(--accent)' : 'var(--error)'
                return (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={isHover ? 5 : 3.5}
                    fill={fill}
                    stroke="var(--surface)"
                    strokeWidth={isHover ? 1.5 : 1}
                    opacity={isHover ? 1 : 0.9}
                    tabIndex={0}
                    role="img"
                    aria-label={`predicted ${fmt(pt.predicted)} residual ${fmt(pt.residual)}`}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx((v) => (v === i ? null : v))}
                    onFocus={() => setHoverIdx(i)}
                    onBlur={() => setHoverIdx((v) => (v === i ? null : v))}
                  >
                    <title>pred {fmt(pt.predicted)} · resid {fmt(pt.residual)} {pt.actual !== null ? `· actual ${fmt(pt.actual as number)}` : ''}</title>
                  </circle>
                )
              })}
            </svg>
            {/* rich hover tooltip */}
            {hoverPoint && scatterScales && (
              <div
                className="pointer-events-none absolute z-10 rounded-lg border border-[var(--line-strong)] bg-[var(--ink)] text-white px-2.5 py-2 text-xs leading-tight shadow-lg"
                style={{
                  left: `clamp(8px, ${((scatterScales.sx(hoverPoint.predicted) / SC_W) * 100).toFixed(1)}%, calc(100% - 160px))`,
                  top: 12,
                }}
              >
                <div className="font-semibold">pred {fmt(hoverPoint.predicted)} · resid {fmt(hoverPoint.residual)}</div>
                {hoverPoint.actual !== null && <div className="opacity-80">actual {fmt(hoverPoint.actual as number)}</div>}
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5"><i className="w-3 h-[2px] block" style={{ background: 'var(--line-strong)', borderTop: '1px dashed var(--line-strong)' }} aria-hidden /> zero line</span>
            <span>emerald above = underestimate · red below = overestimate</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid place-items-center min-h-[10rem] border border-dashed border-[var(--line-strong)] rounded-xl bg-[var(--surface)] p-4 text-center">
          <p className="text-xs text-[var(--muted)]">Insufficient data for residual vs predicted scatter.</p>
        </div>
      )}

      {/* (b) histogram: residual distribution */}
      {hasHist && histScales ? (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--ink)]">Residual distribution</p>
            <span className="text-[11px] text-[var(--muted)]">{histValues.length} residuals · {histBins.length} bins</span>
          </div>
          <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/40 p-2">
            <svg
              viewBox={`0 0 ${HI_W} ${HI_H}`}
              className="w-full h-auto block"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Residual histogram, ${histBins.length} bins`}
            >
              <title>Residual histogram — bar height is count of residuals in that error interval</title>
              {/* grid y */}
              {niceTicks(histScales.yDom, 3).map((t) => {
                if (t === 0) return null
                const y = histScales.sy(t)
                return <line key={`hgy-${t}`} x1={HI_PAD.l} x2={HI_W - HI_PAD.r} y1={y} y2={y} stroke="var(--line)" strokeWidth={0.7} opacity={0.9} />
              })}
              {/* zero line vertical at residual=0 */}
              {(() => {
                const x0 = histScales.sx(0)
                const clamped = Math.max(HI_PAD.l, Math.min(HI_W - HI_PAD.r, x0))
                const inRange = histScales.residualsExtent[0] <= 0 && 0 <= histScales.residualsExtent[1]
                if (!inRange) return null
                return <line x1={clamped} x2={clamped} y1={HI_PAD.t} y2={HI_H - HI_PAD.b} stroke="var(--line-strong)" strokeWidth={1.1} strokeDasharray="6 4" />
              })()}
              {/* axes */}
              <line x1={HI_PAD.l} x2={HI_W - HI_PAD.r} y1={HI_H - HI_PAD.b} y2={HI_H - HI_PAD.b} stroke="var(--line-strong)" strokeWidth={1} />
              <line x1={HI_PAD.l} x2={HI_PAD.l} y1={HI_PAD.t} y2={HI_H - HI_PAD.b} stroke="var(--line-strong)" strokeWidth={1} />

              {/* y ticks */}
              {niceTicks(histScales.yDom, 3).map((t) => {
                const y = histScales.sy(t)
                return (
                  <text key={`hty-${t}`} x={HI_PAD.l - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">{fmt(t, 0)}</text>
                )
              })}
              {/* x ticks: min, 0, max */}
              {(() => {
                const [lo, hi] = histScales.residualsExtent
                const ticks = [lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i && Number.isFinite(v))
                return ticks.map((t) => {
                  const x = histScales.sx(t)
                  return <text key={`htx-${t}`} x={x} y={HI_H - 7} textAnchor="middle" fontSize={10} fill="var(--muted)">{fmt(t, 1)}</text>
                })
              })()}
              <text x={HI_W / 2} y={HI_H - 1} textAnchor="middle" fontSize={10} fill="var(--muted)" fontWeight={600}>Residual</text>

              {/* bars */}
              {(() => {
                const plotW = HI_W - HI_PAD.l - HI_PAD.r
                const gap = 2
                const barW = Math.max(4, plotW / histBins.length - gap)
                return histBins.map((b, i) => {
                  const xCenter = histScales.sx(b.mid)
                  const x = xCenter - barW / 2
                  const yTop = histScales.sy(b.count)
                  const yBase = histScales.sy(0)
                  const h = Math.max(0, yBase - yTop)
                  // color by side of zero: mid<0 -> error, else accent
                  const isNeg = b.mid < 0
                  return (
                    <g key={i} tabIndex={0} role="img" aria-label={`residual ${fmt(b.x0, 1)} to ${fmt(b.x1, 1)} count ${b.count}`}>
                      <title>{fmt(b.x0, 2)} – {fmt(b.x1, 2)} : {b.count}</title>
                      <rect
                        x={x}
                        y={h < 0.5 ? yBase - 1 : yTop}
                        width={barW}
                        height={h < 0.5 ? 1 : h}
                        rx={3}
                        fill={isNeg ? 'var(--error)' : 'var(--accent)'}
                        opacity={0.92}
                        stroke={isNeg ? 'color-mix(in srgb, var(--error) 55%, var(--surface))' : 'color-mix(in srgb, var(--accent) 45%, var(--surface))'}
                        strokeWidth={0.8}
                      />
                      {b.count > 0 && h > 14 && (
                        <text x={xCenter} y={yTop + 11} textAnchor="middle" fontSize={9} fontWeight={700} fill="white">
                          {b.count}
                        </text>
                      )}
                      {b.count > 0 && h <= 14 && (
                        <text x={xCenter} y={yTop - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--muted)">
                          {b.count}
                        </text>
                      )}
                    </g>
                  )
                })
              })()}
            </svg>
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">Tall bars near zero = small errors are common. Long tails = occasional larger misses.</p>
        </div>
      ) : (
        <div className="mt-5 grid place-items-center min-h-[8rem] border border-dashed border-[var(--line-strong)] rounded-xl bg-[var(--surface)] p-4 text-center">
          <p className="text-xs text-[var(--muted)]">Insufficient data for this chart.</p>
        </div>
      )}
    </div>
  )
}

export default ResidualChart
