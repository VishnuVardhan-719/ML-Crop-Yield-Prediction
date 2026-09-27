import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { demoAnalysisReport } from '../../demo/demoAnalysis'
import { AnalysisDashboard } from './AnalysisDashboard'

const predictionService = vi.hoisted(() => ({ runPrediction: vi.fn() }))
vi.mock('../../services/predictionService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/predictionService')>(),
  runPrediction: predictionService.runPrediction,
}))

describe('AnalysisDashboard field prediction', () => {
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
    await user.click(screen.getByRole('button', { name: 'Predict this field' }))

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
    expect(screen.getByText(/automatically compares the candidate models for the selected fields/)).toBeTruthy()
  })
})