import { requestJson, ServiceError } from './predictionService'
import type { AnalysisReport, AnalysisStartResponse } from '../types/analysis'

export async function analyzeDataset(file: File, signal?: AbortSignal): Promise<AnalysisStartResponse> {
  const body = new FormData()
  body.append('file', file)
  const report = await requestJson<AnalysisStartResponse>('/dataset/analyze', { method: 'POST', body, signal })
  if ('status' in report) {
    if (report.status === 'needs-target' && report.analysisId && report.candidates.length > 1) return report
    throw new ServiceError('The analysis response contains an invalid target-selection request.', 'response')
  }
  if (!report.analysisId || !report.dataset || !Array.isArray(report.models) || !report.prediction) {
    throw new ServiceError('The analysis response is missing required report data.', 'response')
  }
  return report
}

export async function resumeAnalysis(analysisId: string, target: string, signal?: AbortSignal): Promise<AnalysisReport> {
  const report = await requestJson<AnalysisReport>('/analysis/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysisId, target }), signal })
  if (!report.analysisId || !report.dataset || !Array.isArray(report.models) || !report.prediction) throw new ServiceError('The analysis response is missing required report data.', 'response')
  return report
}
