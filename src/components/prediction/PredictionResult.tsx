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
  if (status !== 'success' || !result) return <p className="stage-locked">Enter the inputs above, then choose “Predict new record”. Your estimate will appear here.</p>

  return (
    <div className="result-content" aria-live="polite">
      <div className="result-meta">
        <span className="status-tag">Prediction returned</span>
        {source === 'demo' && <span className="status-tag demo-tag">Demo output</span>}
      </div>
      <h3 ref={headingRef} tabIndex={-1}>Prediction result</h3>
      <p className="result-target">{targetLabel ?? result.targetColumnId}</p>
      <div className="result-value">{Number.isFinite(result.value) ? Number(result.value.toFixed(4)) : 'No value returned'}{result.unit && <small>{result.unitInferred ? `${result.unit} (inferred)` : result.unit}</small>}</div>
      {result.interval && <p className="result-interval">RMSE-based error band {result.interval.lower} – {result.interval.upper}{result.unit ? ` ${result.unit}` : ''}. <small>{result.interval.method}</small></p>}
      <p className="field-help">This estimates the selected target for one observation, not the average of your upload. An RMSE-based error band is not a calibrated 95% prediction interval.</p>
      <p className="result-model">Model: {modelLabels[result.model] ?? result.model}</p>
      {result.notices?.length ? <ul className="result-notices">{result.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul> : null}
    </div>
  )
}
