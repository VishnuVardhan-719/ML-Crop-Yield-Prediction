import type { ModelKind } from '../../types/cropcast'

const models: Array<{ value: ModelKind; title: string; detail: string }> = [
  { value: 'ridge', title: 'Ridge', detail: 'L2 regularization; retains correlated features while controlling coefficient size.' },
  { value: 'lasso', title: 'Lasso', detail: 'L1 regularization; can reduce less useful feature coefficients to zero.' },
  { value: 'elastic-net', title: 'Elastic Net', detail: 'Combines L1 and L2 regularization for selective, correlated feature sets.' },
]

type ModelSelectorProps = {
  value: ModelKind | ''
  disabled?: boolean
  onChange: (model: ModelKind) => void
}

export function ModelSelector({ value, disabled, onChange }: ModelSelectorProps) {
  return (
    <fieldset className="model-selector" disabled={disabled}>
      <legend className="visually-hidden">Regression model</legend>
      {models.map((model) => (
        <label className="model-option" key={model.value}>
          <input type="radio" name="model" value={model.value} checked={value === model.value} onChange={() => onChange(model.value)} />
          <span><strong>{model.title}</strong><small>{model.detail}</small></span>
        </label>
      ))}
    </fieldset>
  )
}
