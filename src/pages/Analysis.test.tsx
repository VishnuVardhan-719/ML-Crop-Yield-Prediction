import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { demoAnalysisReport } from '../demo/demoAnalysis'
import { Analysis } from './Analysis'

const service = vi.hoisted(() => ({ analyzeDataset: vi.fn(), resumeAnalysis: vi.fn() }))
vi.mock('../services/analysisService', () => service)

describe('Analysis ambiguity handling', () => {
  beforeEach(() => {
    service.analyzeDataset.mockReset()
    service.resumeAnalysis.mockReset()
  })

  it('asks only when multiple targets matter and resumes the analysis', async () => {
    const user = userEvent.setup()
    service.analyzeDataset.mockResolvedValue({ status: 'needs-target', analysisId: 'analysis-1', fileName: 'field.xlsx', candidates: ['Yield', 'Production'] })
    service.resumeAnalysis.mockResolvedValue({ ...demoAnalysisReport, source: 'uploaded', dataset: { ...demoAnalysisReport.dataset, fileName: 'field.xlsx' } })
    render(<MemoryRouter><Analysis /></MemoryRouter>)

    await user.upload(screen.getByLabelText('Choose dataset file'), new File(['a'], 'field.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    expect(await screen.findByRole('heading', { name: 'CropCast found multiple possible target variables.' })).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Prediction target'), 'Yield')
    await user.click(screen.getByRole('button', { name: 'Continue analysis' }))

    // A target answered by hand still starts on the default split.
    expect(service.resumeAnalysis).toHaveBeenCalledWith('analysis-1', 'Yield', 'random', expect.any(AbortSignal))
    expect(await screen.findByRole('heading', { name: 'Dataset overview' })).toBeTruthy()
    expect(screen.queryByText('Demo analysis')).toBeNull()
  })

  it('re-scores the visible report when the user picks another validation split', async () => {
    const user = userEvent.setup()
    service.analyzeDataset.mockResolvedValue({ status: 'needs-target', analysisId: 'analysis-1', fileName: 'field.xlsx', candidates: ['Yield', 'Production'] })
    service.resumeAnalysis.mockResolvedValue({ ...demoAnalysisReport, source: 'uploaded' })
    render(<MemoryRouter><Analysis /></MemoryRouter>)

    await user.upload(screen.getByLabelText('Choose dataset file'), new File(['a'], 'field.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    await screen.findByRole('heading', { name: 'CropCast found multiple possible target variables.' })
    await user.selectOptions(screen.getByLabelText('Prediction target'), 'Yield')
    await user.click(screen.getByRole('button', { name: 'Continue analysis' }))
    await screen.findByRole('heading', { name: 'Dataset overview' })
    service.resumeAnalysis.mockClear()

    const picker = screen.getByRole('group', { name: 'Choose the validation split' })
    await user.click(within(picker).getByRole('radio', { name: /Grouped by field_id/ }))

    expect(service.resumeAnalysis).toHaveBeenCalledWith('demo-analysis-001', 'yield_t_ha', 'grouped', expect.any(AbortSignal))
  })

  it('shows selected file metadata while backend analysis is pending', async () => {
    const user = userEvent.setup()
    service.analyzeDataset.mockReturnValue(new Promise(() => undefined))
    render(<MemoryRouter><Analysis /></MemoryRouter>)

    await user.upload(screen.getByLabelText('Choose dataset file'), new File(['a'], 'field.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    expect(await screen.findByRole('heading', { name: 'Analyzing field.xlsx' })).toBeTruthy()
    expect(screen.getByText('1 B')).toBeTruthy()
    expect(screen.getByText('XLSX')).toBeTruthy()
  })
})
