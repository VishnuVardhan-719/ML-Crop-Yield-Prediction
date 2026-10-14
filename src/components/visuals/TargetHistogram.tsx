import type { AnalysisReport } from '../../types/analysis'

type Bin = { label: string; value: number }

type Props = {
  bins: Bin[] | null
  targetLabel?: string
  unit?: string
}

const PLACEHOLDER_BINS: Bin[] = [
  { label: '0–2', value: 2 },
  { label: '2–3.5', value: 5 },
  { label: '3.5–5', value: 11 },
  { label: '5–6.5', value: 16 },
  { label: '6.5–8', value: 9 },
  { label: '8–10', value: 3 },
]

export function TargetHistogram({ bins: binsProp, targetLabel, unit }: Props) {
  const isPreview = binsProp === null
  const bins: Bin[] = isPreview ? PLACEHOLDER_BINS : binsProp ?? []
  const hasData = bins.length > 0 && bins.some((b) => Number.isFinite(b.value) && b.value > 0)
  const max = Math.max(...bins.map((b) => (Number.isFinite(b.value) ? b.value : 0)), 1)
  const yMax = Math.ceil(max * 1.1) || 1
  const total = bins.reduce((s, b) => s + (Number.isFinite(b.value) ? b.value : 0), 0)

  const W = 640
  const H = 260
  const padL = 48
  const padR = 16
  const padT = 16
  const padB = 48
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const gap = bins.length > 6 ? 6 : bins.length > 4 ? 8 : 12
  const barW = bins.length ? (plotW - gap * (bins.length - 1)) / bins.length : 0

  // 4 ticks 0..yMax
  const yTicks = (() => {
    const t1 = Math.round(yMax / 3)
    const t2 = Math.round((yMax * 2) / 3)
    const raw = [0, t1, t2, yMax]
    // dedupe and sort
    return [...new Set(raw)].sort((a, b) => a - b)
  })()

  const rotateLabels = bins.length > 3
  const titleLabel = targetLabel ?? 'Yield'
  const unitLabel = unit ? ` (${unit})` : isPreview ? ' (t/ha)' : ''

  return (
    <div
      className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5"
      style={{ opacity: isPreview ? 0.92 : 1 }}
      aria-labelledby="target-hist-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Distribution</p>
          <h3 id="target-hist-title" className="mt-1 text-sm font-semibold tracking-tight text-[var(--ink)]">
            Target Distribution
          </h3>
          <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-[var(--muted)]">
            {isPreview
              ? `Preview bell curve — ${total} records across ${bins.length} bins · upload a dataset for live data`
              : `Distribution of ${titleLabel}${unitLabel} across ${total.toLocaleString()} binned records · ${bins.length} bins`}
          </p>
        </div>
        {isPreview ? (
          <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
            Preview
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
            live
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="mt-4 grid place-items-center rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-10 text-center">
          <p className="m-0 text-sm font-medium text-[var(--ink)]">Insufficient data for this chart.</p>
          <p className="mt-1 max-w-[40ch] text-xs text-[var(--muted)]">Upload a dataset to see live bins.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="auto"
            role="img"
            aria-label={
              isPreview
                ? 'Preview histogram of crop yield distribution — bell curve'
                : `Histogram of ${titleLabel} distribution with ${bins.length} bins`
            }
            className="block min-w-[420px]"
            preserveAspectRatio="xMidYMid meet"
          >
            <title>{isPreview ? 'Preview — target distribution' : `${titleLabel} — ${bins.length} bins`}</title>
            {/* y grid */}
            {yTicks.map((t) => {
              const y = padT + plotH - (t / yMax) * plotH
              return (
                <g key={t}>
                  <line
                    x1={padL}
                    x2={W - padR}
                    y1={y}
                    y2={y}
                    stroke="var(--line)"
                    strokeWidth={t === 0 ? 1.1 : 0.85}
                    strokeDasharray={t === 0 ? undefined : '4 4'}
                    opacity={t === 0 ? 1 : 0.9}
                  />
                  <text
                    x={padL - 10}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize={11}
                    fill="var(--muted)"
                    fontFamily="var(--ui)"
                  >
                    {t}
                  </text>
                </g>
              )
            })}
            {/* y axis label */}
            <text
              x={13}
              y={padT + plotH / 2}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted)"
              fontFamily="var(--ui)"
              fontWeight={600}
              transform={`rotate(-90 13 ${padT + plotH / 2})`}
            >
              Frequency
            </text>
            {/* bars */}
            {bins.map((bin, i) => {
              const v = Number.isFinite(bin.value) ? bin.value : 0
              const h = (v / yMax) * plotH
              const x = padL + i * (barW + gap)
              const y = padT + plotH - h
              return (
                <g key={`${bin.label}-${i}`}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(h, 2)}
                    rx={4}
                    ry={4}
                    fill="var(--accent)"
                    opacity={isPreview ? 0.62 : 0.92}
                  >
                    <title>
                      {bin.label}: {v.toLocaleString()}
                    </title>
                  </rect>
                  {/* value label on top when room */}
                  {h > 16 && (
                    <text
                      x={x + barW / 2}
                      y={y - 6}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill="var(--ink)"
                      fontFamily="var(--ui)"
                    >
                      {v}
                    </text>
                  )}
                  {/* x label */}
                  <text
                    x={x + barW / 2}
                    y={H - 18}
                    textAnchor="middle"
                    fontSize={rotateLabels ? 10 : 11}
                    fill="var(--muted)"
                    fontFamily="var(--ui)"
                    transform={
                      rotateLabels ? `rotate(-18 ${x + barW / 2} ${H - 18})` : undefined
                    }
                  >
                    {bin.label}
                  </text>
                </g>
              )
            })}
            {/* x axis baseline */}
            <line
              x1={padL}
              x2={W - padR}
              y1={padT + plotH}
              y2={padT + plotH}
              stroke="var(--line-strong)"
              strokeWidth={1.15}
            />
            <text
              x={padL + plotW / 2}
              y={H - 4}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted)"
              fontFamily="var(--ui)"
              fontWeight={600}
            >
              {isPreview ? 'Yield (t/ha) — bins' : `${titleLabel}${unitLabel} — bins`}
            </text>
          </svg>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
        <p className="m-0 text-[11px] leading-relaxed text-[var(--muted)]">
          {isPreview
            ? 'Preview bell curve (counts 2–16). Upload a dataset to see live bins from the analysis backend.'
            : `Source: binned by the analysis backend · ${bins.length} intervals`}
        </p>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" aria-hidden />
          {isPreview ? 'preview bins' : 'live bins'}
        </span>
      </div>
    </div>
  )
}

// Convenience wrapper that accepts AnalysisReport directly (for VisualAnalytics orchestrator)
export function TargetHistogramFromReport({ report }: { report: AnalysisReport | null }) {
  if (!report) return <TargetHistogram bins={null} />
  return (
    <TargetHistogram
      bins={report.profile.targetSummary.map((b) => ({ label: b.label, value: b.value }))}
      targetLabel={report.dataset.target}
      unit={report.prediction.unit}
    />
  )
}

export default TargetHistogram
