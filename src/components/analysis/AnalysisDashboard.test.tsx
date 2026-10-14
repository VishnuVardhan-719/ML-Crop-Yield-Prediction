import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { demoAnalysisReport } from '../../demo/demoAnalysis'
import { AnalysisDashboard } from './AnalysisDashboard'
import { Analysis } from '../../pages/Analysis'
import type { AnalysisReport } from '../../types/analysis'
import type { ExplanationResponse, PredictionResponse } from '../../types/cropcast'

const predictionService = vi.hoisted(() => ({ runPrediction: vi.fn() }))
vi.mock('../../services/predictionService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/predictionService')>(),
  runPrediction: predictionService.runPrediction,
}))
const explanationService = vi.hoisted(() => ({ explainPrediction: vi.fn() }))
vi.mock('../../services/explanationService', () => explanationService)
const analysisService = vi.hoisted(() => ({ analyzeDataset: vi.fn(), resumeAnalysis: vi.fn() }))
vi.mock('../../services/analysisService', () => analysisService)

const uploadedReport: AnalysisReport = {
  ...demoAnalysisReport,
  analysisId: 'dataset-1',
  source: 'uploaded',
  dataset: { ...demoAnalysisReport.dataset, target: 'yield' },
  inputColumns: [
    { id: 'yield', label: 'yield', dataType: 'number', nullable: false, eligibleAsTarget: true, eligibleAsFeature: false },
    { id: 'rainfall', label: 'rainfall', dataType: 'number', nullable: false, eligibleAsTarget: true, eligibleAsFeature: true },
  ],
}
const result: PredictionResponse = { predictionId: 'prediction-1', targetColumnId: 'yield', value: 5.2, model: 'ridge' }
const summary: ExplanationResponse = { predictionId: 'prediction-1', language: 'en', text: 'Old model summary' }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
async function predict() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('rainfall'), '950')
  await user.click(screen.getByRole('button', { name: 'Predict new record' }))
  return user
}

beforeEach(() => {
  predictionService.runPrediction.mockReset().mockResolvedValue(result)
  explanationService.explainPrediction.mockReset().mockResolvedValue(summary)
  analysisService.analyzeDataset.mockReset().mockResolvedValue(uploadedReport)
  analysisService.resumeAnalysis.mockReset()
})

describe('AnalysisDashboard field prediction', () => {
  it('keeps entered values through a parent validation re-score', async () => {
    const user = userEvent.setup()
    const rescored: AnalysisReport = { ...uploadedReport, evaluation: { ...uploadedReport.evaluation, validation: { ...uploadedReport.evaluation.validation, strategy: 'grouped' } } }
    analysisService.resumeAnalysis.mockResolvedValue(rescored)
    render(<MemoryRouter><Analysis /></MemoryRouter>)
    await user.upload(screen.getByLabelText('Choose dataset file'), new File(['a'], 'field.csv', { type: 'text/csv' }))
    await user.type(screen.getByLabelText('rainfall'), '950')
    await user.click(screen.getByRole('radio', { name: /Grouped by field_id/ }))
    expect((screen.getByLabelText('rainfall') as HTMLInputElement).value).toBe('950')
  })

  it('returns to upload and ignores a late validation response when starting another dataset', async () => {
    const user = userEvent.setup()
    const pending = deferred<AnalysisReport>()
    analysisService.resumeAnalysis.mockReturnValue(pending.promise)
    render(<MemoryRouter><Analysis /></MemoryRouter>)
    await user.upload(screen.getByLabelText('Choose dataset file'), new File(['a'], 'field.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('radio', { name: /Grouped by field_id/ }))
    const signal = analysisService.resumeAnalysis.mock.calls[0][3] as AbortSignal
    await user.click(screen.getByRole('button', { name: 'Upload another dataset' }))
    expect(signal.aborted).toBe(true)
    expect(screen.getByLabelText('Choose dataset file')).toBeTruthy()
    await act(async () => pending.resolve(uploadedReport))
    expect(screen.queryByRole('heading', { name: 'Dataset overview' })).toBeNull()
    await user.upload(screen.getByLabelText('Choose dataset file'), new File(['b'], 'next.csv', { type: 'text/csv' }))
    expect((screen.getByRole('button', { name: 'Predict new record' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByLabelText('rainfall') as HTMLInputElement).value).toBe('')
  })

  it('keeps the static demo read-only and labels the sampled download honestly', () => {
    render(<AnalysisDashboard report={demoAnalysisReport} />)
    expect(screen.queryByRole('button', { name: 'Predict new record' })).toBeNull()
    expect(screen.getByText(/This demo replays a saved analysis/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download test evidence' })).toBeTruthy()
  })

  it('ties the field target to the analyzed target even when candidate eligibility excludes it', () => {
    render(<AnalysisDashboard report={{ ...uploadedReport, inputColumns: uploadedReport.inputColumns!.map((column) => ({ ...column, eligibleAsTarget: column.id !== 'yield' })) }} />)
    const target = screen.getByLabelText('Target column') as HTMLInputElement
    expect(target.value).toBe('yield')
    expect(target.readOnly).toBe(true)
    expect(screen.getByText(/Changing the target requires a new analysis/)).toBeTruthy()
  })

  it.each(['input', 'clear'])('aborts a pending prediction when %s changes and ignores its late response', async (change) => {
    const pending = deferred<PredictionResponse>()
    predictionService.runPrediction.mockReturnValue(pending.promise)
    render(<AnalysisDashboard report={uploadedReport} />)
    const user = await predict()
    const signal = predictionService.runPrediction.mock.calls[0][1] as AbortSignal
    if (change === 'input') await user.clear(screen.getByLabelText('rainfall'))
    else await user.click(screen.getByRole('button', { name: 'Clear inputs' }))
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(result))
    expect(screen.queryByRole('heading', { name: 'Prediction result' })).toBeNull()
  })

  it.each(['input', 'clear', 'rerun'])('clears the old result and aborts its summary on %s', async (change) => {
    const pending = deferred<ExplanationResponse>()
    explanationService.explainPrediction.mockReturnValue(pending.promise)
    render(<AnalysisDashboard report={uploadedReport} />)
    const user = await predict()
    await user.click(screen.getByRole('button', { name: 'Explain result' }))
    const signal = explanationService.explainPrediction.mock.calls[0][2] as AbortSignal | undefined
    predictionService.runPrediction.mockReturnValue(new Promise(() => {}))
    if (change === 'input') await user.clear(screen.getByLabelText('rainfall'))
    else if (change === 'clear') await user.click(screen.getByRole('button', { name: 'Clear inputs' }))
    else await user.click(screen.getByRole('button', { name: 'Predict new record' }))
    expect(signal?.aborted).toBe(true)
    expect(screen.queryByText('AI explanation')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Explain result' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Prediction result' })).toBeNull()
    await act(async () => pending.resolve(summary))
    expect(screen.queryByText(summary.text)).toBeNull()
  })

  it.each(['success', 'failure'])('aborts summary on language change and ignores stale %s', async (outcome) => {
    const old = deferred<ExplanationResponse>()
    const current = deferred<ExplanationResponse>()
    explanationService.explainPrediction.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    render(<AnalysisDashboard report={uploadedReport} />)
    const user = await predict()
    await user.click(screen.getByRole('button', { name: 'Explain result' }))
    const signal = explanationService.explainPrediction.mock.calls[0][2] as AbortSignal | undefined
    await user.selectOptions(screen.getByLabelText('Explanation language'), 'hi')
    expect(signal?.aborted).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Explain result' }))
    await act(async () => current.resolve({ ...summary, language: 'hi', text: 'Current summary' }))
    expect(screen.getByText('Model summary')).toBeTruthy()
    expect(screen.getByText('Current summary').lang).toBe('hi')
    await act(async () => {
      if (outcome === 'success') old.resolve(summary)
      else old.reject(new Error('Stale failure'))
    })
    expect(screen.queryByText(summary.text)).toBeNull()
    expect(screen.queryByText('Stale failure')).toBeNull()
    expect(screen.getByText('Current summary')).toBeTruthy()
  })

  it('aborts prediction and summary on unmount', async () => {
    const pending = deferred<ExplanationResponse>()
    explanationService.explainPrediction.mockReturnValue(pending.promise)
    const view = render(<AnalysisDashboard report={uploadedReport} />)
    const user = await predict()
    await user.click(screen.getByRole('button', { name: 'Explain result' }))
    const signal = explanationService.explainPrediction.mock.calls[0][2] as AbortSignal | undefined
    view.unmount()
    expect(signal?.aborted).toBe(true)
    expect((predictionService.runPrediction.mock.calls[0][1] as AbortSignal).aborted).toBe(true)
    await act(async () => pending.resolve(summary))
  })

  it('disables prediction during validation re-score, aborts stale work and preserves field values', async () => {
    const pending = deferred<PredictionResponse>()
    predictionService.runPrediction.mockReturnValue(pending.promise)
    const onChange = vi.fn()
    const view = render(<AnalysisDashboard report={uploadedReport} validationControls={{ onChange }} />)
    const user = await predict()
    const signal = predictionService.runPrediction.mock.calls[0][1] as AbortSignal
    await act(async () => view.rerender(<AnalysisDashboard report={uploadedReport} validationControls={{ onChange, pending: 'grouped' }} />))
    expect((screen.getByRole('button', { name: 'Predict new record' }) as HTMLButtonElement).disabled).toBe(true)
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(result))
    const rescored = { ...uploadedReport, evaluation: { ...uploadedReport.evaluation, validation: { ...uploadedReport.evaluation.validation, strategy: 'grouped' as const } } }
    await act(async () => view.rerender(<AnalysisDashboard report={rescored} validationControls={{ onChange }} />))
    expect((screen.getByLabelText('rainfall') as HTMLInputElement).value).toBe('950')
    expect(screen.queryByRole('heading', { name: 'Prediction result' })).toBeNull()
    predictionService.runPrediction.mockResolvedValue(result)
    await user.click(screen.getByRole('button', { name: 'Predict new record' }))
    expect(predictionService.runPrediction.mock.calls[1][0].validation).toBe('grouped')
  })

  it('submits a specific field record and leaves the algorithm to the API', async () => {
    const user = userEvent.setup()
    predictionService.runPrediction.mockResolvedValue({
      predictionId: 'prediction-1',
      targetColumnId: 'yield',
      value: 5.2,
      unit: 't/ha',
      model: 'ridge',
      interval: { level: 0.95, lower: 4.8, upper: 5.6, halfWidth: 0.4, inSample: false, method: 'RMSE-based error band.' },
    })
    render(<AnalysisDashboard report={{
      ...demoAnalysisReport,
      analysisId: 'dataset-1',
      source: 'uploaded',
      dataset: { ...demoAnalysisReport.dataset, target: 'yield' },
      inputColumns: [
        { id: 'yield', label: 'yield', dataType: 'number', nullable: false, eligibleAsTarget: true, eligibleAsFeature: false },
        { id: 'rainfall', label: 'rainfall', dataType: 'number', nullable: false, eligibleAsTarget: false, eligibleAsFeature: true },
        { id: 'soil', label: 'soil', dataType: 'category', nullable: false, allowedValues: ['loam', 'clay'], eligibleAsTarget: false, eligibleAsFeature: true },
      ],
    }} />)

    await user.clear(screen.getByLabelText('rainfall'))
    await user.type(screen.getByLabelText('rainfall'), '950')
    await user.selectOptions(screen.getByLabelText('soil'), 'loam')
    await user.click(screen.getByRole('button', { name: 'Predict new record' }))

    const [payload, signal] = predictionService.runPrediction.mock.calls[0] as [Record<string, unknown>, AbortSignal]
    // No `model` key: naming one would override the best-validated choice the report already made.
    expect(payload).toEqual({
      datasetId: 'dataset-1',
      targetColumnId: 'yield',
      featureColumnIds: ['rainfall', 'soil'],
      inputRecord: { rainfall: 950, soil: 'loam' },
      // The interval must be based on the split the report was scored under.
      validation: demoAnalysisReport.evaluation.validation.strategy,
    })
    // The service passes a combined signal; asserting on the payload separately keeps realms out of it.
    expect(typeof signal.aborted).toBe('boolean')
    expect(await screen.findByRole('heading', { name: 'Prediction result' })).toBeTruthy()
    expect(screen.getByText('5.2')).toBeTruthy()
    expect(screen.getByText(/RMSE-based error band 4.8 – 5.6/)).toBeTruthy()
    expect(screen.getByText(/Same features and validation strategy as the report/)).toBeTruthy()
  })
})