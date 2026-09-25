export type DatasetStatus = 'idle' | 'uploading' | 'loaded' | 'invalid' | 'error'
export type PredictionStatus = 'ready' | 'processing' | 'success' | 'error'
export type ExplanationStatus = 'loading' | 'success' | 'error'
export type VoiceStatus = 'idle' | 'playing' | 'paused' | 'stopped' | 'unavailable'
export type Language = 'en' | 'hi' | 'te'
export type ModelKind = 'ridge' | 'lasso' | 'elastic-net'
export type Scalar = string | number | boolean | null
export type DataSource = 'uploaded' | 'demo'

export type ColumnDescriptor = {
  id: string
  label: string
  dataType: 'number' | 'integer' | 'category' | 'text' | 'boolean' | 'date' | 'unknown'
  nullable: boolean
  unit?: string
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
  model: ModelKind
  inputRecord: Record<string, Scalar>
}

export type PredictionResponse = {
  predictionId: string
  targetColumnId: string
  value: Scalar
  unit?: string
  model: ModelKind
  notices?: string[]
}

export type ExplanationResponse = {
  predictionId: string
  language: Language
  text: string
}
