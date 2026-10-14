import type { InsightsMethod } from '../../types/analysis'

export type FeatureImportanceInsight = {
  feature: string
  coefficient: number | null
  interpretation: string
}

type Props = {
  insights: FeatureImportanceInsight[] | null
  method: InsightsMethod | null
  note?: string
}

// Poster fallback — only when insights == null (preview). Never in live path.
const FALLBACK_INSIGHTS: FeatureImportanceInsight[] = [
  { feature: 'Rainfall', coefficient: 0.32, interpretation: 'Higher rainfall is the strongest driver in the poster example.' },
  { feature: 'Fertilizer', coefficient: 0.24, interpretation: 'Fertilizer rate adds a moderate positive influence.' },
  { feature: 'Temperature', coefficient: 0.18, interpretation: 'Temperature variation shifts the estimate modestly.' },
  { feature: 'Area', coefficient: 0.14, interpretation: 'Cultivated area contributes a smaller positive effect.' },
  { feature: 'Soil Type', coefficient: 0.08, interpretation: 'Soil category accounts for a small categorical lift.' },
  { feature: 'Irrigation', coefficient: 0.04, interpretation: 'Irrigation access adds a slight nudge in this example.' },
]

const METHOD_LABEL: Record<InsightsMethod, string> = {
  'permutation-importance': 'Permutation Importance',
  'standardized-coefficients': 'Standardized Coefficients',
}

const PREVIEW_NOTE =
  'Example ranking from the poster layout — upload a dataset to replace these with values computed from your data.'

function fmt(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  const c = Object.is(v, -0) ? 0 : v
  return c.toFixed(2)
}

export function FeatureImportanceChart({ insights, method, note }: Props) {
  const isPreview = insights === null
  const raw: FeatureImportanceInsight[] = isPreview ? FALLBACK_INSIGHTS : (insights ?? [])

  // keep original order when preview is poster order; when live sort by |coefficient| desc (most influential first)
  const sorted = isPreview
    ? raw
    : [...raw].sort((a, b) => {
        const av = typeof a.coefficient === 'number' && Number.isFinite(a.coefficient) ? Math.abs(a.coefficient) : -1
        const bv = typeof b.coefficient === 'number' && Number.isFinite(b.coefficient) ? Math.abs(b.coefficient) : -1
        return bv - av
      })

  const present = sorted.filter(
    (d): d is FeatureImportanceInsight & { coefficient: number } =>
      typeof d.coefficient === 'number' && Number.isFinite(d.coefficient),
  )

  const maxAbs = Math.max(...present.map((d) => Math.abs(d.coefficient)), 0.01)
  const hasLiveCoefficients = present.length > 0
  const isDiverging = method === 'standardized-coefficients'
  const effectiveNote = note ?? (isPreview ? PREVIEW_NOTE : '')
  const methodLabel = method ? METHOD_LABEL[method] : isPreview ? 'Example values' : 'Attribution'

  const showEmptyCoefficients = !isPreview && !hasLiveCoefficients

  // diverging geometry uses center 50%; non-directional uses 0% left
  // sky blue for negative direction — not the error red, to distinguish sign from failure
  const SKY = '#7fb0d6'
  const SKY_BORDER = 'color-mix(in srgb, #7fb0d6 65%, var(--line-strong))'

  return (
    <section
      aria-labelledby="fi-title"
      className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm p-4 md:p-5"
      style={{ opacity: isPreview ? 0.96 : 1 }}
    >
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Attribution</p>
          <h2 id="fi-title" className="mt-1 text-[1.05rem] font-semibold tracking-tight text-[var(--ink)]">
            What Drove the Estimate
          </h2>
          <p className="mt-1 max-w-[60ch] text-sm leading-5 text-[var(--muted)]">
            {isPreview
              ? 'Poster example — ranked by absolute contribution. Larger bars influenced the estimate more.'
              : hasLiveCoefficients
                ? isDiverging
                  ? 'Ranked by absolute contribution. Emerald = positive direction, sky = negative direction.'
                  : 'Ranked by permutation importance — larger bars influenced the estimate more. No sign, magnitude only.'
                : 'Attribution is not computable for this dataset.'}
          </p>
          <p className="mt-1 text-xs font-medium text-[var(--muted)]">
            {method ? METHOD_LABEL[method] : isPreview ? 'Preview · poster values' : 'No method returned'}
          </p>
        </div>

        {/* method / preview badge */}
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
            isPreview
              ? 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)]'
              : method
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]'
          }`}
        >
          {isPreview ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)] opacity-60" aria-hidden />
              Preview
            </>
          ) : (
            <>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: hasLiveCoefficients ? 'var(--accent)' : 'var(--line-strong)' }}
                aria-hidden
              />
              {methodLabel}
            </>
          )}
        </span>
      </div>

      {/* preview disclosure */}
      {isPreview && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
          Showing poster placeholder values (0.32 / 0.24 …). These are illustration only and will be replaced by live,
          dataset-specific scores after you upload and run an analysis.
        </p>
      )}

      {showEmptyCoefficients && (
        <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-xs leading-5 text-[var(--muted)]">
          The attribution step did not return coefficients for this dataset — try a dataset with numeric variation in the
          features. The bar area below is intentionally empty.
        </p>
      )}

      {/* bars — more polished than InsightsPanel: bigger tracks, rank numbers, value pills, interpretation subtext */}
      <div className={isPreview ? 'mt-4 grid gap-4 opacity-[0.92]' : 'mt-5 grid gap-4'}>
        {sorted.map((row) => {
          const known = typeof row.coefficient === 'number' && Number.isFinite(row.coefficient)
          const v = known ? row.coefficient! : 0
          const abs = known ? Math.abs(v) : 0
          const pct = known ? (abs / maxAbs) * 100 : 0
          const w = known ? `${Math.max(pct, 2)}%` : '0%'
          const isNegative = known && v < 0
          const rank = sorted.indexOf(row) + 1

          // diverging: from center; non-directional / preview: from 0
          const useDivergingLayout = isDiverging && !isPreview && known
          const fill = !known ? 'transparent' : useDivergingLayout ? (isNegative ? SKY : 'var(--accent)') : 'var(--accent)'
          const borderColor = useDivergingLayout && isNegative ? SKY_BORDER : 'color-mix(in srgb, var(--accent) 35%, transparent)'

          return (
            <div
              key={row.feature}
              className="group grid gap-1.5 rounded-xl border border-transparent p-1 -m-1 hover:border-[var(--line)] hover:bg-[var(--surface-2)]/40 transition-colors"
              title={row.interpretation || undefined}
              tabIndex={0}
              role="img"
              aria-label={`${rank}. ${row.feature} ${fmt(row.coefficient)} — ${row.interpretation}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="inline-flex items-baseline gap-2 min-w-0">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold tabular-nums"
                    style={{
                      background: rank === 1 && known ? 'var(--accent)' : 'var(--surface-2)',
                      color: rank === 1 && known ? 'var(--on-accent)' : 'var(--muted)',
                      borderColor: rank === 1 && known ? 'var(--accent)' : 'var(--line)',
                    }}
                    aria-hidden
                  >
                    {rank}
                  </span>
                  <span className="truncate text-sm font-semibold tracking-tight text-[var(--ink)]">{row.feature}</span>
                </span>
                <span
                  className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums"
                  style={{
                    background: known ? (isNegative && useDivergingLayout ? 'color-mix(in srgb, #7fb0d6 14%, var(--surface))' : 'var(--accent-soft)') : 'var(--surface-2)',
                    color: known ? (isNegative && useDivergingLayout ? '#3a6a8a' : 'var(--accent)') : 'var(--muted)',
                    borderColor: known ? (isNegative && useDivergingLayout ? 'color-mix(in srgb, #7fb0d6 30%, var(--line))' : 'var(--line)') : 'var(--line)',
                  }}
                >
                  {fmt(row.coefficient)}
                </span>
              </div>

              {/* track — h-3 polished */}
              <div className="relative h-3 overflow-hidden rounded-full bg-[var(--surface-2)] border border-[var(--line)]">
                {useDivergingLayout && (
                  <span
                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--line-strong)]"
                    style={{ left: '50%' }}
                    aria-hidden
                  />
                )}
                {known && (
                  <div
                    className="absolute top-0 bottom-0 rounded-full"
                    style={{
                      background: fill,
                      border: `1px solid ${borderColor}`,
                      width: w,
                      left: useDivergingLayout ? (isNegative ? `calc(50% - ${w})` : '50%') : '0',
                      opacity: isPreview ? 0.72 : 0.96,
                    }}
                    role="img"
                    aria-label={`${row.feature} ${fmt(row.coefficient)}`}
                  >
                    <title>{`${row.feature}: ${fmt(row.coefficient)} — ${row.interpretation}`}</title>
                  </div>
                )}
              </div>

              {row.interpretation && (
                <p className="m-0 text-xs leading-5 text-[var(--muted)] line-clamp-2 group-hover:line-clamp-none transition-all">
                  {row.interpretation}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* scale footer */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-[11px] tabular-nums text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-6 rounded-full bg-[var(--accent)] inline-block" aria-hidden /> 0
        </span>
        <span className="opacity-70">
          {isDiverging && !isPreview ? 'diverging · center 0 · length ∝ |coefficient|' : `scale 0 – ${maxAbs.toFixed(2)} (max |coefficient|)`}
        </span>
        <span className="font-semibold text-[var(--ink)]">{maxAbs.toFixed(2)}</span>
      </div>

      {isDiverging && !isPreview && hasLiveCoefficients && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" aria-hidden /> positive
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SKY }} aria-hidden /> negative
          </span>
          <span className="ml-auto hidden sm:inline">Signed standardized coefficients — sign is direction, length is strength.</span>
        </div>
      )}
      {!isDiverging && !isPreview && hasLiveCoefficients && (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
          Permutation importance has no sign — bars show magnitude only. Shuffling a taller feature hurts the model more.
        </p>
      )}

      {/* note */}
      {effectiveNote && <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{effectiveNote}</p>}

      {!isPreview && hasLiveCoefficients && (
        <p className="mt-1 text-xs italic text-[var(--muted)] opacity-80">
          {isDiverging
            ? 'Standardized coefficients: sign is association direction, length is relative strength.'
            : 'Permutation importance: values are non-negative; larger means the model relied on that feature more.'}
        </p>
      )}
      {isPreview && <p className="mt-1 text-xs italic text-[var(--muted)]">Upload a dataset to see a live ranking that replaces these example bars.</p>}
    </section>
  )
}

export default FeatureImportanceChart
