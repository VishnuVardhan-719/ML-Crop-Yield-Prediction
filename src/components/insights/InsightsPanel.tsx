import type { AnalysisReport, InsightsMethod } from '../../types/analysis'

type Props = {
  report?: AnalysisReport
}

const FALLBACK_INSIGHTS: Array<{ feature: string; coefficient: number }> = [
  { feature: 'Rainfall', coefficient: 0.32 },
  { feature: 'Fertilizer', coefficient: 0.24 },
  { feature: 'Temperature', coefficient: 0.18 },
  { feature: 'Area', coefficient: 0.14 },
  { feature: 'Soil Type', coefficient: 0.08 },
  { feature: 'Irrigation', coefficient: 0.04 },
]

const METHOD_LABEL: Record<InsightsMethod, string> = {
  'permutation-importance': 'Permutation Importance',
  'standardized-coefficients': 'Standardized Coefficients',
}

const CHECKLIST: string[] = [
  'CSV upload with validation & type inference',
  'Automatic target detection + manual override',
  '4-model comparison (Ridge / Lasso / Elastic Net / RF) vs mean baseline',
  'Cross-validation with holdout diagnostic',
  'Single-record prediction with error band',
  'Feature importance (permutation / coefficients)',
  'Multilingual explanations + voice playback',
  'Data-quality checks & preprocessing transparency',
]

function formatVal(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—'
}

function formatPred(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—'
}

export function InsightsPanel({ report }: Props) {
  const isLive = Boolean(report)
  const rawInsights = report?.insights ?? null
  // Live insights, capped at 6 to match poster scale, sorted as returned (already ranked)
  const liveItems = rawInsights && rawInsights.length > 0
    ? rawInsights.slice(0, 6).map((r) => ({ feature: r.feature, coefficient: r.coefficient }))
    : null

  const items = liveItems ?? FALLBACK_INSIGHTS.map((f) => ({ feature: f.feature, coefficient: f.coefficient as number | null }))
  const method: InsightsMethod | null = report?.insightsMethod ?? null
  const note = report?.insightsNote ?? 'Example ranking from the poster layout. Upload a dataset to replace these with values computed from your data.'
  const hasLiveCoefficients = liveItems ? liveItems.some((d) => typeof d.coefficient === 'number' && Number.isFinite(d.coefficient)) : false

  // Scale bars to the largest absolute value present; never hardcode 0.4 as divisor, show 0-0.4 as decorative scale only.
  const present = items.filter((d): d is { feature: string; coefficient: number } => typeof d.coefficient === 'number' && Number.isFinite(d.coefficient))
  const maxAbs = Math.max(...present.map((d) => Math.abs(d.coefficient)), 0.01)
  // For visual consistency the track represents maxAbs; faint 0.4 marker shown only as reference when maxAbs <= 0.4
  const showScaleHint = maxAbs <= 0.42

  const pairs = report?.prediction.actualVsPredicted ?? []
  const previewPairs = pairs.slice(0, 10)
  const magnitudes = previewPairs
    .flatMap((p) => [p.actual, p.predicted])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .map(Math.abs)
  const pairScale = Math.max(...magnitudes, 1)

  return (
    <div className="grid gap-5">
      {/* Feature Importance — live web card */}
      <section
        aria-labelledby="insights-fi-title"
        className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="insights-fi-title" className="text-[1.05rem] font-semibold tracking-tight text-stone-900">
              Feature Importance
            </h2>
            <p className="mt-1 max-w-[52ch] text-sm leading-5 text-stone-500">
              {isLive && hasLiveCoefficients
                ? 'Ranked by absolute contribution to the selected model. Larger bars influenced the estimate more.'
                : 'Poster example — upload a dataset to see live values computed from your data.'}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
              isLive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-stone-200 bg-stone-50 text-stone-500'
            }`}
          >
            {method ? METHOD_LABEL[method] : 'Example values'}
            {!isLive && <span className="ml-1 font-normal opacity-70">· not live</span>}
          </span>
        </div>

        {!isLive && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Showing poster placeholder values (0.32 / 0.24 …). These will be replaced by live, dataset-specific scores after analysis.
          </p>
        )}
        {isLive && !hasLiveCoefficients && (
          <p className="mb-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            Not computable for this dataset — the attribution step did not return coefficients. Try a dataset with numeric variation in the features.
          </p>
        )}

        <div className="grid gap-3">
          {items.map((row) => {
            const known = typeof row.coefficient === 'number' && Number.isFinite(row.coefficient)
            const abs = known ? Math.abs(row.coefficient!) : 0
            const w = known ? `${Math.max((abs / maxAbs) * 100, 3)}%` : '0%'
            const isNegative = known && row.coefficient! < 0
            return (
              <div key={row.feature} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-stone-700">{row.feature}</span>
                  <span className="shrink-0 tabular-nums text-sm font-semibold text-stone-900">{formatVal(row.coefficient)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
                  {known && (
                    <div
                      className={`h-full rounded-full ${isNegative ? 'bg-sky-600' : 'bg-emerald-600'}`}
                      style={{ width: w }}
                      role="img"
                      aria-label={`${row.feature} ${formatVal(row.coefficient)}`}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-[11px] tabular-nums text-stone-400">
          <span>0</span>
          {showScaleHint ? <span className="opacity-70">scale 0 – 0.4 (reference)</span> : <span>max {maxAbs.toFixed(2)}</span>}
          <span>{maxAbs.toFixed(2)}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-stone-500">{note}</p>
        {!isLive && <p className="mt-1 text-xs italic text-stone-400">Upload a dataset to see overview — live ranking replaces these example bars.</p>}
      </section>

      {/* Actual vs Predicted — compact preview */}
      <section
        aria-labelledby="insights-avp-title"
        className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 id="insights-avp-title" className="text-sm font-semibold tracking-tight text-stone-900">
              Actual vs Predicted <span className="font-normal text-stone-500">(first 10 holdout records)</span>
            </h3>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Paired bars compare the known answer (stone) with the model estimate (emerald). Shorter gaps mean closer predictions.
            </p>
          </div>
          {pairs.length > 0 && (
            <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600">
              {previewPairs.length} of {pairs.length.toLocaleString()} shown
            </span>
          )}
        </div>

        {previewPairs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center">
            <div className="mx-auto mb-2 text-lg opacity-60">◈</div>
            <p className="text-sm font-medium text-stone-700">No holdout preview yet</p>
            <p className="mx-auto mt-1 max-w-[36ch] text-xs leading-5 text-stone-500">
              Upload a dataset to run cross-validation. The first 10 actual vs predicted pairs will appear here; the full set is downloadable as CSV.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex gap-3 text-xs text-stone-500">
              <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-stone-300" /> Actual</span>
              <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-emerald-600" /> Predicted</span>
            </div>
            <div className="grid gap-3">
              {previewPairs.map((pair, idx) => {
                const aw = typeof pair.actual === 'number' && Number.isFinite(pair.actual) ? `${Math.abs(pair.actual) / pairScale * 100}%` : '0%'
                const pw = typeof pair.predicted === 'number' && Number.isFinite(pair.predicted) ? `${Math.abs(pair.predicted) / pairScale * 100}%` : '0%'
                return (
                  <div key={`${pair.actual}-${pair.predicted}-${idx}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
                    <span className="row-span-3 text-xs text-stone-500">Test {idx + 1}</span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-stone-300" style={{ width: aw }} />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-emerald-600" style={{ width: pw }} />
                    </div>
                    <span className="text-xs tabular-nums text-stone-500">
                      Actual {formatPred(pair.actual)} · Predicted {formatPred(pair.predicted)}
                      {typeof pair.residual === 'number' && Number.isFinite(pair.residual) && (
                        <span className={pair.residual >= 0 ? ' text-amber-600' : ' text-sky-600'}> · residual {formatPred(pair.residual)}</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* Key Front End Features — optional collapsible checklist, website footer area not poster banner */}
      <details className="group rounded-xl border border-stone-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-stone-800 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-xs text-white">✓</span>
            Key Front End Features
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">8 items</span>
          </span>
          <span className="text-stone-400 transition group-open:rotate-180" aria-hidden>▾</span>
        </summary>
        <ul className="grid gap-0 border-t border-stone-100 px-2 pb-2 pt-2 sm:grid-cols-2">
          {CHECKLIST.map((label) => (
            <li key={label} className="flex gap-2 px-3 py-2 text-sm leading-5 text-stone-600">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700 text-xs">✓</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

export default InsightsPanel
