import { describe, expect, it } from 'vitest'
import { demoAnalysisReport } from '../demo/demoAnalysis'
import { analysisReportSchema, datasetSummarySchema, predictionResponseSchema } from './api'

/**
 * The recorded demo fixture is the output of a real analysis run, so parsing it back through the
 * report schema is the cheapest honest check that the schema still describes the backend.
 * Regenerate it with `npm run generate:demo` after changing the engine.
 */
describe('API schemas against real backend output', () => {
  it('accepts the recorded analysis report', () => {
    const result = analysisReportSchema.safeParse(demoAnalysisReport)

    expect(result.error?.issues ?? []).toEqual([])
    expect(result.success).toBe(true)
  })

  it('accepts a dataset summary in the shape the API returns', () => {
    const result = datasetSummarySchema.safeParse({
      datasetId: 'data-1',
      fileName: 'sample-field-trials.csv',
      rowCount: 288,
      columnCount: 12,
      columns: [
        {
          id: 'yield_t_ha',
          label: 'yield_t_ha',
          dataType: 'number',
          nullable: false,
          unit: 't/ha',
          unitInferred: true,
          eligibleAsTarget: true,
          eligibleAsFeature: true,
        },
        { id: 'soil_type', label: 'soil_type', dataType: 'category', nullable: true, allowedValues: ['loam', 'clay', null], eligibleAsTarget: false, eligibleAsFeature: true },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('accepts a prediction with an interval and rejections notices', () => {
    const result = predictionResponseSchema.safeParse({
      predictionId: 'p-1',
      targetColumnId: 'yield_t_ha',
      value: 3.912,
      model: 'random-forest',
      unit: 't/ha',
      unitInferred: true,
      interval: { lower: 2.53, upper: 4.25, halfWidth: 0.861, inSample: false, method: 'RMSE-based error band from cross-validated RMSE.' },
      notices: ['This estimate is above the highest observed yield_t_ha (5.6).'],
    })

    expect(result.success).toBe(true)
  })

  it('rejects a prediction missing the fields the result panel reads', () => {
    const result = predictionResponseSchema.safeParse({ predictionId: 'p-1', targetColumnId: 'yield_t_ha', model: 'ridge' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['value'])
  })
})
