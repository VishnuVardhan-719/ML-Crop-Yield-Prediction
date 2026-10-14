import type { AnalysisReport } from '../../types/analysis'

type Props = {
  report: AnalysisReport | null
}

function formatRows(n: number) {
  return n.toLocaleString()
}

export function StatCards({ report }: Props) {
  const isLive = !!report
  const rows = report?.dataset.rows ?? 512
  const numeric = report?.dataset.numericFeatures ?? 6
  const categorical = report?.dataset.categoricalFeatures ?? 2
  const featureCount = report ? numeric + categorical : 8
  const targetLabel = report?.dataset.target ?? 'Yield'
  const fileName = report?.dataset.fileName

  const cards = [
    {
      key: 'records',
      label: 'Total Records',
      value: isLive ? formatRows(rows) : '512',
      hint: isLive ? `${formatRows(rows)} rows · ${fileName ?? ''}`.trim() : 'Placeholder — upload to see live count',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: 'features',
      label: 'Features',
      value: String(featureCount),
      hint: isLive ? `${numeric} numeric · ${categorical} categorical` : '8 features in sample',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3l7 4v8l-7 4-7-4V7l7-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 11V21M3 7l9 4 9-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: 'target',
      label: 'Target',
      value: targetLabel,
      hint: isLive ? `Predicting ${targetLabel}` : 'Target: Yield (placeholder)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 20a8 8 0 100-16 8 8 0 000 16z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </svg>
      ),
    },
  ] as const

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <article
          key={card.key}
          className="flex min-w-0 flex-col gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--accent)]">
              {card.icon}
            </span>
            {!isLive && (
              <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                placeholder
              </span>
            )}
            {isLive && card.key !== 'target' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                live
              </span>
            )}
            {isLive && card.key === 'target' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                live
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-widest text-[var(--muted)]">{card.label}</p>
            <p
              className="mt-1 truncate text-[1.75rem] font-semibold leading-none tracking-tight text-[var(--ink)]"
              title={card.value}
            >
              {card.value}
            </p>
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">{card.hint}</p>
          </div>
        </article>
      ))}
      {!isLive && (
        <p className="col-span-full m-0 text-center text-xs text-[var(--muted)]">
          Upload a dataset to see live data — values above are placeholders mimicking the poster.
        </p>
      )}
    </div>
  )
}
