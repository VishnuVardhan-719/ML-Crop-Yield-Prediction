import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ActualVsPredicted, AnalysisReport, InsightsMethod } from '../../types/analysis'
import type { Language, PredictionResponse, PredictionStatus, Scalar, ValidationStrategy } from '../../types/cropcast'
import { explainPrediction } from '../../services/explanationService'
import { runPrediction, ServiceError } from '../../services/predictionService'
import { ExplanationPanel } from '../explanation/ExplanationPanel'
import { LanguageSelector } from '../explanation/LanguageSelector'
import { PredictionForm } from '../prediction/PredictionForm'
import { PredictionResult } from '../prediction/PredictionResult'
import { VoiceControls } from '../voice/VoiceControls'
import { AnalysisNavigation } from './AnalysisNavigation'
import { ValidationStrategyPicker } from './ValidationStrategyPicker'

/** The API returns null for undefined statistics, so never coerce those to 0. */
const formatNumber = (value: number | null | undefined, digits = 2) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—'
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const unitLabel = (unit?: string, inferred?: boolean) => !unit ? '' : inferred ? `${unit} (inferred)` : unit
const errorMessage = (error: unknown) => error instanceof ServiceError || error instanceof Error ? error.message : 'CropCast could not predict this field. Check the values and try again.'

function ReportSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section className="report-section" id={id} aria-labelledby={`${id}-title`}><h2 id={`${id}-title`}>{title}</h2>{children}</section>
}

function DataBars({ values, signed = false }: { values: Array<{ label: string; value: number | null }>; signed?: boolean }) {
  const present = values.filter((item): item is { label: string; value: number } => typeof item.value === 'number' && Number.isFinite(item.value))
  const max = Math.max(...present.map((item) => Math.abs(item.value)), 1)
  return <div className="data-bars">{values.map((item) => {
    const known = typeof item.value === 'number' && Number.isFinite(item.value)
    return <div className="data-bar" key={item.label}><div className="data-bar-label"><span>{item.label}</span><strong>{formatNumber(item.value)}</strong></div><div className="data-bar-track">{known && <i data-negative={signed && item.value! < 0} style={{ width: `${Math.max(Math.abs(item.value!) / max * 100, 2)}%` }} />}</div></div>
  })}</div>
}

/** Bars are scaled to the largest value actually present, never to a hardcoded axis maximum. */
function PairedValues({ pairs }: { pairs: ActualVsPredicted[] }) {
  const magnitudes = pairs
    .flatMap((pair) => [pair.actual, pair.predicted])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map(Math.abs)
  const scale = Math.max(...magnitudes, 1)
  const width = (value: number | null) => typeof value === 'number' && Number.isFinite(value) ? `${Math.abs(value) / scale * 100}%` : '0%'
  return <div className="paired-values">{pairs.map((pair, index) => <div key={`${pair.actual}-${pair.predicted}-${index}`}><span>Record {index + 1}</span><i style={{ width: width(pair.actual) }} /><b style={{ width: width(pair.predicted) }} /><small>Actual {formatNumber(pair.actual)} · predicted {formatNumber(pair.predicted)}</small></div>)}</div>
}

const ATTRIBUTION_TITLES: Record<InsightsMethod, string> = {
  'standardized-coefficients': 'Standardized coefficients',
  'permutation-importance': 'Permutation importance',
}

type ValidationControls = {
  pending?: ValidationStrategy
  error?: string
  onChange: (strategy: ValidationStrategy) => void
}

export function AnalysisDashboard({ report, validationControls }: { report: AnalysisReport; validationControls?: ValidationControls }) {
  const [language, setLanguage] = useState<Language>('en')
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'playing' | 'paused' | 'stopped' | 'unavailable'>('idle')
  const [voiceMessage, setVoiceMessage] = useState<string>()
  const columns = report.inputColumns ?? []
  const defaultFeatures = columns.filter((column) => column.eligibleAsFeature && column.id !== report.dataset.target).map((column) => column.id)
  const [targetColumnId, setTargetColumnId] = useState(report.dataset.target)
  const [featureColumnIds, setFeatureColumnIds] = useState(defaultFeatures)
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
    const csv = ['actual,predicted,residual', ...report.prediction.actualVsPredicted.map((point) => `${point.actual},${point.predicted},${point.residual}`)].join('\n')
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
      const response = await runPrediction(
        // No `model`: the API runs whichever candidate the analysis scored best, so a caller cannot pick
        // a weaker algorithm for this record than the report already justified.
        { datasetId: report.analysisId, targetColumnId, featureColumnIds, inputRecord, validation: report.evaluation.validation.strategy },
        controller.signal,
      )
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

          {report.source === 'demo' && <p className="field-help">The bundled sample dataset is synthetic and deliberately noisy: a saturating fertiliser response, a pest threshold, and a rain-by-irrigation interaction mean the linear models genuinely cannot match the ensemble.</p>}

          <ReportSection id="exploration" title="Exploratory analysis">
            <div className="analysis-visual-grid"><article><h3>Target distribution</h3><p className="chart-summary">Distribution of {report.dataset.target} across returned bins.</p><DataBars values={report.profile.targetSummary} /></article><article><h3>Feature relationships</h3><p className="chart-summary">Pearson correlation with the target. Association does not establish causation.</p><DataBars signed values={report.profile.correlations.map(({ feature, value }) => ({ label: feature, value }))} /></article></div>
            <div className="table-scroll"><table><caption>Numeric feature summary returned by the analysis</caption><thead><tr><th>Feature</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th><th>Std. dev.</th></tr></thead><tbody>{report.profile.numericSummary.map((row) => <tr key={row.feature}><th scope="row">{row.feature}</th><td>{formatNumber(row.mean)}</td><td>{formatNumber(row.median)}</td><td>{formatNumber(row.min)}</td><td>{formatNumber(row.max)}</td><td>{formatNumber(row.standardDeviation)}</td></tr>)}</tbody></table></div>
            <div className="report-subsection"><h3>Categorical profile</h3><div className="categorical-grid">{report.profile.categoricalSummary.map((summary) => <article key={summary.feature}><div><strong>{summary.feature}</strong><span>{summary.uniqueValues} unique values</span></div><DataBars values={summary.topCategories.map(({ label, count }) => ({ label, value: count }))} /></article>)}</div></div>
          </ReportSection>

          <ReportSection id="preprocessing" title="Preprocessing">
            <p className="section-intro">Transformations are reported for transparency and must be fitted on training folds only.</p><ol className="preprocessing-list">{report.preprocessing.map((step) => <li key={step.label}><span aria-hidden="true">✓</span><div><strong>{step.label}</strong><p>{step.detail}</p></div></li>)}</ol>
          </ReportSection>

          <ReportSection id="models" title="Model performance">
            {!report.evaluation.beatsBaseline && <div className="inline-alert" role="alert"><strong>No model beat the mean baseline.</strong> The best candidate is within {Math.round(report.evaluation.minimumMargin * 100)}% of simply predicting the average {report.dataset.target}, so this dataset carries little signal the model can use. Treat the numbers below as uninformative.</div>}
            <div className="table-scroll"><table className="model-table"><caption>Cross-validated regression model comparison, against a mean baseline</caption><thead><tr><th>Model</th><th>R²</th><th>MAE</th><th>RMSE</th><th>Holdout RMSE</th><th>Validation</th></tr></thead><tbody>
              {report.models.map((model) => <tr key={model.model} data-selected={model.selected}><th scope="row">{model.label}{model.selected && <span className="status-tag">Selected</span>}</th><td>{formatNumber(model.r2)}</td><td>{formatNumber(model.mae)}</td><td>{formatNumber(model.rmse)}</td><td>{formatNumber(model.holdoutRmse)}</td><td>{model.crossValidation}</td></tr>)}
              <tr data-baseline="true"><th scope="row">{report.evaluation.baseline.label}<span className="status-tag">Reference</span></th><td>{formatNumber(report.evaluation.baseline.r2)}</td><td>{formatNumber(report.evaluation.baseline.mae)}</td><td>{formatNumber(report.evaluation.baseline.rmse)}</td><td>{formatNumber(report.evaluation.baseline.holdoutRmse)}</td><td>{report.evaluation.baseline.crossValidation}</td></tr>
            </tbody></table></div>
            <div className="report-subsection"><h3>How the selected model was chosen</h3><p>{report.evaluation.selectionRule}</p><p><strong>{report.evaluation.holdoutSummary}.</strong> {report.evaluation.note}</p><p>{report.evaluation.improvementOverBaseline !== null ? `The selected model reduces cross-validated RMSE by ${(report.evaluation.improvementOverBaseline * 100).toFixed(1)}% against predicting the mean.` : 'The improvement over the mean baseline could not be computed for this dataset.'}</p><p className="field-help">A metric shown as “—” was undefined for that model and was excluded from selection rather than reported as zero.</p></div>
            <div className="report-subsection"><h3>Validation strategy</h3><p><strong>{report.evaluation.validation.label}.</strong> {report.evaluation.validation.note}</p>{validationControls ? <ValidationStrategyPicker options={report.evaluation.validation.options} value={report.evaluation.validation.strategy} pending={validationControls.pending} error={validationControls.error} onChange={validationControls.onChange} /> : <p className="field-help">The demo replays one recorded run, so its split cannot be changed here. Analyze an uploaded dataset to compare strategies.</p>}{report.evaluation.validation.temporalColumn && report.evaluation.validation.strategy !== 'temporal' && <p className="warning-text">“{report.evaluation.validation.temporalColumn}” looks temporal, but rows were not ordered by it, so this is not a forecast test and these scores do not describe performance on a future season.</p>}{report.evaluation.validation.groupOverlap.length > 0 && <p className="warning-text">Rows sharing {report.evaluation.validation.groupOverlap.map((item) => item.column).join(', ')} appear in both partitions, so part of the reported accuracy is memorisation of an entity rather than transfer to a new one. Choose a grouped split to remove it.</p>}</div>
            {selectedModel && <article className="best-model"><div><h3>Best performing model</h3><strong className="best-model-name">{selectedModel.label}</strong><p>{selectedModel.label} recorded the lowest cross-validated RMSE of the compared models. This selection is computed from the returned metrics, not hardcoded.</p></div><dl><div><dt>R²</dt><dd>{formatNumber(selectedModel.r2)}</dd></div><div><dt>MAE</dt><dd>{formatNumber(selectedModel.mae)}</dd></div><div><dt>RMSE</dt><dd>{formatNumber(selectedModel.rmse)}</dd></div></dl><p className="model-configuration"><strong>Fixed hyperparameters:</strong> {selectedModel.parameters.join(', ')}</p><p className="field-help">These are constants set by CropCast, not values chosen by a search.</p></article>}
          </ReportSection>

          <ReportSection id="prediction" title="Prediction">
            <div className="prediction-summary"><div><p>{report.prediction.label}</p><strong>{formatNumber(report.prediction.value)}{report.prediction.unit && <small>{unitLabel(report.prediction.unit, report.prediction.unitInferred)}</small>}</strong>{report.prediction.interval && <span>RMSE-based error band {formatNumber(report.prediction.interval.lower)} – {formatNumber(report.prediction.interval.upper)}{report.prediction.unit ? ` ${report.prediction.unit}` : ''}</span>}<span>Generated with {selectedModel?.label ?? 'the selected model'}</span></div><p>Interpret this estimate only within the conditions represented by the analyzed data.</p></div>
            {report.prediction.interval && <p className="field-help">Error-band basis: {report.prediction.interval.method}</p>}
            <div className="analysis-visual-grid"><article><h3>Actual vs predicted</h3><p className="chart-summary">Held-out records from this analysis. Showing {report.prediction.evidenceShown} of {report.prediction.evidenceTotal}{report.prediction.evidenceShown < report.prediction.evidenceTotal ? ', evenly sampled across the holdout' : ''}.</p><PairedValues pairs={report.prediction.actualVsPredicted} /></article><article><h3>Residual analysis</h3><p className="chart-summary">Prediction error around zero for the displayed records.</p><DataBars signed values={report.prediction.residuals.map((value, index) => ({ label: `Record ${index + 1}`, value }))} /></article></div>
            {columns.length > 0 ? <div className="field-prediction"><h3>Predict a specific field</h3><p className="section-intro">Enter a field record using the columns from this uploaded dataset. CropCast automatically compares the candidate models for the selected fields and uses the one with the lowest cross-validated RMSE.</p><PredictionForm columns={columns} targetColumnId={targetColumnId} featureColumnIds={featureColumnIds} inputRecord={inputRecord} errors={errors} onTargetChange={changeTarget} onFeaturesChange={changeFeatures} onInputChange={(columnId, value) => setInputRecord((current) => ({ ...current, [columnId]: value }))} /><button className="button button-primary" type="button" disabled={predictionStatus === 'processing'} onClick={() => void submitPrediction()}>{predictionStatus === 'processing' ? 'Predicting…' : 'Predict this field'}</button><PredictionResult status={predictionStatus} result={prediction} message={predictionMessage} targetLabel={columns.find((column) => column.id === targetColumnId)?.label} onRetry={() => void submitPrediction()} />{prediction && <ExplanationPanel status={fieldExplanation.status} requested={fieldExplanation.requested} text={fieldExplanation.text} message={fieldExplanation.message} language={language} onExplain={() => void requestFieldExplanation()} />}</div> : <p className="stage-locked">Field-by-field prediction is available after analyzing an uploaded dataset.</p>}
          </ReportSection>

          <ReportSection id="insights" title="What drove the estimate">
            <p className="section-intro"><strong>{ATTRIBUTION_TITLES[report.insightsMethod]}.</strong> {report.insightsNote}</p><DataBars signed={report.insightsMethod === 'standardized-coefficients'} values={report.insights.map(({ feature, coefficient }) => ({ label: feature, value: coefficient }))} /><ul className="insight-list">{report.insights.map((insight) => <li key={insight.feature}><strong>{insight.feature}</strong><p>{insight.interpretation}</p></li>)}</ul>
          </ReportSection>

          <ReportSection id="explanation" title="Automated summary">
            <div className="explanation-toolbar"><LanguageSelector value={language} loading={false} onChange={(next) => { window.speechSynthesis?.cancel(); setVoiceStatus('idle'); setLanguage(next) }} />{report.source === 'demo' && <span className="status-tag demo-tag">Demo explanation</span>}</div>
            {explanation ? <div className="analysis-explanation"><p lang={language}>{explanation}</p><VoiceControls text={explanation} language={language} status={voiceStatus} message={voiceMessage} onStatusChange={(status, message) => { setVoiceStatus(status); setVoiceMessage(message) }} /></div> : <div className="inline-alert" role="alert">An explanation in this language was not returned. Select another language or retry when the explanation service is available.</div>}
            <div className="limitations"><h3>Limitations and caveats</h3><ul>{report.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul></div>
          </ReportSection>
        </div>
      </div>
    </div>
  )
}
