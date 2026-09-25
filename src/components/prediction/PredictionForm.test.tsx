import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDescriptor } from '../../types/cropcast'
import { PredictionForm } from './PredictionForm'

const columns: ColumnDescriptor[] = [
  { id: 'outcome-z', label: 'Outcome Z', dataType: 'number', nullable: false, unit: 'custom', eligibleAsTarget: true, eligibleAsFeature: false },
  { id: 'measure-x', label: 'Measure X', dataType: 'number', nullable: false, eligibleAsTarget: false, eligibleAsFeature: true },
  { id: 'class-y', label: 'Class Y', dataType: 'category', nullable: false, allowedValues: ['Alpha', 'Beta'], eligibleAsTarget: false, eligibleAsFeature: true },
]

describe('PredictionForm', () => {
  it('renders controls from arbitrary descriptors rather than crop-specific fields', async () => {
    const user = userEvent.setup()
    const onTargetChange = vi.fn()
    const onFeaturesChange = vi.fn()
    const onInputChange = vi.fn()
    const { rerender } = render(
      <PredictionForm
        columns={columns}
        targetColumnId=""
        featureColumnIds={[]}
        inputRecord={{}}
        onTargetChange={onTargetChange}
        onFeaturesChange={onFeaturesChange}
        onInputChange={onInputChange}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Target column'), 'outcome-z')
    expect(onTargetChange).toHaveBeenCalledWith('outcome-z')
    rerender(
      <PredictionForm
        columns={columns}
        targetColumnId="outcome-z"
        featureColumnIds={[]}
        inputRecord={{}}
        onTargetChange={onTargetChange}
        onFeaturesChange={onFeaturesChange}
        onInputChange={onInputChange}
      />,
    )
    await user.click(screen.getByRole('checkbox', { name: /Measure X/ }))
    expect(onFeaturesChange).toHaveBeenCalledWith(['measure-x'])
    expect(screen.queryByLabelText('Crop')).toBeNull()
  })

  it('uses descriptor options for categorical record values', () => {
    render(
      <PredictionForm
        columns={columns}
        targetColumnId="outcome-z"
        featureColumnIds={['class-y']}
        inputRecord={{}}
        onTargetChange={vi.fn()}
        onFeaturesChange={vi.fn()}
        onInputChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Beta' })).toBeTruthy()
  })
})
