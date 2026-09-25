import type { ExplanationResponse, Language, PredictionRequest, PredictionResponse } from '../types/cropcast'
import { demoDataset, demoExplanations, demoPrediction } from './demoData'

export async function getDemoDataset() {
  return structuredClone(demoDataset)
}

export async function getDemoPrediction(request: PredictionRequest): Promise<PredictionResponse> {
  return { ...structuredClone(demoPrediction), model: request.model, targetColumnId: request.targetColumnId }
}

export async function getDemoExplanation(predictionId: string, language: Language): Promise<ExplanationResponse> {
  return { ...structuredClone(demoExplanations[language]), predictionId }
}
