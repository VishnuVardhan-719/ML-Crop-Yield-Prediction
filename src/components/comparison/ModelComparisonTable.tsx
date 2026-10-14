import type { AnalysisReport } from '../../types/analysis'

type Props = {
  report?: AnalysisReport
}

const formatNumber = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—'

// Poster fallback values — shown only when no live report is available.
// These are the mock numbers from the poster panel 4; never used when report exists.
const POSTER_ROWS = [
  { model: 'ridge' as const, label: 'Ridge', rmse: 1.82, mae: 1.34, r2: 0.71 },
  { model: 'lasso' as const, label: 'Lasso', rmse: 1.76, mae: 1.28, r2: 0.73 },
  { model: 'elastic-net' as const, label: 'Elastic Net', rmse: 1.69, mae: 1.24, r2: 0.75 },
  { model: 'random-forest' as const, label: 'Random Forest', rmse: 1.52, mae: 1.11, r2: 0.80 },
] as const

const MODEL_ORDER = ['ridge', 'lasso', 'elastic-net', 'random-forest'] as const

export function ModelComparisonTable({ report }: Props) {
  const hasLiveData = Boolean(report && report.models.length > 0)

  // Live rows sorted to poster order; fallback to poster values when no report
  const rows = hasLiveData
    ? [...report!.models].sort(
        (a, b) => MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model)
      )
    : null

  // Selected = lowest RMSE among live models, or RF in poster fallback
  const selectedModel = hasLiveData
    ? report!.models.find((m) => m.selected)?.model ?? null
    : 'random-forest'

  const baseline = report?.evaluation.baseline

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">Model comparison</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Cross-validated performance. Lower RMSE / MAE is better; higher R² is better.
          {hasLiveData ? null : <span className="ml-1 italic">Showing poster example — upload a dataset for live results.</span>}
        </p>
      </div>

      {/* Table — horizontal scroll on mobile */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <caption className="sr-only">Regression model comparison: RMSE, MAE and R squared</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th scope="col" className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Model
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                RMSE <span className="font-normal normal-case tracking-normal text-slate-400">(t/ha)</span>
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                MAE <span className="font-normal normal-case tracking-normal text-slate-400">(t/ha)</span>
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                R²
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {hasLiveData
              ? rows!.map((m) => {
                  const isSelected = m.model === selectedModel
                  return (
                    <tr
                      key={m.model}
                      className={isSelected ? 'bg-emerald-50/70' : 'bg-white hover:bg-slate-50'}
                    >
                      <th
                        scope="row"
                        className="whitespace-nowrap px-5 py-3.5 text-left font-medium text-slate-900"
                      >
                        <span className="inline-flex items-center gap-2">
                          {m.label}
                          {isSelected && (
                            <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                              Selected
                            </span>
                          )}
                        </span>
                      </th>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700">
                        {formatNumber(m.rmse)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700">
                        {formatNumber(m.mae)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700">
                        {formatNumber(m.r2)}
                      </td>
                    </tr>
                  )
                })
              : POSTER_ROWS.map((m) => {
                  const isSelected = m.model === selectedModel
                  return (
                    <tr
                      key={m.model}
                      className={isSelected ? 'bg-emerald-50/70' : 'bg-white hover:bg-slate-50'}
                    >
                      <th scope="row" className="whitespace-nowrap px-5 py-3.5 text-left font-medium text-slate-900">
                        <span className="inline-flex items-center gap-2">
                          {m.label}
                          {isSelected && (
                            <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                              Selected
                            </span>
                          )}
                        </span>
                      </th>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700">
                        {m.rmse.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700">
                        {m.mae.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700">
                        {m.r2.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}

            {/* Baseline row — only when live report provides it */}
            {baseline && (
              <tr className="bg-slate-50/80">
                <th
                  scope="row"
                  className="whitespace-nowrap px-5 py-3.5 text-left font-medium italic text-slate-600"
                >
                  <span className="inline-flex items-center gap-2">
                    {baseline.label}
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Reference
                    </span>
                  </span>
                </th>
                <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-500">
                  {formatNumber(baseline.rmse)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-500">
                  {formatNumber(baseline.mae)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-500">
                  {formatNumber(baseline.r2)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer help text — subtle, not a poster alert */}
      <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
        <p className="text-xs leading-relaxed text-slate-500">
          Lower RMSE / MAE indicates better performance. Selected by lowest cross-validated RMSE.
          {hasLiveData && report!.evaluation.selectionRule ? (
            <span className="ml-1 hidden sm:inline text-slate-400">· {report!.evaluation.selectionRule}</span>
          ) : null}
        </p>
      </div>
    </div>
  )
}

export default ModelComparisonTable
