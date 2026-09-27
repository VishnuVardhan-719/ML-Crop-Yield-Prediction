import type { ColumnDescriptor, Language, ModelKind, PredictionInterval, ValidationStrategy } from './cropcast'

export type QualityStatus = 'good' | 'warning' | 'review'

export type QualityCheck = {
  label: string
  status: QualityStatus
  value: string
  detail: string
}

/** Every metric is nullable: the API reports `null` rather than 0 when a statistic is undefined. */
export type ModelEvaluation = {
  model: ModelKind
  label: string
  r2: number | null
  mae: number | null
  rmse: number | null
  selected: boolean
  parameters: string[]
  crossValidation: string
  holdoutR2: number | null
  holdoutMae: number | null
  holdoutRmse: number | null
}

/** The mean-prediction reference every candidate has to beat to count as skilful. */
export type BaselineEvaluation = {
  label: string
  strategy: string
  r2: number | null
  mae: number | null
  rmse: number | null
  crossValidation: string
  holdoutR2: number | null
  holdoutMae: number | null
  holdoutRmse: number | null
}

export type GroupOverlap = {
  column: string
  sharedValues: number
  distinctValues: number
  testRowsAffected: number
}

/** One strategy the user may pick, plus why an unavailable one cannot be used here. */
export type ValidationOption = {
  key: ValidationStrategy
  label: string
  available: boolean
  reason: string
  note: string
}

export type ValidationSummary = {
  strategy: ValidationStrategy
  label: string
  temporalColumn: string | null
  groupOverlap: GroupOverlap[]
  note: string
  options: ValidationOption[]
}

export type AnalysisEvaluation = {
  selectionRule: string
  holdoutSummary: string
  note: string
  baseline: BaselineEvaluation
  beatsBaseline: boolean
  improvementOverBaseline: number | null
  minimumMargin: number
  validation: ValidationSummary
}

export type ActualVsPredicted = {
  actual: number | null
  predicted: number | null
  residual: number | null
}

/** Which attribution method produced `insights`. The two are not interchangeable. */
export type InsightsMethod = 'standardized-coefficients' | 'permutation-importance'

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
    correlations: Array<{ feature: string; value: number | null }>
    numericSummary: Array<{ feature: string; mean: number | null; median: number | null; min: number | null; max: number | null; standardDeviation: number | null }>
    categoricalSummary: Array<{ feature: string; uniqueValues: number; topCategories: Array<{ label: string; count: number }> }>
  }
  preprocessing: Array<{ label: string; detail: string }>
  evaluation: AnalysisEvaluation
  models: ModelEvaluation[]
  prediction: {
    label: string
    value: number
    unit?: string
    unitInferred?: boolean
    interval: PredictionInterval | null
    evidenceShown: number
    evidenceTotal: number
    actualVsPredicted: ActualVsPredicted[]
    residuals: Array<number | null>
  }
  insights: Array<{ feature: string; coefficient: number | null; interpretation: string }>
  insightsMethod: InsightsMethod
  insightsNote: string
  explanations: Partial<Record<Language, string>>
  caveats: string[]
}

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'processing'; fileName: string; fileSize: number; fileType: string; source: 'uploaded' | 'demo' }
  | { status: 'needs-target'; fileName: string; fileSize: number; fileType: string; analysisId: string; candidates: string[] }
  | { status: 'complete'; report: AnalysisReport }
  | { status: 'error'; message: string }

export type AnalysisStartResponse = AnalysisReport | { status: 'needs-target'; analysisId: string; fileName: string; candidates: string[] }
