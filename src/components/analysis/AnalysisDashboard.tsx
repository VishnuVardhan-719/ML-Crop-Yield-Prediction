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
import { StatCards } from '../dashboard/StatCards'
import { YieldDistribution } from '../dashboard/YieldDistribution'
import { ModelComparisonTable } from '../comparison/ModelComparisonTable'
import { InsightsPanel } from '../insights/InsightsPanel'
import { WebsitePredictionPanel } from '../prediction/WebsitePredictionPanel'
import { VisualAnalyticsSection } from '../visuals/VisualAnalyticsSection'

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
  return <div className="paired-values">{pairs.map((pair, index) => <div key={`${pair.actual}-${pair.predicted}-${index}`}><span>Test record {index + 1}</span><i style={{ width: width(pair.actual) }} /><b style={{ width: width(pair.predicted) }} /><small>Actual {formatNumber(pair.actual)} · predicted {formatNumber(pair.predicted)}</small></div>)}</div>
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

export function AnalysisDashboard({ report, validationControls, onUploadAnother }: { report: AnalysisReport; validationControls?: ValidationControls; onUploadAnother?: () => void }) {
  const [language, setLanguage] = useState<Language>('en')
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'playing' | 'paused' | 'stopped' | 'unavailable'>('idle')
  const [voiceMessage, setVoiceMessage] = useState<string>()
  // The analyzed target is authoritative; candidate flags can omit a target resolved by the parent.
  const columns = (report.inputColumns ?? []).map((column) => ({ ...column, eligibleAsTarget: column.id === report.dataset.target }))
  const defaultFeatures = columns.filter((column) => column.eligibleAsFeature && column.id !== report.dataset.target).map((column) => column.id)
  const targetColumnId = report.dataset.target
  const featureColumnIds = defaultFeatures
  const [inputRecord, setInputRecord] = useState<Record<string, Scalar>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [predictionStatus, setPredictionStatus] = useState<PredictionStatus>('ready')
  const [prediction, setPrediction] = useState<PredictionResponse>()
  const [predictionMessage, setPredictionMessage] = useState<string>()
  const [fieldExplanation, setFieldExplanation] = useState<{ requested: boolean; status: 'loading' | 'success' | 'error'; text?: string; message?: string }>({ requested: false, status: 'loading' })
  const predictionAbortRef = useRef<AbortController | null>(null)
  const explanationAbortRef = useRef<AbortController | null>(null)
  const selectedModel = report.models.find((model) => model.selected)
  const explanation = report.explanations[language]
  const [showAllEvidence, setShowAllEvidence] = useState(false)
  const evidencePairs = showAllEvidence ? report.prediction.actualVsPredicted : report.prediction.actualVsPredicted.slice(0, 10)
  const typicalInputs = report.prediction.inputRecord
  const hasTypicalInputs = typicalInputs && featureColumnIds.every((id) => typicalInputs[id] !== undefined && typicalInputs[id] !== null)

  const clearFieldExplanation = () => {
    explanationAbortRef.current?.abort()
    setFieldExplanation({ requested: false, status: 'loading' })
  }

  const invalidatePrediction = () => {
    predictionAbortRef.current?.abort()
    setPredictionStatus('ready')
    setPrediction(undefined)
    setPredictionMessage(undefined)
    clearFieldExplanation()
  }

  useEffect(() => {
    let active = true
    predictionAbortRef.current?.abort()
    explanationAbortRef.current?.abort()
    queueMicrotask(() => {
      if (!active) return
      setPredictionStatus('ready')
      setPrediction(undefined)
      setPredictionMessage(undefined)
      setFieldExplanation({ requested: false, status: 'loading' })
    })
    return () => {
      active = false
      predictionAbortRef.current?.abort()
      explanationAbortRef.current?.abort()
    }
  }, [report, validationControls?.pending])

  const downloadPredictions = () => {
    const csv = ['actual,predicted,residual', ...report.prediction.actualVsPredicted.map((point) => `${point.actual},${point.predicted},${point.residual}`)].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${report.analysisId}-predictions.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const replaceInputs = (next: Record<string, Scalar>) => {
    setInputRecord(Object.fromEntries(featureColumnIds.filter((id) => id in next).map((id) => [id, next[id]])))
    setErrors({})
    invalidatePrediction()
  }

  const changeInput = (columnId: string, value: Scalar) => {
    invalidatePrediction()
    setErrors({})
    setInputRecord((current) => ({ ...current, [columnId]: value }))
  }

  const submitPrediction = async () => {
    if (validationControls?.pending || report.source === 'demo') return
    invalidatePrediction()
    const nextErrors: Record<string, string> = {}
    if (!targetColumnId) nextErrors.target = 'Choose the value to predict.'
    if (!featureColumnIds.length) nextErrors.features = 'Choose at least one feature column.'
    for (const columnId of featureColumnIds) {
      const value = inputRecord[columnId]
      if (value === null || value === undefined || value === '') nextErrors[columnId] = 'Enter a value for this field.'
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      requestAnimationFrame(() => document.getElementById(`input-${Object.keys(nextErrors)[0]}`)?.focus())
      return
    }

    const controller = new AbortController()
    predictionAbortRef.current = controller
    setErrors({})
    setPredictionStatus('processing')
    setPredictionMessage(undefined)
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
    if (!prediction || validationControls?.pending) return
    explanationAbortRef.current?.abort()
    const controller = new AbortController()
    explanationAbortRef.current = controller
    setFieldExplanation({ requested: true, status: 'loading' })
    try {
      const response = await explainPrediction(prediction.predictionId, language, controller.signal)
      if (!controller.signal.aborted) setFieldExplanation({ requested: true, status: 'success', text: response.text })
    } catch (error) {
      if (!controller.signal.aborted) setFieldExplanation({ requested: true, status: 'error', message: errorMessage(error) })
    }
  }

  return (
    <div className="analysis-report">
      <header className="analysis-report-header">
        <div>
          <div className="report-status-row"><span className="status-tag">Analysis complete</span>{report.source === 'demo' && <span className="status-tag demo-tag">Demo analysis</span>}</div>
          <h1>Your crop analysis</h1>
          <p>{report.dataset.fileName} · {report.dataset.rows.toLocaleString()} rows · target: {report.dataset.target}</p>
        </div>
        <div className="report-actions">{report.source === 'uploaded' && <a className="button button-primary" href="#prediction">Predict a new record</a>}{onUploadAnother && <button className="button button-secondary" type="button" onClick={onUploadAnother}>Upload another dataset</button>}<button className="button button-secondary" type="button" onClick={() => window.print()}>Print report</button><button className="text-button" type="button" onClick={downloadPredictions}>Download test evidence</button></div>
      </header>
      {report.source === 'demo' && <p className="demo-disclosure" role="note"><strong>Demo data:</strong> every statistic, metric, chart, and explanation below comes from the isolated sample adapter, not an uploaded dataset.</p>}
      <div className="report-brief">
        <div><p className="kicker">What happens next</p><h2>Learn from historical data.<br />Estimate one new outcome.</h2><p>The model comparison tests patterns in your dataset. The prediction form estimates {report.dataset.target} for one new record; it does not create extra dataset rows.</p></div>
        <dl className="report-key-results"><div><dt>Selected model</dt><dd>{selectedModel?.label ?? 'Not available'}</dd></div><div><dt>Cross-validated RMSE</dt><dd>{formatNumber(selectedModel?.rmse)} <small>{unitLabel(report.prediction.unit, report.prediction.unitInferred)}</small></dd></div><div><dt>Validation</dt><dd>{report.evaluation.validation.label}</dd></div></dl>
      </div>
      <div className="analysis-report-layout">
        <AnalysisNavigation />
        <div className="report-content">
          <ReportSection id="overview" title="Dataset overview">
            <dl className="metric-grid">
              <div><dt>Rows</dt><dd>{report.dataset.rows.toLocaleString()}</dd></div><div><dt>Columns</dt><dd>{report.dataset.columns}</dd></div><div><dt>Numerical features</dt><dd>{report.dataset.numericFeatures}</dd></div><div><dt>Categorical features</dt><dd>{report.dataset.categoricalFeatures}</dd></div><div><dt>Target</dt><dd>{report.dataset.target}</dd></div><div><dt>File size</dt><dd>{fileSize(report.dataset.fileSize)}</dd></div>
            </dl>
            <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
              <StatCards report={report} />
              <YieldDistribution report={report} />
            </div>
            <div className="report-subsection"><h3>Files detected</h3><ul className="file-list">{report.dataset.detectedFiles.map((file) => <li key={file}><span aria-hidden="true">✓</span>{file}<small>{report.dataset.fileType}</small></li>)}</ul></div>
          </ReportSection>

          <ReportSection id="models" title="Model performance">
            <p className="section-intro">Four regression models are compared with a simple reference that predicts the training mean. The model with the lowest cross-validated RMSE is selected; a selected model is not automatically a useful one.</p>
            <dl className="metric-guide"><div><dt>RMSE · lower is better</dt><dd>Prediction error in the target's units, with larger errors penalized more.</dd></div><div><dt>MAE · lower is better</dt><dd>Average absolute difference between predicted and known values.</dd></div><div><dt>R² · not accuracy %</dt><dd>A comparison with predicting the mean. It can be negative; closer to 1 is better.</dd></div></dl>
            {!report.evaluation.beatsBaseline && <div className="inline-alert" role="alert"><strong>No model beat the mean baseline by the required margin.</strong> No candidate achieved more than {Math.round(report.evaluation.minimumMargin * 100)}% lower cross-validated RMSE than simply predicting the average {report.dataset.target}, so useful predictive signal is not established by this comparison. Treat the results as exploratory.</div>}
            <div className="table-scroll"><table className="model-table"><caption>Cross-validated regression model comparison, against a mean baseline</caption><thead><tr><th>Model</th><th>CV R²</th><th>CV MAE</th><th>CV RMSE</th><th>Diagnostic holdout RMSE</th><th>Validation</th></tr></thead><tbody>
              {report.models.map((model) => <tr key={model.model} data-selected={model.selected}><th scope="row">{model.label}{model.selected && <span className="status-tag">Selected</span>}</th><td>{formatNumber(model.r2)}</td><td>{formatNumber(model.mae)}</td><td>{formatNumber(model.rmse)}</td><td>{formatNumber(model.holdoutRmse)}</td><td>{model.crossValidation}</td></tr>)}
              <tr data-baseline="true"><th scope="row">{report.evaluation.baseline.label}<span className="status-tag">Reference</span></th><td>{formatNumber(report.evaluation.baseline.r2)}</td><td>{formatNumber(report.evaluation.baseline.mae)}</td><td>{formatNumber(report.evaluation.baseline.rmse)}</td><td>{formatNumber(report.evaluation.baseline.holdoutRmse)}</td><td>{report.evaluation.baseline.crossValidation}</td></tr>
            </tbody></table></div>
            <div style={{ marginTop: '1.25rem' }}>
              <ModelComparisonTable report={report} />
              <p className="field-help" style={{ marginTop: '.5rem' }}>Compact poster-style comparison — same live metrics, baseline included when available.</p>
            </div>
            <div className="report-subsection"><h3>How the selected model was chosen</h3><p>{report.evaluation.selectionRule}</p><p><strong>{report.evaluation.holdoutSummary}.</strong> {report.evaluation.note}</p><p>{report.evaluation.improvementOverBaseline !== null ? `The selected model reduces cross-validated RMSE by ${(report.evaluation.improvementOverBaseline * 100).toFixed(1)}% against predicting the mean.` : 'The improvement over the mean baseline could not be computed for this dataset.'}</p><p className="field-help">A metric shown as “—” was undefined for that model and was excluded from selection rather than reported as zero.</p></div>
            <div className="report-subsection"><h3>Validation strategy</h3><p><strong>{report.evaluation.validation.label}.</strong> {report.evaluation.validation.note}</p>{validationControls ? <ValidationStrategyPicker options={report.evaluation.validation.options} value={report.evaluation.validation.strategy} pending={validationControls.pending} error={validationControls.error} onChange={validationControls.onChange} /> : <p className="field-help">The demo replays one recorded run, so its split cannot be changed here. Analyze an uploaded dataset to compare strategies.</p>}{report.evaluation.validation.temporalColumn && report.evaluation.validation.strategy !== 'temporal' && <p className="warning-text">“{report.evaluation.validation.temporalColumn}” looks temporal, but rows were not ordered by it, so this is not a forecast test and these scores do not describe performance on a future season.</p>}{report.evaluation.validation.groupOverlap.length > 0 && <p className="warning-text">Rows sharing {report.evaluation.validation.groupOverlap.map((item) => item.column).join(', ')} appear in both partitions, so these scores do not establish performance on unseen entities. Choose a grouped split to evaluate that question.</p>}</div>
            {selectedModel && <article className="best-model"><div><h3>Best performing model</h3><strong className="best-model-name">{selectedModel.label}</strong><p>{selectedModel.label} recorded the lowest cross-validated RMSE of the compared models. This selection is computed from the returned metrics, not hardcoded.</p></div><dl><div><dt>R²</dt><dd>{formatNumber(selectedModel.r2)}</dd></div><div><dt>MAE</dt><dd>{formatNumber(selectedModel.mae)}</dd></div><div><dt>RMSE</dt><dd>{formatNumber(selectedModel.rmse)}</dd></div></dl><p className="model-configuration"><strong>Fixed hyperparameters:</strong> {selectedModel.parameters.join(', ')}</p><p className="field-help">These are constants set by CropCast, not values chosen by a search.</p></article>}
          </ReportSection>

          <ReportSection id="prediction" title="Predict a new record">
            <p className="section-intro">Your upload is the historical training data. Enter the known inputs for one new observation and the model estimates <strong>{report.dataset.target}</strong>. Keep inputs within the conditions represented in your data.</p>
            {report.source === 'uploaded' && columns.length > 0 ? <div className="field-prediction">
              <div className="prediction-context"><strong>{selectedModel?.label ?? 'Selected model'} · {featureColumnIds.length} inputs</strong><span>Same features and validation strategy as the report. The prediction model is refitted on all usable labelled rows.</span></div>
              {!report.evaluation.beatsBaseline && <p className="warning-text">The selected model did not beat the mean baseline by the required margin. Treat this prediction as exploratory, not reliable advice.</p>}
              <div className="prediction-input-actions"><button className="button button-secondary" type="button" disabled={!hasTypicalInputs || Boolean(validationControls?.pending)} onClick={() => replaceInputs(typicalInputs ?? {})}>Fill typical inputs</button><button className="text-button" type="button" onClick={() => replaceInputs({})}>Clear inputs</button><p className="field-help">Typical inputs are medians and most common categories from your upload, not a new test record.</p></div>
              <PredictionForm configurationLocked columns={columns} targetColumnId={targetColumnId} featureColumnIds={featureColumnIds} inputRecord={inputRecord} errors={errors} onInputChange={changeInput} />
              <button className="button button-primary prediction-submit" type="button" disabled={predictionStatus === 'processing' || Boolean(validationControls?.pending)} onClick={() => void submitPrediction()}>{predictionStatus === 'processing' ? 'Predicting…' : 'Predict new record'}</button>
              <PredictionResult status={predictionStatus} result={prediction} message={predictionMessage} targetLabel={columns.find((column) => column.id === targetColumnId)?.label} onRetry={() => void submitPrediction()} />
              {prediction && <ExplanationPanel status={fieldExplanation.status} requested={fieldExplanation.requested} text={fieldExplanation.text} message={fieldExplanation.message} language={language} onExplain={() => void requestFieldExplanation()} />}
            </div> : <p className="stage-locked">This demo replays a saved analysis. Upload the sample CSV to train models and predict your own record.</p>}
            <details className="typical-example"><summary>Example prediction using typical inputs: {formatNumber(report.prediction.value)} {unitLabel(report.prediction.unit, report.prediction.unitInferred)}</summary>
              <p className="field-help">This example combines median numeric inputs and the most common categories. It is not the dataset average and may not correspond to any actual row.</p>
              {typicalInputs && <dl className="typical-input-values">{Object.entries(typicalInputs).map(([id, value]) => <div key={id}><dt>{id}</dt><dd>{String(value ?? 'Missing')}</dd></div>)}</dl>}
              <div className="prediction-summary"><div><p>Example prediction using typical inputs</p><strong>{formatNumber(report.prediction.value)}{report.prediction.unit && <small>{unitLabel(report.prediction.unit, report.prediction.unitInferred)}</small>}</strong>{report.prediction.interval && <span>RMSE-based error band {formatNumber(report.prediction.interval.lower)} – {formatNumber(report.prediction.interval.upper)}{report.prediction.unit ? ` ${report.prediction.unit}` : ''}</span>}<span>Generated with {selectedModel?.label ?? 'the selected model'}</span></div><p>An illustrative input profile, not a forecast for a specific farm.</p></div>
              {report.prediction.interval && <p className="field-help">Error-band basis: {report.prediction.interval.method}</p>}
            </details>
            <div style={{ marginTop: '1.25rem' }}>
              <WebsitePredictionPanel report={report} />
              <p className="field-help" style={{ marginTop: '.5rem' }}>Website-style prediction panel — same live backend, clean card layout inspired by poster panel 3.</p>
            </div>
          </ReportSection>

          <ReportSection id="evidence" title="Model testing evidence">
            <p className="section-intro">These are historical records held aside for a diagnostic comparison: actual is the known answer, predicted is the model estimate, and residual is actual minus predicted. They are not newly created rows or your manual prediction.</p>
            <p className="evaluation-caution">This holdout overlaps model-selection cross-validation; it is not an independent final test.</p>
            <p className="chart-summary">The holdout contains {report.prediction.evidenceTotal.toLocaleString()} rows. {report.prediction.evidenceShown < report.prediction.evidenceTotal ? `The API returned an evenly spaced sample of ${report.prediction.evidenceShown.toLocaleString()}.` : 'The API returned all holdout comparisons.'} CSV export includes all returned comparisons.</p>
            <div className="evidence-toolbar"><p>Showing {evidencePairs.length} of {report.prediction.actualVsPredicted.length.toLocaleString()} returned test records. Metrics use the full evaluated sets, not just this preview.</p>{report.prediction.actualVsPredicted.length > 10 && <button className="button button-secondary" type="button" aria-expanded={showAllEvidence} onClick={() => setShowAllEvidence(!showAllEvidence)}>{showAllEvidence ? 'Show fewer records' : `Show all ${report.prediction.actualVsPredicted.length.toLocaleString()} returned records`}</button>}</div>
            <div className="analysis-visual-grid"><article><h3>Actual vs predicted</h3><div className="chart-legend"><span>Actual</span><span>Predicted</span></div><PairedValues pairs={evidencePairs} /></article><article><h3>Residual analysis</h3><p className="chart-summary">Positive means the model underestimated; negative means it overestimated. Bar length is error magnitude.</p><DataBars signed values={evidencePairs.map((pair, index) => ({ label: `Test record ${index + 1}`, value: pair.residual }))} /></article></div>
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

          <ReportSection id="insights" title="What drove the estimate">
            <p className="section-intro"><strong>{ATTRIBUTION_TITLES[report.insightsMethod]}.</strong> {report.insightsNote}</p><DataBars signed={report.insightsMethod === 'standardized-coefficients'} values={report.insights.map(({ feature, coefficient }) => ({ label: feature, value: coefficient }))} /><ul className="insight-list">{report.insights.map((insight) => <li key={insight.feature}><strong>{insight.feature}</strong><p>{insight.interpretation}</p></li>)}</ul>
            <div style={{ marginTop: '1.5rem' }}>
              <InsightsPanel report={report} />
              <p className="field-help" style={{ marginTop: '.5rem' }}>Poster panel 5 as live web cards — same attribution data, poster values only as placeholder when no report.</p>
            </div>
          </ReportSection>

          <ReportSection id="explanation" title="Automated summary">
            <div className="explanation-toolbar"><LanguageSelector value={language} loading={false} onChange={(next) => { window.speechSynthesis?.cancel(); setVoiceStatus('idle'); clearFieldExplanation(); setLanguage(next) }} />{report.source === 'demo' && <span className="status-tag demo-tag">Demo explanation</span>}</div>
            {explanation ? <div className="analysis-explanation"><p lang={language}>{explanation}</p><VoiceControls text={explanation} language={language} status={voiceStatus} message={voiceMessage} onStatusChange={(status, message) => { setVoiceStatus(status); setVoiceMessage(message) }} /></div> : <div className="inline-alert" role="alert">An explanation in this language was not returned. Select another language or retry when the explanation service is available.</div>}
            <div className="limitations"><h3>Limitations and caveats</h3><ul>{report.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul></div>
          </ReportSection>

          <VisualAnalyticsSection report={report} />
        </div>
      </div>
    </div>
  )
}
