import { describe, expect, it } from 'vitest'
import { demoAnalysisReport } from './demoAnalysis'

describe('demoAnalysisReport', () => {
  it('selects exactly one model, and selects the one with the lowest cross-validated RMSE', () => {
    const selected = demoAnalysisReport.models.filter((model) => model.selected)
    expect(selected).toHaveLength(1)

    const scored = demoAnalysisReport.models.filter((model) => model.rmse !== null)
    const best = scored.reduce((lowest, model) => (model.rmse! < lowest.rmse! ? model : lowest))
    expect(selected[0].model).toBe(best.model)
  })

  it('never reports a missing metric as 0', () => {
    for (const model of demoAnalysisReport.models) {
      expect(model.rmse === null || model.rmse > 0).toBe(true)
    }
  })

  it('names the selected model in the explanation', () => {
    const selected = demoAnalysisReport.models.find((model) => model.selected)!
    expect(demoAnalysisReport.explanations.en).toContain(selected.label)
  })

  it('flags inferred units instead of presenting them as dataset truth', () => {
    expect(demoAnalysisReport.prediction.unitInferred).toBe(true)
    expect(demoAnalysisReport.caveats.join(' ')).toMatch(/inferred from the column name/)
  })

  it('states the selection rule and the holdout scope', () => {
    expect(demoAnalysisReport.evaluation.selectionRule).toMatch(/lowest cross-validated RMSE/)
    expect(demoAnalysisReport.evaluation.holdoutSummary).toContain(demoAnalysisReport.evaluation.validation.label)
  })

  it('offers every validation strategy with the reason when one is unavailable', () => {
    const options = demoAnalysisReport.evaluation.validation.options

    expect(options.map((option) => option.key)).toEqual(['random', 'grouped', 'temporal'])
    expect(options.every((option) => option.note || option.reason)).toBe(true)
    expect(demoAnalysisReport.evaluation.validation.label).toBe('Random split')
  })
})
