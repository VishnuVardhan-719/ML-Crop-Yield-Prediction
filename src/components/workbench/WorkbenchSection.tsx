import type { ReactNode } from 'react'

type WorkbenchSectionProps = {
  number: string
  title: string
  enabled: boolean
  reason?: string
  accent?: boolean
  children?: ReactNode
}

export function WorkbenchSection({ number, title, enabled, reason, accent, children }: WorkbenchSectionProps) {
  return (
    <section className={`workbench-section${accent ? ' result-section' : ''}`} aria-labelledby={`stage-${number}`} aria-disabled={!enabled}>
      <div className="section-title-row">
        <span className="section-number">{number}</span>
        <h2 id={`stage-${number}`}>{title}</h2>
      </div>
      {enabled ? children : <p className="stage-locked">{reason}</p>}
    </section>
  )
}
