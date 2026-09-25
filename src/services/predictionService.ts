import type { DatasetSummaryData, PredictionRequest, PredictionResponse } from '../types/cropcast'

type ServiceErrorCode = 'configuration' | 'network' | 'response'

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

export async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ServiceError('The CropCast API could not be reached. Check the connection and try again.', 'network')
  }

  if (!response.ok) {
    throw new ServiceError(`The CropCast API rejected this request (${response.status}).`, 'response')
  }

  try {
    return await response.json() as T
  } catch {
    throw new ServiceError('The CropCast API returned an unreadable response.', 'response')
  }
}

export async function inspectDataset(file: File, signal?: AbortSignal): Promise<DatasetSummaryData> {
  const body = new FormData()
  body.append('file', file)
  const data = await requestJson<DatasetSummaryData>('/datasets', { method: 'POST', body, signal })
  if (!data.datasetId || !Array.isArray(data.columns) || typeof data.columnCount !== 'number') {
    throw new ServiceError('The dataset response is missing required structure information.', 'response')
  }
  return data
}

export async function runPrediction(request: PredictionRequest, signal?: AbortSignal): Promise<PredictionResponse> {
  const data = await requestJson<PredictionResponse>('/predictions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })
  if (!data.predictionId || !data.targetColumnId || !data.model || !Object.hasOwn(data, 'value')) {
    throw new ServiceError('The prediction response is missing required output.', 'response')
  }
  return data
}
