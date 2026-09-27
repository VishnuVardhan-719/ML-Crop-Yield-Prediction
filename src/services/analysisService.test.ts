import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoAnalysisReport } from '../demo/demoAnalysis'
import { analyzeDataset } from './analysisService'
import { ServiceError } from './predictionService'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const file = () => new File(['a,b'], 'field-trials.csv', { type: 'text/csv' })

const respondWith = (body: unknown, status = 200) => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })))
}

describe('analyzeDataset', () => {
  it('returns a target-selection request when the API asks for one', async () => {
    const selection = { status: 'needs-target', analysisId: 'd-1', fileName: 'field-trials.csv', candidates: ['yield_t_ha', 'production_t'] }
    respondWith(selection)

    await expect(analyzeDataset(file())).resolves.toEqual(selection)
  })

  it('returns a complete report when the API finishes in one pass', async () => {
    respondWith(demoAnalysisReport)

    await expect(analyzeDataset(file())).resolves.toEqual(demoAnalysisReport)
  })

  it('names the missing report field instead of failing generically', async () => {
    const broken = structuredClone(demoAnalysisReport) as unknown as Record<string, unknown>
    delete broken.insightsNote
    respondWith(broken)

    const failure = await analyzeDataset(file()).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ServiceError)
    expect((failure as ServiceError).code).toBe('response')
    expect((failure as ServiceError).message).toContain('insightsNote')
  })

  it('names the missing field in a malformed target-selection request', async () => {
    respondWith({ status: 'needs-target', analysisId: 'd-1', fileName: 'field-trials.csv' })

    await expect(analyzeDataset(file())).rejects.toThrow(/candidates/)
  })
})
