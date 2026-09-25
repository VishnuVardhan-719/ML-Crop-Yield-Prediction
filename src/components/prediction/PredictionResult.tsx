import { useEffect, useRef } from 'react'
import type { DataSource, ModelKind, PredictionResponse, PredictionStatus } from '../../types/cropcast'

type PredictionResultProps = {
  status: PredictionStatus
  result?: PredictionResponse
  message?: string
  source?: DataSource
  targetLabel?: string
  onRetry: () => void
}

const modelLabels: Record<ModelKind, string> = {
  ridge: 'Ridge',
  lasso: 'Lasso',
  'elastic-net': 'Elastic Net',
  'random-forest': 'Random Forest',
}

export function PredictionResult({ status, result, message, source, targetLabel, onRetry }: PredictionResultProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (status === 'success') headingRef.current?.focus()
  }, [status])

  if (status === 'processing') return <div className="result-skeleton" aria-live="polite"><span>Running selected model</span><i /><i /><i /></div>
  if (status === 'error') return <div className="stage-error" role="alert"><p>{message}</p><button className="button button-secondary" type="button" onClick={onRetry}>Retry prediction</button></div>
  if (status !== 'success' || !result) return <p className="stage-locked">Run a valid prediction to reveal the model response.</p>

  return (
    <div className="result-content" aria-live="polite">
      <div className="result-meta">
        <span className="status-tag">Prediction returned</span>
        {source === 'demo' && <span className="status-tag demo-tag">Demo output</span>}
      </div>
      <h3 ref={headingRef} tabIndex={-1}>Prediction result</h3>
      <p className="result-target">{targetLabel ?? result.targetColumnId}</p>
      <div className="result-value">{result.value === null ? 'No value returned' : String(result.value)}{result.unit && <small>{result.unit}</small>}</div>
      <p className="result-model">Model: {modelLabels[result.model] ?? result.model}</p>
      {result.notices?.length ? <ul className="result-notices">{result.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul> : null}
    </div>
  )
}
