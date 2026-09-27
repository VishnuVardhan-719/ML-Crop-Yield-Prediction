import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnalysisDashboard } from '../components/analysis/AnalysisDashboard'
import { AnalysisProgress } from '../components/analysis/AnalysisProgress'
import { FileDropzone } from '../components/dataset/FileDropzone'
import { runDemoAnalysis } from '../demo/demoAnalysis'
import { analyzeDataset, resumeAnalysis } from '../services/analysisService'
import { ServiceError } from '../services/predictionService'
import type { AnalysisState } from '../types/analysis'
import type { ValidationStrategy } from '../types/cropcast'

type NavigationState = { file?: File; demo?: boolean }

const errorMessage = (error: unknown) => error instanceof ServiceError || error instanceof Error
  ? error.message
  : 'CropCast could not analyze this dataset. Check the file and try again.'

export function Analysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' })
  const [target, setTarget] = useState('')
  const [validationPending, setValidationPending] = useState<ValidationStrategy>()
  const [validationError, setValidationError] = useState<string>()
  const location = useLocation()
  const navigate = useNavigate()
  const abortRef = useRef<AbortController | null>(null)
  const handoffHandled = useRef(false)

  const runFile = async (file: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    const fileType = file.name.split('.').pop()?.toUpperCase() ?? 'FILE'
    abortRef.current = controller
    setState({ status: 'processing', fileName: file.name, fileSize: file.size, fileType, source: 'uploaded' })
    try {
      const response = await analyzeDataset(file, controller.signal)
      if (controller.signal.aborted) return
      if ('status' in response) setState({ ...response, fileSize: file.size, fileType })
      else setState({ status: 'complete', report: response })
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: 'error', message: errorMessage(error) })
    }
  }

  const runDemo = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    // The demo reads a static fixture, so it resolves immediately and reports the fixture's own metadata.
    const report = await runDemoAnalysis()
    if (!controller.signal.aborted) {
      setState({ status: 'processing', fileName: report.dataset.fileName, fileSize: report.dataset.fileSize, fileType: report.dataset.fileType, source: 'demo' })
      setState({ status: 'complete', report })
    }
  }

  const continueWithTarget = async () => {
    if (state.status !== 'needs-target' || !target) return
    const controller = new AbortController()
    const pending = state
    abortRef.current = controller
    setState({ status: 'processing', fileName: state.fileName, fileSize: state.fileSize, fileType: state.fileType, source: 'uploaded' })
    try {
      const report = await resumeAnalysis(pending.analysisId, target, 'random', controller.signal)
      if (!controller.signal.aborted) setState({ status: 'complete', report })
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: 'error', message: errorMessage(error) })
    }
  }

  /** Re-score every model under another split, keeping the current report visible until it lands. */
  const changeValidation = async (strategy: ValidationStrategy) => {
    if (state.status !== 'complete') return
    const { analysisId } = state.report
    const { target: analysisTarget } = state.report.dataset
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setValidationError(undefined)
    setValidationPending(strategy)
    try {
      const report = await resumeAnalysis(analysisId, analysisTarget, strategy, controller.signal)
      if (!controller.signal.aborted) setState({ status: 'complete', report })
    } catch (error) {
      if (!controller.signal.aborted) setValidationError(errorMessage(error))
    } finally {
      if (!controller.signal.aborted) setValidationPending(undefined)
    }
  }

  useEffect(() => {
    if (handoffHandled.current) return
    handoffHandled.current = true
    const handoff = location.state as NavigationState | null
    if (!handoff) return
    queueMicrotask(() => {
      if (handoff.file) void runFile(handoff.file)
      else if (handoff.demo) void runDemo()
      void navigate('/analysis', { replace: true, state: null })
    })
  }, [location.state, navigate])

  useEffect(() => () => abortRef.current?.abort(), [])

  if (state.status === 'complete') {
    const report = state.report
    // A replayable fixture cannot be re-scored, so the demo gets no strategy control.
    const controls = report.source === 'demo'
      ? undefined
      : { pending: validationPending, error: validationError, onChange: (strategy: ValidationStrategy) => void changeValidation(strategy) }
    // Remount on a new strategy so a pending prediction or field record cannot outlive the scores it came from.
    return <AnalysisDashboard key={`${report.analysisId}:${report.evaluation.validation.strategy}`} report={report} validationControls={controls} />
  }

  return (
    <div className="analysis-page container">
      <header className="analysis-page-header">
        <p className="kicker">CropCast workspace</p>
        <h1>Automated agricultural analysis</h1>
        <p>Drop one supported dataset. CropCast will profile, validate, preprocess, compare four regression models, and assemble the returned evidence into one report.</p>
      </header>
      {state.status === 'processing' && (
        <AnalysisProgress fileName={state.fileName} fileSize={state.fileSize} fileType={state.fileType} source={state.source} />
      )}
      {state.status === 'needs-target' && (
        <section className="target-resolution" aria-labelledby="target-resolution-title">
          <p className="kicker">One decision required</p>
          <h2 id="target-resolution-title">CropCast found multiple possible target variables.</h2>
          <p>Select the value this analysis should predict. CropCast will automate the remaining pipeline.</p>
          <label className="field-block">Prediction target<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Choose a target</option>{state.candidates.map((candidate) => <option key={candidate}>{candidate}</option>)}</select></label>
          <button className="button button-primary" type="button" disabled={!target} onClick={() => void continueWithTarget()}>Continue analysis</button>
        </section>
      )}
      {(state.status === 'idle' || state.status === 'error') && (
        <section className="analysis-empty" aria-labelledby="analysis-empty-title">
          <div><p className="kicker">No dataset</p><h2 id="analysis-empty-title">Drop an agricultural dataset to begin.</h2><p>CSV, Excel, and ZIP packages are supported. CropCast asks for input only when the target cannot be identified safely.</p></div>
          <FileDropzone status={state.status === 'error' ? 'error' : 'idle'} message={state.status === 'error' ? state.message : undefined} onFile={(file) => void runFile(file)} onInvalid={(message) => setState({ status: 'error', message })} onDemo={() => void runDemo()} />
        </section>
      )}
    </div>
  )
}
