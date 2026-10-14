import type { AnalysisReport } from '../../types/analysis'

type Props = {
  report: AnalysisReport | null
}

type Bin = { label: string; value: number }

// Poster bell-curve placeholder: 6 bins across 0–10 t/ha, counts 2→16→3 (peak in middle)
const PLACEHOLDER_BINS: Bin[] = [
  { label: '0–2', value: 2 },
  { label: '2–3.5', value: 5 },
  { label: '3.5–5', value: 11 },
  { label: '5–6.5', value: 16 },
  { label: '6.5–8', value: 9 },
  { label: '8–10', value: 3 },
]

export function YieldDistribution({ report }: Props) {
  const isLive = !!report
  const bins: Bin[] = isLive
    ? report.profile.targetSummary.map((b) => ({ label: b.label, value: b.value }))
    : PLACEHOLDER_BINS

  const hasData = bins.length > 0 && bins.some((b) => Number.isFinite(b.value) && b.value > 0)
  const max = Math.max(...bins.map((b) => (Number.isFinite(b.value) ? b.value : 0)), 1)
  // nice ceiling for y-axis so bars don't clip top
  const yMax = Math.ceil(max * 1.08)
  const total = bins.reduce((s, b) => s + (Number.isFinite(b.value) ? b.value : 0), 0)

  // SVG layout
  const W = 640
  const H = 240
  const padL = 44
  const padR = 12
  const padT = 12
  const padB = 40
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const gap = bins.length > 8 ? 6 : 10
  const barW = bins.length ? (plotW - gap * (bins.length - 1)) / bins.length : 0

  const yTicks = [0, Math.round(yMax / 2), yMax]

  const targetLabel = report?.dataset.target ?? 'Yield'
  const unit = report?.prediction.unit ? ` (${report.prediction.unit})` : isLive ? '' : ' (t/ha)'

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[13px] font-semibold tracking-tight text-[var(--ink)]">
            Live Data Overview — Crop Yield Distribution
          </h3>
          <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-[var(--muted)]">
            {isLive
              ? `Distribution of ${targetLabel}${unit} across ${total.toLocaleString()} binned records · ${bins.length} bins`
              : 'Placeholder bell curve — upload a dataset to see live distribution'}
          </p>
        </div>
        {!isLive ? (
          <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            placeholder
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            live · {report.dataset.rows.toLocaleString()} rows
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="mt-4 grid place-items-center rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-10 text-center">
          <p className="m-0 text-sm font-medium text-[var(--ink)]">Not enough data to build histogram</p>
          <p className="mt-1 max-w-[40ch] text-xs text-[var(--muted)]">
            Upload a dataset to see live data.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="auto"
            role="img"
            aria-label={
              isLive
                ? `Histogram of ${targetLabel} distribution with ${bins.length} bins`
                : 'Placeholder histogram of crop yield distribution'
            }
            className="block min-w-[420px]"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* grid lines */}
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
                    strokeWidth={t === 0 ? 1.2 : 0.8}
                    strokeDasharray={t === 0 ? undefined : '4 4'}
                    opacity={t === 0 ? 1 : 0.9}
                  />
                  <text
                    x={padL - 8}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--muted)"
                    fontFamily="var(--ui)"
                  >
                    {t}
                  </text>
                </g>
              )
            })}

            {/* y-axis label */}
            <text
              x={12}
              y={padT + plotH / 2}
              textAnchor="middle"
              fontSize="10"
              fill="var(--muted)"
              fontFamily="var(--ui)"
              fontWeight={600}
              transform={`rotate(-90 12 ${padT + plotH / 2})`}
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
                    rx={3}
                    ry={3}
                    fill="var(--accent)"
                    opacity={isLive ? 0.92 : 0.62}
                  >
                    <title>
                      {bin.label}: {v.toLocaleString()}
                    </title>
                  </rect>
                  {/* value label on top when room */}
                  {h > 18 && (
                    <text
                      x={x + barW / 2}
                      y={y - 6}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight={600}
                      fill="var(--ink)"
                      fontFamily="var(--ui)"
                    >
                      {v}
                    </text>
                  )}
                  {/* x label */}
                  <text
                    x={x + barW / 2}
                    y={H - 14}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--muted)"
                    fontFamily="var(--ui)"
                  >
                    {bin.label}
                  </text>
                </g>
              )
            })}

            {/* x-axis baseline */}
            <line
              x1={padL}
              x2={W - padR}
              y1={padT + plotH}
              y2={padT + plotH}
              stroke="var(--line-strong)"
              strokeWidth={1}
            />
            {/* x-axis label */}
            <text
              x={padL + plotW / 2}
              y={H - 2}
              textAnchor="middle"
              fontSize="10"
              fill="var(--muted)"
              fontFamily="var(--ui)"
              fontWeight={600}
            >
              {isLive ? `${targetLabel}${unit}` : 'Yield (t/ha)'} — bins
            </text>
          </svg>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
        <p className="m-0 text-[11px] leading-relaxed text-[var(--muted)]">
          {!isLive
            ? 'Upload a dataset to see live data. Bars above are a bell-curve placeholder (counts 2–16).'
            : `Source: ${report.dataset.fileName} · binned by the analysis backend`}
        </p>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" aria-hidden="true" />
          {isLive ? 'live bins' : 'placeholder bins'}
        </span>
      </div>
    </div>
  )
}
