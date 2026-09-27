import type { ChangeEvent } from 'react'
import type { ColumnDescriptor, Scalar } from '../../types/cropcast'

type PredictionFormProps = {
  columns: ColumnDescriptor[]
  targetColumnId: string
  featureColumnIds: string[]
  inputRecord: Record<string, Scalar>
  errors?: Record<string, string>
  onTargetChange: (columnId: string) => void
  onFeaturesChange: (columnIds: string[]) => void
  onInputChange: (columnId: string, value: Scalar) => void
}

const scalarValue = (value: Scalar) => value === null ? '' : String(value)

export function PredictionForm({ columns, targetColumnId, featureColumnIds, inputRecord, errors = {}, onTargetChange, onFeaturesChange, onInputChange }: PredictionFormProps) {
  const targets = columns.filter((column) => column.eligibleAsTarget && (column.dataType === 'number' || column.dataType === 'integer'))
  const features = columns.filter((column) => column.eligibleAsFeature && column.id !== targetColumnId)
  const selectedFeatures = features.filter((column) => featureColumnIds.includes(column.id))

  const toggleFeature = (columnId: string, checked: boolean) => {
    onFeaturesChange(checked ? [...featureColumnIds, columnId] : featureColumnIds.filter((id) => id !== columnId))
  }

  const updateValue = (column: ColumnDescriptor, event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const raw = event.target.value
    if (raw === '') return onInputChange(column.id, null)
    if (column.dataType === 'number' || column.dataType === 'integer') return onInputChange(column.id, Number(raw))
    if (column.dataType === 'boolean') return onInputChange(column.id, raw === 'true')
    onInputChange(column.id, raw)
  }

  return (
    <div className="input-builder">
      <div className="field-block">
        <label htmlFor="target-column">Target column</label>
        <select id="target-column" value={targetColumnId} aria-invalid={Boolean(errors.target)} aria-describedby={errors.target ? 'target-error' : undefined} onChange={(event) => onTargetChange(event.target.value)}>
          <option value="">Select the value to predict</option>
          {targets.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
        </select>
        {errors.target && <p id="target-error" className="field-error" role="alert" tabIndex={-1}>{errors.target}</p>}
        {targets.length === 0 && <p className="field-help warning-text">This dataset does not include an eligible numeric target.</p>}
      </div>

      <fieldset className="feature-picker" disabled={!targetColumnId}>
        <legend>Feature columns</legend>
        <p className="field-help">Choose the columns the model should use.</p>
        <div className="checkbox-grid">
          {features.map((column) => (
            <label className="check-row" key={column.id}>
              <input type="checkbox" checked={featureColumnIds.includes(column.id)} onChange={(event) => toggleFeature(column.id, event.target.checked)} />
              <span><strong>{column.label}</strong><small>{column.dataType}{column.unit ? ` · ${column.unit}` : ''}</small></span>
            </label>
          ))}
        </div>
        {errors.features && <p className="field-error" role="alert" tabIndex={-1}>{errors.features}</p>}
      </fieldset>

      {selectedFeatures.length > 0 && (
        <fieldset className="record-fields">
          <legend>Prediction record</legend>
          <p className="field-help">Enter one record. CropCast sends these values to the selected model.</p>
          <div className="dynamic-field-grid">
            {selectedFeatures.map((column) => {
              const id = `input-${column.id}`
              const describedBy = errors[column.id] ? `${id}-error` : column.unit ? `${id}-help` : undefined
              return (
                <div className="field-block" key={column.id}>
                  <label htmlFor={id}>{column.label}</label>
                  {column.allowedValues ? (
                    <select id={id} value={scalarValue(inputRecord[column.id] ?? null)} aria-invalid={Boolean(errors[column.id])} aria-describedby={describedBy} onChange={(event) => updateValue(column, event)}>
                      <option value="">Select a value</option>
                      {column.allowedValues.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
                    </select>
                  ) : (
                    <input id={id} type={column.dataType === 'number' || column.dataType === 'integer' ? 'number' : 'text'} step={column.dataType === 'integer' ? '1' : 'any'} value={scalarValue(inputRecord[column.id] ?? null)} aria-invalid={Boolean(errors[column.id])} aria-describedby={describedBy} onChange={(event) => updateValue(column, event)} />
                  )}
                  {column.unit && !errors[column.id] && <small id={`${id}-help`} className="field-help">{column.unitInferred ? `Unit inferred from the column name: ${column.unit} — confirm before use` : `Unit: ${column.unit}`}</small>}
                  {errors[column.id] && <small id={`${id}-error`} className="field-error" role="alert">{errors[column.id]}</small>}
                </div>
              )
            })}
          </div>
        </fieldset>
      )}
    </div>
  )
}
