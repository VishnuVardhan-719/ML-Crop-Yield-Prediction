import type { z } from 'zod'
import type { DatasetSummaryData, PredictionRequest, PredictionResponse } from '../types/cropcast'
import { datasetSummarySchema, predictionResponseSchema } from '../schemas/api'

type ServiceErrorCode = 'configuration' | 'network' | 'response' | 'timeout'

/** A hung backend used to leave the interface spinning forever.
 *
 * The deadline must clear the engine's real large-dataset budget, not just the sample: a 20k-row
 * file takes roughly two minutes with the adaptive forest (see README "Performance"), so this
 * allows three before declaring the request dead. */
const REQUEST_TIMEOUT_MS = 180_000

export class ServiceError extends Error {
  readonly code: ServiceErrorCode

  constructor(message: string, code: ServiceErrorCode) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
  }
}

const getApiBaseUrl = () => {
  const value = import.meta.env.VITE_API_BASE_URL?.trim()
  if (!value) throw new ServiceError('CropCast API is not configured yet.', 'configuration')
  return value.replace(/\/$/, '')
}

/** Combine the caller's signal with a deadline, without depending on `AbortSignal.any`. */
function withDeadline(external: AbortSignal | undefined, milliseconds: number) {
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort(external?.reason)
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out.', 'TimeoutError')), milliseconds)
  if (external) {
    if (external.aborted) onExternalAbort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

/** FastAPI returns `{ "detail": "..." }`. Every one of those messages used to be thrown away. */
async function describeFailure(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string' && detail.trim()) return detail
      // Pydantic validation errors arrive as a list of objects.
      if (Array.isArray(detail) && detail.length && typeof detail[0]?.msg === 'string') return detail[0].msg
    }
  } catch {
    // A non-JSON body is not worth reporting over the status code itself.
  }
  return `The CropCast API rejected this request (${response.status}).`
}

function describeIssues(error: z.ZodError): string {
  const shown = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path} (${issue.message})` : issue.message
  })
  const extra = error.issues.length - shown.length
  return extra > 0 ? `${shown.join('; ')}; +${extra} more` : shown.join('; ')
}

/**
 * Validate a decoded body against its schema. A payload that only mostly matches is worse than an error:
 * it renders a half-empty report that looks authoritative.
 */
export function parseResponse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new ServiceError(
      `The CropCast API returned an unexpected response — ${describeIssues(result.error)}. The frontend and backend versions may disagree.`,
      'response',
    )
  }
  return result.data
}

export async function requestJson<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`
  const { signal, dispose } = withDeadline(init.signal ?? undefined, REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { ...init, signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      // The caller cancelled: propagate so callers can ignore it silently.
      throw error
    }
    if (init.signal?.aborted) throw error
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ServiceError('The CropCast API did not respond in time. Try a smaller dataset.', 'timeout')
    }
    throw new ServiceError('The CropCast API could not be reached. Check the connection and try again.', 'network')
  } finally {
    dispose()
  }

  if (!response.ok) throw new ServiceError(await describeFailure(response), 'response')

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ServiceError('The CropCast API returned an unreadable response.', 'response')
  }
  return parseResponse(schema, body)
}

export async function inspectDataset(file: File, signal?: AbortSignal): Promise<DatasetSummaryData> {
  const body = new FormData()
  body.append('file', file)
  return requestJson<DatasetSummaryData>('/datasets', { method: 'POST', body, signal }, datasetSummarySchema)
}

export async function runPrediction(request: PredictionRequest, signal?: AbortSignal): Promise<PredictionResponse> {
  return requestJson<PredictionResponse>(
    '/predictions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    },
    predictionResponseSchema,
  )
}
