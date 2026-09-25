import { describe, expect, it } from 'vitest'
import type { DatasetSummaryData, PredictionResponse } from '../../types/cropcast'
import { initialWorkbenchState, workbenchReducer } from './workbenchReducer'

const dataset: DatasetSummaryData = {
  datasetId: 'dataset-1',
  fileName: 'sample.csv',
  columnCount: 3,
  columns: [
    { id: 'target', label: 'Target', dataType: 'number', nullable: false, eligibleAsTarget: true, eligibleAsFeature: false },
    { id: 'feature-a', label: 'Feature A', dataType: 'number', nullable: false, eligibleAsTarget: false, eligibleAsFeature: true },
    { id: 'feature-b', label: 'Feature B', dataType: 'category', nullable: false, allowedValues: ['one', 'two'], eligibleAsTarget: false, eligibleAsFeature: true },
  ],
}

const prediction: PredictionResponse = {
  predictionId: 'prediction-1',
  targetColumnId: 'target',
  value: 42,
  model: 'ridge',
}

describe('workbenchReducer', () => {
  it('loads a dataset and resets every downstream stage', () => {
    const dirtyState = {
      ...initialWorkbenchState,
      dataset: { status: 'loaded' as const, data: dataset, source: 'demo' as const },
      selection: { targetColumnId: 'target', featureColumnIds: ['feature-a'], inputRecord: { 'feature-a': 3 }, model: 'ridge' as const },
      prediction: { status: 'success' as const, data: prediction },
      explanation: { status: 'success' as const, language: 'en' as const, text: 'Text', requested: true },
      voice: { status: 'playing' as const },
    }

    const state = workbenchReducer(dirtyState, { type: 'datasetLoaded', dataset, source: 'uploaded' })

    expect(state.dataset).toEqual({ status: 'loaded', data: dataset, source: 'uploaded' })
    expect(state.selection).toEqual({ targetColumnId: '', featureColumnIds: [], inputRecord: {}, model: '' })
    expect(state.prediction).toEqual({ status: 'ready' })
    expect(state.explanation).toEqual({ status: 'loading', language: 'en', requested: false })
    expect(state.voice).toEqual({ status: 'idle' })
  })

  it('clears prediction, explanation, and voice when a selection changes', () => {
    const state = {
      ...initialWorkbenchState,
      dataset: { status: 'loaded' as const, data: dataset, source: 'demo' as const },
      selection: { targetColumnId: 'target', featureColumnIds: ['feature-a'], inputRecord: { 'feature-a': 3 }, model: 'ridge' as const },
      prediction: { status: 'success' as const, data: prediction },
      explanation: { status: 'success' as const, language: 'hi' as const, text: 'Text', requested: true },
      voice: { status: 'paused' as const },
    }

    const next = workbenchReducer(state, { type: 'modelChanged', model: 'lasso' })

    expect(next.selection.model).toBe('lasso')
    expect(next.prediction).toEqual({ status: 'ready' })
    expect(next.explanation.requested).toBe(false)
    expect(next.voice.status).toBe('idle')
  })

  it('keeps the last explanation visible while requesting another language', () => {
    const state = {
      ...initialWorkbenchState,
      explanation: { status: 'success' as const, language: 'en' as const, text: 'English explanation', requested: true },
    }

    const next = workbenchReducer(state, { type: 'explanationStarted', language: 'te' })

    expect(next.explanation).toEqual({ status: 'loading', language: 'te', text: 'English explanation', requested: true })
    expect(next.voice.status).toBe('idle')
  })
})
