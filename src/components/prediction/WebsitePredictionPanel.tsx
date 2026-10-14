import { useRef, useState } from 'react'
import type { AnalysisReport } from '../../types/analysis'
import type { PredictionResponse, PredictionStatus, Scalar } from '../../types/cropcast'
import { runPrediction, ServiceError } from '../../services/predictionService'

type Props = { report?: AnalysisReport }

type DemoField = { id: string; label: string; unit: string; type: 'number' | 'select'; value: Scalar; options?: string[] }

const DEMO_FIELDS: DemoField[] = [
  { id: 'rainfall', label: 'Rainfall', unit: 'mm', type: 'number', value: 850 },
  { id: 'temperature', label: 'Temperature', unit: '°C', type: 'number', value: 28 },
  { id: 'fertilizer', label: 'Fertilizer', unit: 'kg/ha', type: 'number', value: 120 },
  { id: 'irrigation', label: 'Irrigation', unit: '', type: 'select', value: 'Yes', options: ['Yes', 'No'] },
]

const MOCK_RESULT: PredictionResponse = {
  predictionId: 'demo-poster-preview',
  targetColumnId: 'yield',
  value: 4.8,
  unit: 't/ha',
  model: 'random-forest',
  interval: { lower: 4.1, upper: 5.5, halfWidth: 0.7, method: 'RMSE-based error band (demo placeholder)' },
}

function errorMessage(error: unknown): string {
  if (error instanceof ServiceError || error instanceof Error) return error.message
  return 'CropCast could not predict this field. Check the values and try again.'
}

export function WebsitePredictionPanel({ report }: Props) {
  const isLive = Boolean(report && report.source === 'uploaded' && report.inputColumns && report.inputColumns.length)
  const columns = (report?.inputColumns ?? []).map((c) => ({ ...c, eligibleAsTarget: c.id === report?.dataset.target }))
  const targetColumnId = report?.dataset.target ?? 'yield'
  const targetLabel = columns.find((c) => c.id === targetColumnId)?.label ?? targetColumnId
  const featureColumnIds = isLive
    ? columns.filter((c) => c.eligibleAsFeature && c.id !== targetColumnId).map((c) => c.id)
    : DEMO_FIELDS.map((f) => f.id)

  const [demoRecord, setDemoRecord] = useState<Record<string, Scalar>>(
    () => Object.fromEntries(DEMO_FIELDS.map((f) => [f.id, f.value])),
  )
  const [liveRecord, setLiveRecord] = useState<Record<string, Scalar>>({})
  const inputRecord = isLive ? liveRecord : demoRecord
  // keep setter typed without branching type error
  const setInputRecord = (isLive ? setLiveRecord : setDemoRecord) as React.Dispatch<React.SetStateAction<Record<string, Scalar>>>

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<PredictionStatus>('ready')
  const [result, setResult] = useState<PredictionResponse | undefined>(undefined)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)

  const selectedModelLabel = report?.models.find((m) => m.selected)?.label ?? 'Best validated model'

  const updateValue = (id: string, raw: string, dataType?: string) => {
    setErrors({})
    setStatus('ready')
    setResult(undefined)
    setMessage(undefined)
    if (raw === '') return setInputRecord((p) => ({ ...p, [id]: null }))
    if (dataType === 'boolean') return setInputRecord((p) => ({ ...p, [id]: raw === 'true' }))
    const col = columns.find((c) => c.id === id)
    if (col?.dataType === 'number' || col?.dataType === 'integer') {
      const n = Number(raw)
      return setInputRecord((p) => ({ ...p, [id]: Number.isNaN(n) ? raw : n }))
    }
    if (!isLive) {
      const n = Number(raw)
      return setInputRecord((p) => ({ ...p, [id]: raw !== '' && !Number.isNaN(n) ? n : raw }))
    }
    setInputRecord((p) => ({ ...p, [id]: raw }))
  }

  const handlePredict = async () => {
    if (!isLive || !report) {
      const nextErrors: Record<string, string> = {}
      for (const f of DEMO_FIELDS) {
        const v = inputRecord[f.id]
        if (v === null || v === undefined || v === '') nextErrors[f.id] = 'Enter a value'
      }
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors)
        return
      }
      setStatus('processing')
      await new Promise((r) => setTimeout(r, 420))
      setResult(MOCK_RESULT)
      setStatus('success')
      return
    }
    const nextErrors: Record<string, string> = {}
    if (!targetColumnId) nextErrors.target = 'Choose the value to predict.'
    if (!featureColumnIds.length) nextErrors.features = 'Choose at least one feature column.'
    for (const id of featureColumnIds) {
      const v = inputRecord[id]
      if (v === null || v === undefined || v === '') nextErrors[id] = 'Enter a value for this field.'
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('processing')
    setMessage(undefined)
    setResult(undefined)
    try {
      const response = await runPrediction(
        {
          datasetId: report.analysisId,
          targetColumnId,
          featureColumnIds,
          inputRecord,
          validation: report.evaluation.validation.strategy,
        },
        controller.signal,
      )
      if (!controller.signal.aborted) {
        setResult(response)
        setStatus('success')
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setStatus('error')
        setMessage(errorMessage(err))
      }
    }
  }

  const liveFeatures = isLive ? columns.filter((c) => c.eligibleAsFeature && c.id !== targetColumnId) : []

  return (
    <div className="wp-panel" data-testid="website-prediction-panel">
      <div className="wp-panel-head">
        <div>
          <p className="kicker" style={{ margin: 0 }}>Prediction</p>
          <h3 className="wp-title">Predict yield for one new record</h3>
          <p className="wp-subtitle">
            {isLive ? (
              <>
                Enter known inputs for one observation — <strong>{targetLabel}</strong> is estimated with{' '}
                <strong>{selectedModelLabel}</strong> ({featureColumnIds.length} inputs, {report?.evaluation.validation.label}).
              </>
            ) : (
              <>Try the demo inputs below. Upload a dataset to predict with your own columns.</>
            )}
          </p>
        </div>
        {isLive && report?.source === 'uploaded' && (
          <span className="status-tag" style={{ alignSelf: 'start' }}>
            {report.evaluation.validation.label}
          </span>
        )}
      </div>

      <div className="wp-grid">
        <div className="wp-form-card">
          {!isLive ? (
            <div className="wp-fields">
              {DEMO_FIELDS.map((field) => {
                const err = errors[field.id]
                return (
                  <div className="field-block" key={field.id}>
                    <label htmlFor={`wp-${field.id}`}>
                      {field.label}
                      {field.unit ? <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · {field.unit}</span> : null}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        id={`wp-${field.id}`}
                        value={String(inputRecord[field.id] ?? '')}
                        aria-invalid={Boolean(err)}
                        aria-describedby={err ? `wp-${field.id}-err` : undefined}
                        onChange={(e) => updateValue(field.id, e.target.value)}
                      >
                        {field.options?.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`wp-${field.id}`}
                        type="number"
                        inputMode="decimal"
                        placeholder={String(field.value)}
                        value={
                          inputRecord[field.id] === null || inputRecord[field.id] === undefined
                            ? ''
                            : String(inputRecord[field.id])
                        }
                        aria-invalid={Boolean(err)}
                        aria-describedby={err ? `wp-${field.id}-err` : undefined}
                        onChange={(e) => updateValue(field.id, e.target.value)}
                      />
                    )}
                    {err && (
                      <small id={`wp-${field.id}-err`} className="field-error" role="alert">
                        {err}
                      </small>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="wp-fields">
              {liveFeatures.length === 0 && <p className="field-help">No eligible feature columns in this dataset.</p>}
              {liveFeatures.map((col) => {
                const err = errors[col.id]
                const val = inputRecord[col.id]
                const describedBy = err ? `wp-${col.id}-err` : col.unit ? `wp-${col.id}-help` : undefined
                return (
                  <div className="field-block" key={col.id}>
                    <label htmlFor={`wp-${col.id}`}>{col.label}</label>
                    {col.allowedValues ? (
                      <select
                        id={`wp-${col.id}`}
                        value={val === null || val === undefined ? '' : String(val)}
                        aria-invalid={Boolean(err)}
                        aria-describedby={describedBy}
                        onChange={(e) => updateValue(col.id, e.target.value, col.dataType)}
                      >
                        <option value="">Select a value</option>
                        {col.allowedValues.map((v) => (
                          <option key={String(v)} value={String(v)}>
                            {String(v)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`wp-${col.id}`}
                        type={col.dataType === 'number' || col.dataType === 'integer' ? 'number' : 'text'}
                        step={col.dataType === 'integer' ? '1' : 'any'}
                        value={val === null || val === undefined ? '' : String(val)}
                        aria-invalid={Boolean(err)}
                        aria-describedby={describedBy}
                        onChange={(e) => updateValue(col.id, e.target.value, col.dataType)}
                      />
                    )}
                    {col.unit && !err && (
                      <small id={`wp-${col.id}-help`} className="field-help">
                        {col.unitInferred ? `Unit inferred: ${col.unit} — confirm before use` : `Unit: ${col.unit}`}
                      </small>
                    )}
                    {err && (
                      <small id={`wp-${col.id}-err`} className="field-error" role="alert">
                        {err}
                      </small>
                    )}
                  </div>
                )
              })}
              {errors.features && (
                <p className="field-error" role="alert">
                  {errors.features}
                </p>
              )}
              {errors.target && (
                <p className="field-error" role="alert">
                  {errors.target}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            className="button button-primary wp-submit"
            disabled={status === 'processing'}
            onClick={() => void handlePredict()}
          >
            {status === 'processing' ? 'Predicting…' : 'Predict yield'}
          </button>
          <p className="field-help" style={{ marginTop: '.5rem' }}>
            {isLive
              ? 'Same features and validation as the report. The model is refitted on all usable labelled rows.'
              : 'Demo values (850 / 28 / 120 / Irrigation) are placeholders — upload your CSV for live predictions.'}
          </p>
        </div>

        <div className="wp-result-col">
          {status === 'processing' && (
            <div className="wp-result wp-result--loading" aria-live="polite">
              <div className="wp-skeleton">
                <i />
                <i />
                <i />
              </div>
              <p className="field-help">Running {isLive ? selectedModelLabel : 'demo model'}…</p>
            </div>
          )}
          {status === 'error' && (
            <div className="wp-result wp-result--error" role="alert">
              <p>{message ?? 'Prediction failed. Check the values and try again.'}</p>
              <button type="button" className="button button-secondary" onClick={() => void handlePredict()}>
                Retry prediction
              </button>
            </div>
          )}
          {status === 'success' && result && (
            <div className="wp-result wp-result--success" aria-live="polite">
              <div className="wp-result-head">
                <span className="wp-leaf" aria-hidden="true">
                  🌿
                </span>
                <span className="status-tag">Prediction returned</span>
                {!isLive && <span className="status-tag demo-tag">Demo</span>}
              </div>
              <p className="wp-result-label">Predicted yield</p>
              <p className="wp-result-value">
                {Number.isFinite(result.value) ? Number(result.value.toFixed(2)) : '—'}
                <small>{result.unit ? ` ${result.unit}` : ' t/ha'}</small>
              </p>
              <p className="wp-result-meta">
                Model: {result.model} · Target: {targetLabel}
              </p>
              {result.interval && (
                <p className="wp-interval">
                  Error band {Number(result.interval.lower.toFixed(2))} – {Number(result.interval.upper.toFixed(2))}
                  {result.unit ? ` ${result.unit}` : ''}.<small> {result.interval.method}</small>
                </p>
              )}
              {!isLive && <p className="field-help">Demo placeholder — upload a dataset for a live estimate from your data.</p>}
              {result.notices?.length ? (
                <ul className="wp-notices">
                  {result.notices.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          {status === 'ready' && !result && (
            <div className="wp-result wp-result--empty">
              <div className="wp-empty-icon" aria-hidden="true">🌱</div>
              <p className="wp-empty-title">Your estimate will appear here</p>
              <p className="field-help">
                Fill the inputs on the left and choose “Predict yield”.{' '}
                {isLive
                  ? `Example from your data: ${report?.prediction.value.toFixed(2) ?? '—'} ${report?.prediction.unit ?? ''}`
                  : 'Demo shows 4.8 t/ha for 850 / 28 / 120 / Irrigation.'}
              </p>
              {!isLive && <p className="wp-empty-hint">Poster defaults prefilled as a preview — not a live model result.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WebsitePredictionPanel
