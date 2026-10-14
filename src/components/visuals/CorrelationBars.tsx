type Corr = { feature: string; value: number | null }

type Props = {
  correlations: Corr[] | null
}

const PREVIEW_CORRS: Corr[] = [
  { feature: 'Rainfall', value: 0.62 },
  { feature: 'Temperature', value: 0.41 },
  { feature: 'Soil pH', value: -0.28 },
  { feature: 'Fertilizer', value: 0.55 },
  { feature: 'Pest pressure', value: -0.19 },
]

function fmt(v: number) {
  const s = v.toFixed(2)
  return s.startsWith('0.') || s.startsWith('-0.') ? s.replace('0.', '.') : s
}

export function CorrelationBars({ correlations }: Props) {
  const isPreview = correlations === null
  const raw: Corr[] = isPreview ? PREVIEW_CORRS : (correlations ?? [])
  // filter out null / non-finite for bars, keep order as given (or sort by abs desc for preview polish)
  const filtered = raw.filter((c): c is { feature: string; value: number } => typeof c.value === 'number' && Number.isFinite(c.value))
  // when preview, sort by value desc for nicer visual; when live keep given order but sorted by abs desc is more readable — match spec "Association only"
  const rows = isPreview ? [...filtered].sort((a, b) => b.value - a.value) : filtered
  const hasData = rows.length > 0

  // SVG dimensions — dynamic height per spec: 24 * n + padding
  const VB_W = 480
  const ROW_H = 28
  const GAP = 10
  const PAD = { top: 14, right: 44, bottom: 28, left: 14 }
  // left label column width for feature names
  const LABEL_W = 110
  // bar area is centered at 240, but labels occupy left; we still keep spec center 240 for axis
  const CENTER_X = 240
  // max half-bar width: from center to edge minus right room for value label
  const HALF = 168 // 240 -> 408 max, 240 -> 72 min
  const VB_H = PAD.top + rows.length * ROW_H + GAP + PAD.bottom + 8
  const plotTop = PAD.top
  const plotBottom = VB_H - PAD.bottom

  // axis ticks -1, -0.5, 0, 0.5, 1
  const ticks = [-1, -0.5, 0, 0.5, 1]
  const xFor = (v: number) => CENTER_X + v * HALF

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5" style={{ opacity: isPreview ? 0.92 : 1 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Exploration</p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">Feature — Target Correlation</h3>
          <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-[var(--muted)]">Pearson r, -1 to +1. Association only, not causation.</p>
        </div>
        {isPreview ? (
          <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
            Preview
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] tabular-nums">
            {rows.length} feature{rows.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="mt-4 grid place-items-center min-h-[12rem] border border-dashed border-[var(--line-strong)] rounded-[var(--radius)] bg-[var(--surface)] p-6 text-center">
          <p className="m-0 text-sm text-[var(--muted)]">Insufficient data for this chart.</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Correlations appear after analysis of numeric features.</p>
        </div>
      ) : (
        <div className="mt-4">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            width="100%"
            height="auto"
            role="img"
            aria-label={isPreview ? 'Preview feature-target correlations' : `Feature-target correlations, ${rows.length} features`}
            className="block w-full h-auto select-none"
            preserveAspectRatio="xMidYMid meet"
          >
            <title>{isPreview ? 'Preview correlations' : `${rows.length} correlations from -1 to +1`}</title>
            {/* grid vertical lines per tick */}
            {ticks.map((t) => {
              const x = xFor(t)
              const isZero = t === 0
              return (
                <line
                  key={t}
                  x1={x}
                  x2={x}
                  y1={plotTop}
                  y2={plotBottom}
                  stroke={isZero ? 'var(--line-strong)' : 'var(--line)'}
                  strokeWidth={isZero ? 1.2 : 0.8}
                  strokeDasharray={isZero ? undefined : '4 4'}
                  opacity={isZero ? 1 : 0.9}
                />
              )
            })}
            {/* rows */}
            {rows.map((row, i) => {
              const v = row.value
              const clamped = Math.max(-1, Math.min(1, v))
              const w = Math.abs(clamped) * HALF
              const isNeg = clamped < 0
              const x = isNeg ? CENTER_X - w : CENTER_X
              const y = PAD.top + i * ROW_H + 4
              const barH = ROW_H - 10
              const fill = isNeg ? 'var(--error)' : 'var(--accent)'
              const labelX = 10
              // value label just beyond bar end, keep inside viewBox
              const valStr = fmt(clamped)
              const valX = isNeg ? x - 6 : x + w + 6
              const valAnchor = isNeg ? 'end' : 'start'
              // avoid label colliding with center when tiny bars
              const valY = y + barH / 2 + 3.5
              return (
                <g key={`${row.feature}-${i}`} tabIndex={0} role="img" aria-label={`${row.feature} correlation ${valStr}`}>
                  <title>
                    {row.feature}: {valStr}
                  </title>
                  {/* feature label left */}
                  <text
                    x={labelX}
                    y={y + barH / 2 + 3.5}
                    textAnchor="start"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--ink)"
                    fontFamily="var(--ui)"
                  >
                    {row.feature}
                  </text>
                  {/* bar track background (subtle) */}
                  <rect x={CENTER_X - HALF} y={y} width={HALF * 2} height={barH} rx={4} ry={4} fill="var(--surface-2)" opacity={0.95} />
                  {/* center line is already drawn; bar on top */}
                  <rect
                    x={x}
                    y={y}
                    width={Math.max(w, 2)}
                    height={barH}
                    rx={4}
                    ry={4}
                    fill={fill}
                    opacity={isPreview ? 0.68 : 0.95}
                    stroke={isNeg ? 'color-mix(in srgb, var(--error) 35%, var(--surface))' : 'color-mix(in srgb, var(--accent) 35%, var(--surface))'}
                    strokeWidth={0.8}
                  />
                  {/* value label */}
                  <text
                    x={valX}
                    y={valY}
                    textAnchor={valAnchor as any}
                    fontSize={11}
                    fontWeight={700}
                    fill={isNeg ? 'var(--error)' : 'var(--accent)'}
                    fontFamily="var(--ui)"
                  >
                    {valStr}
                  </text>
                  {/* feature label area divider hint */}
                  <line x1={LABEL_W + 6} x2={LABEL_W + 6} y1={y - 2} y2={y + barH + 2} stroke="var(--line)" strokeWidth={0.6} opacity={0.5} />
                </g>
              )
            })}
            {/* bottom axis baseline */}
            <line x1={CENTER_X - HALF} x2={CENTER_X + HALF} y1={plotBottom} y2={plotBottom} stroke="var(--line-strong)" strokeWidth={1} />
            {/* tick labels */}
            {ticks.map((t) => {
              const x = xFor(t)
              return (
                <text key={`lab-${t}`} x={x} y={VB_H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)" fontFamily="var(--ui)" fontWeight={t === 0 ? 700 : 500}>
                  {fmt(t)}
                </text>
              )
            })}
            {/* axis title */}
            <text x={CENTER_X} y={VB_H - 1} textAnchor="middle" fontSize={10} fill="var(--muted)" fontFamily="var(--ui)" fontWeight={600} dy={-10}>
              Pearson r
            </text>
            {/* left hint -1 */}
            <text x={CENTER_X - HALF} y={plotTop - 2} textAnchor="start" fontSize={9} fill="var(--muted)" fontFamily="var(--ui)">
              −1
            </text>
            <text x={CENTER_X + HALF} y={plotTop - 2} textAnchor="end" fontSize={9} fill="var(--muted)" fontFamily="var(--ui)">
              +1
            </text>
          </svg>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" aria-hidden />
              positive
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--error)]" aria-hidden />
              negative
            </span>
            <span className="ml-auto tabular-nums">center 0 · width ∝ |r|</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">Bars to the right are positively associated with the target; to the left, negatively. Length shows strength. All correlations are linear and single-variable — not adjusted for other features.</p>
        </div>
      )}
    </div>
  )
}

export default CorrelationBars
