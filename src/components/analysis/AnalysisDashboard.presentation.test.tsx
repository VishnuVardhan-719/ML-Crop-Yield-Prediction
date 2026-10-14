import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { demoAnalysisReport } from '../../demo/demoAnalysis'
import { AnalysisDashboard } from './AnalysisDashboard'
import type { AnalysisReport } from '../../types/analysis'

const report: AnalysisReport = {
  ...demoAnalysisReport,
  source: 'uploaded',
  prediction: Object.assign({}, demoAnalysisReport.prediction, { inputRecord: { rainfall: 820, soil: 'loam' } }),
  dataset: { ...demoAnalysisReport.dataset, target: 'yield' },
  inputColumns: [
    { id: 'yield', label: 'yield', dataType: 'number', nullable: false, eligibleAsTarget: true, eligibleAsFeature: false },
    { id: 'rainfall', label: 'rainfall', dataType: 'number', nullable: false, eligibleAsTarget: false, eligibleAsFeature: true },
    { id: 'soil', label: 'soil', dataType: 'category', nullable: false, allowedValues: ['loam', 'clay'], eligibleAsTarget: false, eligibleAsFeature: true },
  ],
}

describe('Presentation workflow', () => {
  it('keeps the target and model features fixed and places new-record prediction before testing evidence', () => {
    render(<AnalysisDashboard report={report} />)
    expect((screen.getByLabelText('Target column') as HTMLInputElement).readOnly).toBe(true)
    expect(screen.queryByRole('checkbox')).toBeNull()
    const prediction = screen.getByRole('heading', { name: 'Predict a new record' })
    const evidence = screen.getByRole('heading', { name: 'Model testing evidence' })
    expect(prediction.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/not the dataset average/)).toBeTruthy()
    expect(screen.getByText(/not an independent final test/)).toBeTruthy()
  })

  it('fills upload-derived typical inputs, then clears them without entering the target', async () => {
    const user = userEvent.setup()
    render(<AnalysisDashboard report={report} />)
    await user.click(screen.getByRole('button', { name: 'Fill typical inputs' }))
    expect((screen.getByLabelText('rainfall') as HTMLInputElement).value).toBe('820')
    expect((screen.getByLabelText('soil') as HTMLSelectElement).value).toBe('loam')
    expect((screen.getByLabelText('Target column') as HTMLInputElement).value).toBe('yield')
    await user.click(screen.getByRole('button', { name: 'Clear inputs' }))
    expect((screen.getByLabelText('rainfall') as HTMLInputElement).value).toBe('')
  })

  it('initially shows ten test records, expands returned evidence and can collapse it', async () => {
    const user = userEvent.setup()
    const pairs = Array.from({ length: 120 }, (_, index) => ({ actual: index + 1, predicted: index + 0.5, residual: 0.5 }))
    render(<AnalysisDashboard report={{ ...report, prediction: { ...report.prediction, evidenceShown: 120, evidenceTotal: 500, actualVsPredicted: pairs, residuals: pairs.map((pair) => pair.residual) } }} />)
    const evidence = screen.getByRole('region', { name: 'Model testing evidence' })
    expect(within(evidence).getAllByText(/^Test record \d+$/)).toHaveLength(20)
    expect(within(evidence).getByText(/Showing 10 of 120 returned test records/)).toBeTruthy()
    await user.click(within(evidence).getByRole('button', { name: 'Show all 120 returned records' }))
    expect(within(evidence).getAllByText(/^Test record \d+$/)).toHaveLength(240)
    await user.click(within(evidence).getByRole('button', { name: 'Show fewer records' }))
    expect(within(evidence).getAllByText(/^Test record \d+$/)).toHaveLength(20)
  })

  it('shows missing-input errors and focuses the first field without making a request', async () => {
    const user = userEvent.setup()
    render(<AnalysisDashboard report={report} onUploadAnother={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Predict new record' }))
    expect(screen.getAllByText('Enter a value for this field.')).toHaveLength(2)
    expect(document.activeElement).toBe(screen.getByLabelText('rainfall'))
  })
})