import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { parseResponse, requestJson, ServiceError } from './predictionService'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** These cases all fail before a body is decoded, so the schema is never reached. */
const anySchema = z.unknown()

const mockResponse = (body: unknown, status: number, asJson = true) =>
  new Response(asJson ? JSON.stringify(body) : String(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('requestJson failure handling', () => {
  it('surfaces the detail message the backend actually sent', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ detail: 'The dataset must be 10 MB or smaller.' }, 413)))

    await expect(requestJson('/dataset/analyze', { method: 'POST' }, anySchema)).rejects.toEqual(
      new ServiceError('The dataset must be 10 MB or smaller.', 'response'),
    )
  })

  it('surfaces a pydantic validation detail instead of a bare status code', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ detail: [{ msg: 'Input should be a valid number' }] }, 422)))

    await expect(requestJson('/predictions', { method: 'POST' }, anySchema)).rejects.toEqual(
      new ServiceError('Input should be a valid number', 'response'),
    )
  })

  it('falls back to the status code when the error body is not JSON', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>gateway</html>', { status: 502 })))

    await expect(requestJson('/health', { method: 'GET' }, anySchema)).rejects.toEqual(
      new ServiceError('The CropCast API rejected this request (502).', 'response'),
    )
  })

  it('reports an unreachable API rather than hanging', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(requestJson('/health', { method: 'GET' }, anySchema)).rejects.toEqual(
      new ServiceError('The CropCast API could not be reached. Check the connection and try again.', 'network'),
    )
  })

  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Request timed out.', 'TimeoutError')))
    })))

    const pending = requestJson('/dataset/analyze', { method: 'POST' }, anySchema)
    const assertion = expect(pending).rejects.toEqual(
      new ServiceError('The CropCast API did not respond in time. Try a smaller dataset.', 'timeout'),
    )
    await vi.advanceTimersByTimeAsync(180_000)
    await assertion
  })

  it('propagates a caller abort so callers can ignore it silently', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const controller = new AbortController()

    const pending = requestJson('/dataset/analyze', { method: 'POST', signal: controller.signal }, anySchema)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('still fails clearly when the API base URL is unset', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')

    await expect(requestJson('/health', { method: 'GET' }, anySchema)).rejects.toEqual(
      new ServiceError('CropCast API is not configured yet.', 'configuration'),
    )
  })
})

describe('response validation', () => {
  it('rejects a payload that is missing a required field and names its path', () => {
    const schema = z.object({ datasetId: z.string(), columnCount: z.number() })

    expect(() => parseResponse(schema, { datasetId: 'd-1' })).toThrow(
      new ServiceError('The CropCast API returned an unexpected response — columnCount (Invalid input: expected number, received undefined). The frontend and backend versions may disagree.', 'response'),
    )
  })

  it('rejects a field whose type changed', () => {
    const schema = z.object({ rows: z.number() })

    expect(() => parseResponse(schema, { rows: '288' })).toThrow(/rows \(Invalid input: expected number, received string\)/)
  })

  it('accepts a payload that matches the contract', () => {
    const schema = z.object({ datasetId: z.string(), columnCount: z.number() })

    expect(parseResponse(schema, { datasetId: 'd-1', columnCount: 12 })).toEqual({ datasetId: 'd-1', columnCount: 12 })
  })

  it('summarises the issue list rather than dumping every field', () => {
    const schema = z.object({ a: z.number(), b: z.number(), c: z.number(), d: z.number() })

    expect(() => parseResponse(schema, {})).toThrow(/\+1 more/)
  })
})
