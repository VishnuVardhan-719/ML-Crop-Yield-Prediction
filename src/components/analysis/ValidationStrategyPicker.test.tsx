import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { demoAnalysisReport } from '../../demo/demoAnalysis'
import type { AnalysisReport, ValidationOption } from '../../types/analysis'
import type { ValidationStrategy } from '../../types/cropcast'
import { AnalysisDashboard } from './AnalysisDashboard'

const OPTIONS: ValidationOption[] = [
  { key: 'random', label: 'Random split', available: true, reason: '', note: 'Records can appear on both sides.' },
  { key: 'grouped', label: 'Grouped by field_id', available: true, reason: '', note: 'No field appears on both sides.' },
  { key: 'temporal', label: 'Temporal split', available: false, reason: 'CropCast found no date, season, or year column.', note: '' },
]

const withValidation = (
  overrides: Partial<AnalysisReport['evaluation']['validation']> = {},
): AnalysisReport => ({
  ...demoAnalysisReport,
  source: 'uploaded',
  evaluation: {
    ...demoAnalysisReport.evaluation,
    validation: { ...demoAnalysisReport.evaluation.validation, label: 'Random split', options: OPTIONS, ...overrides },
  },
})

/** The report also renders model radios, so every picker query is scoped to its own fieldset. */
const picker = () => within(screen.getByRole('group', { name: 'Choose the validation split' }))
const radio = (name: RegExp) => picker().getByRole('radio', { name }) as HTMLInputElement

const controls = (onChange: (strategy: ValidationStrategy) => void = vi.fn()) => ({ onChange })

describe('validation strategy switching', () => {
  it('re-runs the analysis with the strategy the user picks', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AnalysisDashboard report={withValidation()} validationControls={controls(onChange)} />)

    await user.click(radio(/Grouped by field_id/))

    expect(onChange).toHaveBeenCalledWith('grouped')
  })

  it('keeps an unusable strategy visible and disabled with its reason', () => {
    render(<AnalysisDashboard report={withValidation()} validationControls={controls()} />)

    expect(radio(/Temporal split/).disabled).toBe(true)
    expect(picker().getByText('CropCast found no date, season, or year column.')).toBeTruthy()
  })

  it('marks the strategy the report was actually scored under', () => {
    render(<AnalysisDashboard report={withValidation({ strategy: 'grouped', label: 'Grouped by field_id' })} validationControls={controls()} />)

    expect(radio(/Grouped by field_id/).checked).toBe(true)
    expect(radio(/Random split/).checked).toBe(false)
  })

  it('blocks further switches and says why while a re-run is in flight', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AnalysisDashboard report={withValidation()} validationControls={{ pending: 'grouped', onChange }} />)

    await user.click(radio(/Temporal split/))
    await user.click(radio(/Grouped by field_id/))

    // The fieldset itself is not inside its own scope, so query it from the document.
    const fieldset = screen.getByRole('group', { name: 'Choose the validation split' }) as HTMLFieldSetElement
    expect(fieldset.disabled).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toMatch(/Re-scoring every model with Grouped by field_id/)
  })

  it('reports a failed re-run instead of silently keeping the old scores', () => {
    render(<AnalysisDashboard report={withValidation()} validationControls={{ error: 'This dataset is no longer available. Upload it again.', onChange: vi.fn() }} />)

    expect(screen.getByRole('alert').textContent).toMatch(/no longer available/)
  })

  it('offers no switch for the recorded demo, and says so', () => {
    render(<AnalysisDashboard report={demoAnalysisReport} />)

    expect(screen.queryByRole('group', { name: 'Choose the validation split' })).toBeNull()
    expect(screen.getByText(/demo replays one recorded run/)).toBeTruthy()
  })

  it('does not warn about the temporal column when rows were ordered by it', () => {
    const temporal: Partial<AnalysisReport['evaluation']['validation']> = {
      strategy: 'temporal',
      label: 'Temporal, ordered by sowing_date',
      temporalColumn: 'sowing_date',
      groupOverlap: [],
    }

    render(<AnalysisDashboard report={withValidation(temporal)} validationControls={controls()} />)

    expect(screen.queryByText(/is not a forecast test/)).toBeNull()
  })
})
