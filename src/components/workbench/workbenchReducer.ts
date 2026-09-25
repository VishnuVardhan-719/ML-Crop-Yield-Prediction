import type {
  DataSource,
  DatasetStatus,
  DatasetSummaryData,
  ExplanationStatus,
  Language,
  ModelKind,
  PredictionResponse,
  PredictionStatus,
  Scalar,
  VoiceStatus,
} from '../../types/cropcast'

type DatasetState = {
  status: DatasetStatus
  data?: DatasetSummaryData
  source?: DataSource
  message?: string
}

type PredictionState = {
  status: PredictionStatus
  data?: PredictionResponse
  message?: string
}

type ExplanationState = {
  status: ExplanationStatus
  language: Language
  text?: string
  message?: string
  requested: boolean
}

type VoiceState = {
  status: VoiceStatus
  message?: string
}

export type WorkbenchState = {
  dataset: DatasetState
  selection: {
    targetColumnId: string
    featureColumnIds: string[]
    inputRecord: Record<string, Scalar>
    model: ModelKind | ''
  }
  prediction: PredictionState
  explanation: ExplanationState
  voice: VoiceState
}

export type WorkbenchAction =
  | { type: 'datasetStarted' }
  | { type: 'datasetLoaded'; dataset: DatasetSummaryData; source: DataSource }
  | { type: 'datasetFailed'; status: 'invalid' | 'error'; message: string }
  | { type: 'targetChanged'; targetColumnId: string }
  | { type: 'featuresChanged'; featureColumnIds: string[] }
  | { type: 'inputChanged'; columnId: string; value: Scalar }
  | { type: 'modelChanged'; model: ModelKind }
  | { type: 'predictionStarted' }
  | { type: 'predictionSucceeded'; prediction: PredictionResponse }
  | { type: 'predictionFailed'; message: string }
  | { type: 'explanationStarted'; language: Language }
  | { type: 'explanationSucceeded'; language: Language; text: string }
  | { type: 'explanationFailed'; language: Language; message: string }
  | { type: 'voiceChanged'; status: VoiceStatus; message?: string }
  | { type: 'reset' }

const cleanSelection = () => ({
  targetColumnId: '',
  featureColumnIds: [] as string[],
  inputRecord: {} as Record<string, Scalar>,
  model: '' as const,
})

const cleanPrediction = (): PredictionState => ({ status: 'ready' })
const cleanExplanation = (): ExplanationState => ({ status: 'loading', language: 'en', requested: false })
const cleanVoice = (): VoiceState => ({ status: 'idle' })

export const initialWorkbenchState: WorkbenchState = {
  dataset: { status: 'idle' },
  selection: cleanSelection(),
  prediction: cleanPrediction(),
  explanation: cleanExplanation(),
  voice: cleanVoice(),
}

const clearOutput = (state: WorkbenchState): WorkbenchState => ({
  ...state,
  prediction: cleanPrediction(),
  explanation: cleanExplanation(),
  voice: cleanVoice(),
})

export function workbenchReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case 'datasetStarted':
      return { ...initialWorkbenchState, dataset: { status: 'uploading' } }
    case 'datasetLoaded':
      return {
        ...initialWorkbenchState,
        dataset: { status: 'loaded', data: action.dataset, source: action.source },
      }
    case 'datasetFailed':
      return { ...initialWorkbenchState, dataset: { status: action.status, message: action.message } }
    case 'targetChanged':
      return clearOutput({
        ...state,
        selection: { ...state.selection, targetColumnId: action.targetColumnId, featureColumnIds: state.selection.featureColumnIds.filter((id) => id !== action.targetColumnId), inputRecord: {} },
      })
    case 'featuresChanged':
      return clearOutput({
        ...state,
        selection: {
          ...state.selection,
          featureColumnIds: action.featureColumnIds,
          inputRecord: Object.fromEntries(Object.entries(state.selection.inputRecord).filter(([id]) => action.featureColumnIds.includes(id))),
        },
      })
    case 'inputChanged':
      return clearOutput({ ...state, selection: { ...state.selection, inputRecord: { ...state.selection.inputRecord, [action.columnId]: action.value } } })
    case 'modelChanged':
      return clearOutput({ ...state, selection: { ...state.selection, model: action.model } })
    case 'predictionStarted':
      return { ...state, prediction: { status: 'processing' }, explanation: cleanExplanation(), voice: cleanVoice() }
    case 'predictionSucceeded':
      return { ...state, prediction: { status: 'success', data: action.prediction }, explanation: cleanExplanation(), voice: cleanVoice() }
    case 'predictionFailed':
      return { ...state, prediction: { status: 'error', message: action.message }, explanation: cleanExplanation(), voice: cleanVoice() }
    case 'explanationStarted':
      return { ...state, explanation: { status: 'loading', language: action.language, text: state.explanation.text, requested: true }, voice: cleanVoice() }
    case 'explanationSucceeded':
      return { ...state, explanation: { status: 'success', language: action.language, text: action.text, requested: true }, voice: cleanVoice() }
    case 'explanationFailed':
      return { ...state, explanation: { status: 'error', language: state.explanation.text ? state.explanation.language : action.language, text: state.explanation.text, message: action.message, requested: true }, voice: cleanVoice() }
    case 'voiceChanged':
      return { ...state, voice: { status: action.status, message: action.message } }
    case 'reset':
      return initialWorkbenchState
  }
}
