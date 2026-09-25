import { describe, expect, it } from 'vitest'
import { getDemoDataset, getDemoExplanation, getDemoPrediction } from './demoServices'

describe('demo services', () => {
  it('keeps demo data behind the same schema-neutral contracts', async () => {
    const dataset = await getDemoDataset()
    expect(dataset.datasetId).toBe('demo-field-trials')
    expect(dataset.columns.every((column) => column.id && column.label)).toBe(true)
  })

  it('returns explicitly fixture-backed output without calculating in the browser', async () => {
    const prediction = await getDemoPrediction({
      datasetId: 'demo-field-trials',
      targetColumnId: 'observed_yield',
      featureColumnIds: ['rainfall'],
      model: 'elastic-net',
      inputRecord: { rainfall: 780 },
    })
    expect(prediction.model).toBe('elastic-net')
    expect(prediction.notices).toContain('Sample output for interface demonstration only.')
  })

  it('provides all three supported explanation languages', async () => {
    await expect(getDemoExplanation('demo-prediction', 'en')).resolves.toMatchObject({ language: 'en' })
    await expect(getDemoExplanation('demo-prediction', 'hi')).resolves.toMatchObject({ language: 'hi' })
    await expect(getDemoExplanation('demo-prediction', 'te')).resolves.toMatchObject({ language: 'te' })
  })
})
