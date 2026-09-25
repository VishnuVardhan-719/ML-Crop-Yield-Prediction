import type { ExplanationResponse, Language } from '../types/cropcast'
import { requestJson, ServiceError } from './predictionService'

export async function explainPrediction(predictionId: string, language: Language, signal?: AbortSignal): Promise<ExplanationResponse> {
  const data = await requestJson<ExplanationResponse>('/explanations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ predictionId, language }),
    signal,
  })
  if (data.predictionId !== predictionId || data.language !== language || !data.text) {
    throw new ServiceError('The explanation response does not match this prediction.', 'response')
  }
  return data
}
