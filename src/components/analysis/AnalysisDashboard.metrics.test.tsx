import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { demoAnalysisReport } from '../../demo/demoAnalysis'
import type { AnalysisReport } from '../../types/analysis'
import { AnalysisDashboard } from './AnalysisDashboard'

type ModelOverride = Partial<AnalysisReport['models'][number]>

const withModels = (overrides: ModelOverride[]): AnalysisReport => ({
  ...demoAnalysisReport,
  models: demoAnalysisReport.models.map((model, index) => ({ ...model, ...overrides[index] })),
})

describe('AnalysisDashboard metric rendering', () => {
  it('renders an undefined metric as missing instead of showing it as zero', () => {
    const report = withModels([{ r2: null, mae: null, rmse: null, holdoutRmse: null, selected: false }])

    render(<AnalysisDashboard report={report} />)

    const row = screen.getByRole('row', { name: /Ridge/ })
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(row).queryByText('0.00')).toBeNull()
  })

  it('marks the lowest cross-validated RMSE as the selected model and states the rule', () => {
    const report = withModels([
      { rmse: 0.9, selected: false },
      { rmse: 0.2, selected: true },
      { rmse: 0.5, selected: false },
      { rmse: 0.7, selected: false },
    ])

    render(<AnalysisDashboard report={report} />)

    expect(within(screen.getByRole('row', { name: /Lasso/ })).getByText('Selected')).toBeTruthy()
    expect(screen.getByText(report.evaluation.selectionRule)).toBeTruthy()
  })

  it('renders the mean baseline as its own table row', () => {
    render(<AnalysisDashboard report={demoAnalysisReport} />)

    const row = screen.getByRole('row', { name: /Baseline \(predict the mean\)/ })
    expect(within(row).getByText('Reference')).toBeTruthy()
    expect(screen.getByText(/reduces cross-validated RMSE by/)).toBeTruthy()
  })

  it('warns instead of crowning a winner when nothing beats the baseline', () => {
    const report: AnalysisReport = {
      ...demoAnalysisReport,
      evaluation: { ...demoAnalysisReport.evaluation, beatsBaseline: false, improvementOverBaseline: 0.01 },
    }

    render(<AnalysisDashboard report={report} />)

    expect(screen.getByRole('alert').textContent).toMatch(/No model beat the mean baseline/)
  })

  it('labels the estimate range as an RMSE-based error band instead of calibrated coverage', () => {
    render(<AnalysisDashboard report={demoAnalysisReport} />)

    expect(screen.getByText(/^RMSE-based error band 2\.53 – 4\.25 t\/ha$/)).toBeTruthy()
    expect(screen.queryByText(/95% interval/)).toBeNull()
    expect(screen.getByText(/Error-band basis:/)).toBeTruthy()
  })

  it('discloses how much of the holdout it is showing', () => {
    const report: AnalysisReport = {
      ...demoAnalysisReport,
      prediction: { ...demoAnalysisReport.prediction, evidenceShown: 12, evidenceTotal: 70 },
    }

    render(<AnalysisDashboard report={report} />)

    expect(screen.getByText(/Showing 12 of 70, evenly sampled across the holdout/)).toBeTruthy()
  })

  it('names the attribution method that actually produced the insights', () => {
    const permutation = render(<AnalysisDashboard report={{ ...demoAnalysisReport, insightsMethod: 'permutation-importance' }} />)
    expect(permutation.getByText('Permutation importance.')).toBeTruthy()
    permutation.unmount()

    render(<AnalysisDashboard report={{ ...demoAnalysisReport, insightsMethod: 'standardized-coefficients' }} />)
    expect(screen.getByText('Standardized coefficients.')).toBeTruthy()
  })

  it('surfaces detected validation risks instead of leaving them in the caveats only', () => {
    render(<AnalysisDashboard report={demoAnalysisReport} />)

    expect(screen.getByRole('heading', { name: 'Validation strategy' })).toBeTruthy()
    // The same finding appears in both the quality check and the validation summary; both are wanted.
    if (demoAnalysisReport.evaluation.validation.groupOverlap.length > 0) {
      expect(screen.getAllByText(/appear in both partitions/).length).toBeGreaterThan(1)
    }
    if (demoAnalysisReport.evaluation.validation.temporalColumn) {
      expect(screen.getByText(/is not a forecast test/)).toBeTruthy()
    }
  })

  it('labels an inferred unit and scales prediction bars to the data rather than a fixed axis', () => {
    const report: AnalysisReport = {
      ...demoAnalysisReport,
      prediction: {
        ...demoAnalysisReport.prediction,
        unit: 't/ha',
        unitInferred: true,
        actualVsPredicted: [
          { actual: 1200, predicted: 1150, residual: 50 },
          { actual: 900, predicted: 940, residual: -40 },
        ],
      },
    }

    const { container } = render(<AnalysisDashboard report={report} />)

    expect(screen.getAllByText(/t\/ha \(inferred\)/).length).toBeGreaterThan(0)
    const bars = container.querySelectorAll('.paired-values i')
    // 1200 is the largest magnitude present, so it must own the full-width bar.
    expect((bars[0] as HTMLElement).style.width).toBe('100%')
    expect((bars[1] as HTMLElement).style.width).toBe('75%')
  })

  it('describes hyperparameters as fixed rather than searched', () => {
    render(<AnalysisDashboard report={demoAnalysisReport} />)

    expect(screen.getByText(/Fixed hyperparameters:/)).toBeTruthy()
    expect(screen.queryByText(/Selected parameters:/)).toBeNull()
  })
})
