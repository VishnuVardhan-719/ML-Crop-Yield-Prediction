import type { DataSource, ExplanationStatus, Language } from '../../types/cropcast'

type ExplanationPanelProps = {
  status: ExplanationStatus
  requested: boolean
  text?: string
  message?: string
  source?: DataSource
  language: Language
  onExplain: () => void
}

export function ExplanationPanel({ status, requested, text, message, source, language, onExplain }: ExplanationPanelProps) {
  if (!requested) return <button className="button button-primary" type="button" onClick={onExplain}>Explain result</button>
  return (
    <div className="explanation-panel" aria-live="polite">
      <div className="explanation-meta">
        <span className="status-tag">AI explanation</span>
        {source === 'demo' && <span className="status-tag demo-tag">Demo explanation</span>}
      </div>
      {status === 'loading' && <div className="text-skeleton"><i /><i /><i /></div>}
      {text && <p lang={status === 'success' ? language : undefined}>{text}</p>}
      {status === 'error' && <div className="inline-alert" role="alert"><span>{message}</span><button className="text-button" type="button" onClick={onExplain}>Retry</button></div>}
    </div>
  )
}
