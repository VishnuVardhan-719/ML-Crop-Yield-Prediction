import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AnalysisReport } from '../../types/analysis'
import type { Language, ModelKind, PredictionResponse, PredictionStatus, Scalar } from '../../types/cropcast'
import { explainPrediction } from '../../services/explanationService'
import { runPrediction, ServiceError } from '../../services/predictionService'
import { ExplanationPanel } from '../explanation/ExplanationPanel'
import { LanguageSelector } from '../explanation/LanguageSelector'
import { ModelSelector } from '../prediction/ModelSelector'
import { PredictionForm } from '../prediction/PredictionForm'
import { PredictionResult } from '../prediction/PredictionResult'
import { VoiceControls } from '../voice/VoiceControls'
import { AnalysisNavigation } from './AnalysisNavigation'

const formatMetric = (value: number) => value.toFixed(2)
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const errorMessage = (error: unknown) => error instanceof ServiceError || error instanceof Error ? error.message : 'CropCast could not predict this field. Check the values and try again.'

function ReportSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section className="report-section" id={id} aria-labelledby={`${id}-title`}><h2 id={`${id}-title`}>{title}</h2>{children}</section>
}

function DataBars({ values, signed = false }: { values: Array<{ label: string; value: number }>; signed?: boolean }) {
  const max = Math.max(...values.map((item) => Math.abs(item.value)), 1)
  return <div className="data-bars">{values.map((item) => <div className="data-bar" key={item.label}><div className="data-bar-label"><span>{item.label}</span><strong>{item.value.toFixed(2)}</strong></div><div className="data-bar-track"><i data-negative={signed && item.value < 0} style={{ width: `${Math.max(Math.abs(item.value) / max * 100, 2)}%` }} /></div></div>)}</div>
}

export function AnalysisDashboard({ report }: { report: AnalysisReport }) {
  const [language, setLanguage] = useState<Language>('en')
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'playing' | 'paused' | 'stopped' | 'unavailable'>('idle')
  const [voiceMessage, setVoiceMessage] = useState<string>()
  const columns = report.inputColumns ?? []
  const defaultFeatures = columns.filter((column) => column.eligibleAsFeature && column.id !== report.dataset.target).map((column) => column.id)
  const [targetColumnId, setTargetColumnId] = useState(report.dataset.target)
  const [featureColumnIds, setFeatureColumnIds] = useState(defaultFeatures)
  const [model, setModel] = useState<ModelKind>(report.models.find((item) => item.selected)?.model ?? 'ridge')
  const [inputRecord, setInputRecord] = useState<Record<string, Scalar>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [predictionStatus, setPredictionStatus] = useState<PredictionStatus>('ready')
  const [prediction, setPrediction] = useState<PredictionResponse>()
  const [predictionMessage, setPredictionMessage] = useState<string>()
  const [fieldExplanation, setFieldExplanation] = useState<{ requested: boolean; status: 'loading' | 'success' | 'error'; text?: string; message?: string }>({ requested: false, status: 'loading' })
  const predictionAbortRef = useRef<AbortController | null>(null)
  const selectedModel = report.models.find((model) => model.selected)
  const explanation = report.explanations[language]

  useEffect(() => () => predictionAbortRef.current?.abort(), [])

  const downloadPredictions = () => {
    const csv = ['actual,predicted', ...report.prediction.actualVsPredicted.map((point) => `${point.actual},${point.predicted}`)].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${report.analysisId}-predictions.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const changeTarget = (next: string) => {
    setTargetColumnId(next)
    setFeatureColumnIds(columns.filter((column) => column.eligibleAsFeature && column.id !== next).map((column) => column.id))
    setInputRecord({})
    setErrors({})
    setPredictionStatus('ready')
    setPrediction(undefined)
    setFieldExplanation({ requested: false, status: 'loading' })
  }

  const changeFeatures = (next: string[]) => {
    setFeatureColumnIds(next)
    setInputRecord((current) => Object.fromEntries(Object.entries(current).filter(([key]) => next.includes(key))))
    setErrors({})
    setPredictionStatus('ready')
    setPrediction(undefined)
    setFieldExplanation({ requested: false, status: 'loading' })
  }

  const submitPrediction = async () => {
    const nextErrors: Record<string, string> = {}
    if (!targetColumnId) nextErrors.target = 'Choose the value to predict.'
    if (!featureColumnIds.length) nextErrors.features = 'Choose at least one feature column.'
    for (const columnId of featureColumnIds) {
      const value = inputRecord[columnId]
      if (value === null || value === undefined || value === '') nextErrors[columnId] = 'Enter a value for this field.'
    }
    if (Object.keys(nextErrors).length) return setErrors(nextErrors)

    predictionAbortRef.current?.abort()
    const controller = new AbortController()
    predictionAbortRef.current = controller
    setErrors({})
    setPredictionStatus('processing')
    setPredictionMessage(undefined)
    setFieldExplanation({ requested: false, status: 'loading' })
    try {
      const response = await runPrediction({ datasetId: report.analysisId, targetColumnId, featureColumnIds, model, inputRecord }, controller.signal)
      if (!controller.signal.aborted) {
        setPrediction(response)
        setPredictionStatus('success')
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setPredictionStatus('error')
        setPredictionMessage(errorMessage(error))
      }
    }
  }

  const requestFieldExplanation = async () => {
    if (!prediction) return
    setFieldExplanation({ requested: true, status: 'loading' })
    try {
      const response = await explainPrediction(prediction.predictionId, language)
      setFieldExplanation({ requested: true, status: 'success', text: response.text })
    } catch (error) {
      setFieldExplanation({ requested: true, status: 'error', message: errorMessage(error) })
    }
  }

  return (
    <div className="analysis-report">
      <header className="analysis-report-header">
        <div>
          <div className="report-status-row"><span className="status-tag">Analysis complete</span>{report.source === 'demo' && <span className="status-tag demo-tag">Demo analysis</span>}</div>
          <h1>Automated agricultural analysis</h1>
          <p>{report.dataset.fileName} · {report.dataset.rows.toLocaleString()} rows · target: {report.dataset.target}</p>
        </div>
        <div className="report-actions"><button className="button button-secondary" type="button" onClick={() => window.print()}>Print report</button><button className="button button-primary" type="button" onClick={downloadPredictions}>Download predictions</button></div>
      </header>
      {report.source === 'demo' && <p className="demo-disclosure" role="note"><strong>Demo data:</strong> every statistic, metric, chart, and explanation below comes from the isolated sample adapter, not an uploaded dataset.</p>}
      <div className="analysis-report-layout">
        <AnalysisNavigation />
        <div className="report-content">
          <ReportSection id="overview" title="Dataset overview">
            <dl className="metric-grid">
              <div><dt>Rows</dt><dd>{report.dataset.rows.toLocaleString()}</dd></div><div><dt>Columns</dt><dd>{report.dataset.columns}</dd></div><div><dt>Numerical features</dt><dd>{report.dataset.numericFeatures}</dd></div><div><dt>Categorical features</dt><dd>{report.dataset.categoricalFeatures}</dd></div><div><dt>Target</dt><dd>{report.dataset.target}</dd></div><div><dt>File size</dt><dd>{fileSize(report.dataset.fileSize)}</dd></div>
            </dl>
            <div className="report-subsection"><h3>Files detected</h3><ul className="file-list">{report.dataset.detectedFiles.map((file) => <li key={file}><span aria-hidden="true">✓</span>{file}<small>{report.dataset.fileType}</small></li>)}</ul></div>
          </ReportSection>

          <ReportSection id="quality" title="Data quality">
            <div className="quality-list">{report.quality.map((check) => <article key={check.label}><span className="quality-state" data-status={check.status}>{check.status}</span><div><h3>{check.label}</h3><p>{check.detail}</p></div><strong>{check.value}</strong></article>)}</div>
          </ReportSection>

          <ReportSection id="exploration" title="Exploratory analysis">
            <div className="analysis-visual-grid"><article><h3>Target distribution</h3><p className="chart-summary">Distribution of {report.dataset.target} across returned bins.</p><DataBars values={report.profile.targetSummary} /></article><article><h3>Feature relationships</h3><p className="chart-summary">Pearson correlation with the target. Association does not establish causation.</p><DataBars signed values={report.profile.correlations.map(({ feature, value }) => ({ label: feature, value }))} /></article></div>
            <div className="table-scroll"><table><caption>Numeric feature summary returned by the analysis</caption><thead><tr><th>Feature</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th><th>Std. dev.</th></tr></thead><tbody>{report.profile.numericSummary.map((row) => <tr key={row.feature}><th scope="row">{row.feature}</th><td>{row.mean}</td><td>{row.median}</td><td>{row.min}</td><td>{row.max}</td><td>{row.standardDeviation}</td></tr>)}</tbody></table></div>
            <div className="report-subsection"><h3>Categorical profile</h3><div className="categorical-grid">{report.profile.categoricalSummary.map((summary) => <article key={summary.feature}><div><strong>{summary.feature}</strong><span>{summary.uniqueValues} unique values</span></div><DataBars values={summary.topCategories.map(({ label, count }) => ({ label, value: count }))} /></article>)}</div></div>
          </ReportSection>

          <ReportSection id="preprocessing" title="Preprocessing">
            <p className="section-intro">Transformations are reported for transparency and must be fitted on training folds only.</p><ol className="preprocessing-list">{report.preprocessing.map((step) => <li key={step.label}><span aria-hidden="true">✓</span><div><strong>{step.label}</strong><p>{step.detail}</p></div></li>)}</ol>
          </ReportSection>

          <ReportSection id="models" title="Model performance">
            <div className="table-scroll"><table className="model-table"><caption>Cross-validated regression model comparison</caption><thead><tr><th>Model</th><th>R²</th><th>MAE</th><th>RMSE</th><th>Holdout RMSE</th><th>Validation</th></tr></thead><tbody>{report.models.map((model) => <tr key={model.model} data-selected={model.selected}><th scope="row">{model.label}{model.selected && <span className="status-tag">Selected</span>}</th><td>{formatMetric(model.r2)}</td><td>{formatMetric(model.mae)}</td><td>{formatMetric(model.rmse)}</td><td>{model.holdoutRmse !== undefined ? formatMetric(model.holdoutRmse) : '—'}</td><td>{model.crossValidation}</td></tr>)}</tbody></table></div>
            {selectedModel && <article className="best-model"><div><h3>Best performing model</h3><strong className="best-model-name">{selectedModel.label}</strong><p>{selectedModel.label} achieved the strongest validation performance according to the returned evaluation metrics. This selection is not hardcoded.</p></div><dl><div><dt>R²</dt><dd>{formatMetric(selectedModel.r2)}</dd></div><div><dt>MAE</dt><dd>{formatMetric(selectedModel.mae)}</dd></div><div><dt>RMSE</dt><dd>{formatMetric(selectedModel.rmse)}</dd></div></dl><p className="model-configuration"><strong>Selected parameters:</strong> {selectedModel.parameters.join(', ')}</p></article>}
          </ReportSection>

          <ReportSection id="prediction" title="Prediction">
            <div className="prediction-summary"><div><p>{report.prediction.label}</p><strong>{report.prediction.value}{report.prediction.unit && <small>{report.prediction.unit}</small>}</strong><span>Generated with {selectedModel?.label ?? 'the selected model'}</span></div><p>Interpret this estimate only within the conditions represented by the analyzed data.</p></div>
            <div className="analysis-visual-grid"><article><h3>Actual vs predicted</h3><p className="chart-summary">Paired values for held-out records from this analysis.</p><div className="paired-values">{report.prediction.actualVsPredicted.map((point, index) => <div key={`${point.actual}-${index}`}><span>Record {index + 1}</span><i style={{ width: `${point.actual / 6 * 100}%` }} /><b style={{ width: `${point.predicted / 6 * 100}%` }} /><small>Actual {point.actual} · predicted {point.predicted}</small></div>)}</div></article><article><h3>Residual analysis</h3><p className="chart-summary">Prediction error around zero for the displayed records.</p><DataBars signed values={report.prediction.residuals.map((value, index) => ({ label: `Record ${index + 1}`, value }))} /></article></div>
            {columns.length > 0 ? <div className="field-prediction"><h3>Predict a specific field</h3><p className="section-intro">Enter a field record using the columns from this uploaded dataset.</p><PredictionForm columns={columns} targetColumnId={targetColumnId} featureColumnIds={featureColumnIds} inputRecord={inputRecord} errors={errors} onTargetChange={changeTarget} onFeaturesChange={changeFeatures} onInputChange={(columnId, value) => setInputRecord((current) => ({ ...current, [columnId]: value }))} /><ModelSelector value={model} onChange={setModel} /><button className="button button-primary" type="button" disabled={predictionStatus === 'processing'} onClick={() => void submitPrediction()}>{predictionStatus === 'processing' ? 'Predicting…' : 'Predict this field'}</button><PredictionResult status={predictionStatus} result={prediction} message={predictionMessage} targetLabel={columns.find((column) => column.id === targetColumnId)?.label} onRetry={() => void submitPrediction()} />{prediction && <ExplanationPanel status={fieldExplanation.status} requested={fieldExplanation.requested} text={fieldExplanation.text} message={fieldExplanation.message} language={language} onExplain={() => void requestFieldExplanation()} />}</div> : <p className="stage-locked">Field-by-field prediction is available after analyzing an uploaded dataset.</p>}
          </ReportSection>

          <ReportSection id="insights" title="Model insights">
            <p className="section-intro">Standardized coefficients describe model associations, not universal feature importance or causation.</p><DataBars signed values={report.insights.map(({ feature, coefficient }) => ({ label: feature, value: coefficient }))} /><ul className="insight-list">{report.insights.map((insight) => <li key={insight.feature}><strong>{insight.feature}</strong><p>{insight.interpretation}</p></li>)}</ul>
          </ReportSection>

          <ReportSection id="explanation" title="AI explanation">
            <div className="explanation-toolbar"><LanguageSelector value={language} loading={false} onChange={(next) => { window.speechSynthesis?.cancel(); setVoiceStatus('idle'); setLanguage(next) }} />{report.source === 'demo' && <span className="status-tag demo-tag">Demo explanation</span>}</div>
            {explanation ? <div className="analysis-explanation"><p lang={language}>{explanation}</p><VoiceControls text={explanation} language={language} status={voiceStatus} message={voiceMessage} onStatusChange={(status, message) => { setVoiceStatus(status); setVoiceMessage(message) }} /></div> : <div className="inline-alert" role="alert">An explanation in this language was not returned. Select another language or retry when the explanation service is available.</div>}
            <div className="limitations"><h3>Limitations and caveats</h3><ul>{report.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul></div>
          </ReportSection>
        </div>
      </div>
    </div>
  )
}
