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
  it('submits a specific field record with the selected model', async () => {
    const user = userEvent.setup()
    predictionService.runPrediction.mockResolvedValue({ predictionId: 'prediction-1', targetColumnId: 'yield', value: 5.2, unit: 't/ha', model: 'ridge' })
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

    expect(predictionService.runPrediction).toHaveBeenCalledWith({
      datasetId: 'dataset-1',
      targetColumnId: 'yield',
      featureColumnIds: ['rainfall', 'soil'],
      model: 'ridge',
      inputRecord: { rainfall: 950, soil: 'loam' },
    }, expect.any(AbortSignal))
    expect(await screen.findByRole('heading', { name: 'Prediction result' })).toBeTruthy()
    expect(screen.getByText('5.2')).toBeTruthy()
  })
})