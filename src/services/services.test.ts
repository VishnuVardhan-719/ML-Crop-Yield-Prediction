import { afterEach, describe, expect, it, vi } from 'vitest'
import { explainPrediction } from './explanationService'
import { inspectDataset, runPrediction, ServiceError } from './predictionService'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('predictionService', () => {
  it('fails clearly when the API base URL is not configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    await expect(inspectDataset(new File(['a,b'], 'data.csv', { type: 'text/csv' }))).rejects.toEqual(
      new ServiceError('CropCast API is not configured yet.', 'configuration'),
    )
  })

  it('uploads a dataset as multipart form data', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      datasetId: 'data-1',
      fileName: 'data.csv',
      columnCount: 1,
      columns: [{ id: 'value', label: 'Value', dataType: 'number', nullable: false, eligibleAsTarget: true, eligibleAsFeature: true }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['value\n1'], 'data.csv', { type: 'text/csv' })
    const result = await inspectDataset(file)

    expect(result.datasetId).toBe('data-1')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/datasets')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBe(file)
  })

  it('sends only the typed prediction payload', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    const response = { predictionId: 'p-1', targetColumnId: 'yield', value: 4, model: 'ridge' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const request = { datasetId: 'd-1', targetColumnId: 'yield', featureColumnIds: ['rain'], model: 'ridge' as const, inputRecord: { rain: 20 } }

    await expect(runPrediction(request)).resolves.toEqual(response)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual(request)
  })
})

describe('explanationService', () => {
  it('posts the prediction id and selected language', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    const response = { predictionId: 'p-1', language: 'te', text: 'వివరణ' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(explainPrediction('p-1', 'te')).resolves.toEqual(response)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/explanations')
    expect(JSON.parse(String(init.body))).toEqual({ predictionId: 'p-1', language: 'te' })
  })
})
