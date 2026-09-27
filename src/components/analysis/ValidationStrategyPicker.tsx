import type { ValidationOption } from '../../types/analysis'
import type { ValidationStrategy } from '../../types/cropcast'

type Props = {
  options: ValidationOption[]
  value: ValidationStrategy
  pending?: ValidationStrategy
  error?: string
  onChange: (strategy: ValidationStrategy) => void
}

/**
 * Let the user choose what the reported scores actually measure.
 *
 * An unavailable strategy stays visible and disabled with its reason, because "grouped validation
 * is not possible here" is information the user needs, not a missing option.
 */
export function ValidationStrategyPicker({ options, value, pending, error, onChange }: Props) {
  const pendingLabel = options.find((option) => option.key === pending)?.label ?? 'the selected split'

  return (
    <div className="validation-picker">
      <fieldset disabled={Boolean(pending)}>
        <legend>Choose the validation split</legend>
        {options.map((option) => (
          <label key={option.key} data-available={option.available} data-selected={option.key === value}>
            <input
              type="radio"
              name="validation-strategy"
              value={option.key}
              checked={option.key === value}
              disabled={!option.available}
              onChange={() => onChange(option.key)}
            />
            <span>{option.label}</span>
            <small className={option.available ? undefined : 'warning-text'}>{option.available ? option.note : option.reason}</small>
          </label>
        ))}
      </fieldset>
      {pending && <p className="field-help" role="status">Re-scoring every model with {pendingLabel}. Each candidate is refitted, so this takes a moment.</p>}
      {error && <div className="inline-alert" role="alert">{error}</div>}
    </div>
  )
}
