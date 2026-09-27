export type DatasetStatus = 'idle' | 'uploading' | 'loaded' | 'invalid' | 'error'
export type PredictionStatus = 'ready' | 'processing' | 'success' | 'error'
export type ExplanationStatus = 'loading' | 'success' | 'error'
export type VoiceStatus = 'idle' | 'playing' | 'paused' | 'stopped' | 'unavailable'
export type Language = 'en' | 'hi' | 'te'
export type ModelKind = 'ridge' | 'lasso' | 'elastic-net' | 'random-forest'
/** How rows are split for evaluation. The choice changes what the scores mean. */
export type ValidationStrategy = 'random' | 'grouped' | 'temporal'
export type Scalar = string | number | boolean | null
export type DataSource = 'uploaded' | 'demo'

export type ColumnDescriptor = {
  id: string
  label: string
  dataType: 'number' | 'integer' | 'category' | 'text' | 'boolean' | 'date' | 'unknown'
  nullable: boolean
  unit?: string
  unitInferred?: boolean
  allowedValues?: Scalar[]
  eligibleAsTarget: boolean
  eligibleAsFeature: boolean
}

export type DatasetSummaryData = {
  datasetId: string
  fileName: string
  rowCount?: number
  columnCount: number
  columns: ColumnDescriptor[]
}

export type PredictionRequest = {
  datasetId: string
  targetColumnId: string
  featureColumnIds: string[]
  /**
   * Omitted by the app on purpose: the analysis already ranked every candidate, so the API runs the
   * best-validated one. Send a value only to deliberately request a specific algorithm.
   */
  model?: ModelKind
  inputRecord: Record<string, Scalar>
  /** The validation strategy the error band should be based on. */
  validation?: ValidationStrategy
}

/** An RMSE-based error band around a point estimate, plus how it was derived. */
export type PredictionInterval = {
  /** Kept optional so the frontend can still read older recorded responses without claiming coverage. */
  level?: number
  lower: number
  upper: number
  halfWidth: number | null
  inSample?: boolean
  method: string
}

export type PredictionResponse = {
  predictionId: string
  targetColumnId: string
  value: number
  unit?: string
  unitInferred?: boolean
  model: ModelKind
  interval?: PredictionInterval
  notices?: string[]
}

export type ExplanationResponse = {
  predictionId: string
  language: Language
  text: string
}
