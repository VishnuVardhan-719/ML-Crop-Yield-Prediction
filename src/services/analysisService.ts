import { z } from 'zod'
import { analysisReportSchema, targetSelectionSchema } from '../schemas/api'
import type { AnalysisReport, AnalysisStartResponse } from '../types/analysis'
import type { ValidationStrategy } from '../types/cropcast'
import { parseResponse, requestJson } from './predictionService'

/**
 * `/dataset/analyze` answers with either a finished report or a request to pick a target column.
 * The two are told apart by the discriminant before parsing, so a broken report reports the exact
 * field that broke instead of collapsing into an opaque union error.
 */
const isTargetSelection = (body: unknown): boolean => typeof body === 'object' && body !== null && 'status' in body && body.status === 'needs-target'

export async function analyzeDataset(file: File, signal?: AbortSignal): Promise<AnalysisStartResponse> {
  const body = new FormData()
  body.append('file', file)
  const decoded = await requestJson<unknown>('/dataset/analyze', { method: 'POST', body, signal }, z.unknown())
  if (isTargetSelection(decoded)) return parseResponse(targetSelectionSchema, decoded)
  return parseResponse(analysisReportSchema, decoded)
}

/** Re-run the analysis with an explicit target and validation strategy. */
export async function resumeAnalysis(analysisId: string, target: string, validation: ValidationStrategy, signal?: AbortSignal): Promise<AnalysisReport> {
  const body = JSON.stringify({ analysisId, target, validation })
  return requestJson<AnalysisReport>('/analysis/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal }, analysisReportSchema)
}
