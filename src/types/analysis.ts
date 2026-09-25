import type { ColumnDescriptor, Language, ModelKind } from './cropcast'

export type AnalysisStageStatus = 'complete' | 'active' | 'pending' | 'error'
export type QualityStatus = 'good' | 'warning' | 'review'

export type AnalysisStage = {
  id: string
  label: string
  status: AnalysisStageStatus
  detail?: string
}

export type QualityCheck = {
  label: string
  status: QualityStatus
  value: string
  detail: string
}

export type ModelEvaluation = {
  model: ModelKind
  label: string
  r2: number
  mae: number
  rmse: number
  selected: boolean
  parameters: string[]
  crossValidation: string
}

export type AnalysisReport = {
  analysisId: string
  source: 'uploaded' | 'demo'
  inputColumns?: ColumnDescriptor[]
  dataset: {
    fileName: string
    fileSize: number
    fileType: string
    detectedFiles: string[]
    rows: number
    columns: number
    numericFeatures: number
    categoricalFeatures: number
    target: string
  }
  quality: QualityCheck[]
  profile: {
    targetSummary: Array<{ label: string; value: number }>
    correlations: Array<{ feature: string; value: number }>
    numericSummary: Array<{ feature: string; mean: number; median: number; min: number; max: number; standardDeviation: number }>
    categoricalSummary: Array<{ feature: string; uniqueValues: number; topCategories: Array<{ label: string; count: number }> }>
  }
  preprocessing: Array<{ label: string; detail: string }>
  models: ModelEvaluation[]
  prediction: {
    label: string
    value: number
    unit?: string
    actualVsPredicted: Array<{ actual: number; predicted: number }>
    residuals: number[]
  }
  insights: Array<{ feature: string; coefficient: number; interpretation: string }>
  explanations: Partial<Record<Language, string>>
  caveats: string[]
}

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'processing'; fileName: string; fileSize: number; fileType: string; source: 'uploaded' | 'demo'; stages: AnalysisStage[] }
  | { status: 'needs-target'; fileName: string; fileSize: number; fileType: string; analysisId: string; candidates: string[] }
  | { status: 'complete'; report: AnalysisReport }
  | { status: 'error'; message: string }

export type AnalysisStartResponse = AnalysisReport | { status: 'needs-target'; analysisId: string; fileName: string; candidates: string[] }
