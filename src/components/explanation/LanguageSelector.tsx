import type { Language } from '../../types/cropcast'

type LanguageSelectorProps = {
  value: Language
  loading: boolean
  onChange: (language: Language) => void
}

export function LanguageSelector({ value, loading, onChange }: LanguageSelectorProps) {
  return (
    <div className="field-block language-field">
      <label htmlFor="explanation-language">Explanation language</label>
      <select id="explanation-language" value={value} disabled={loading} onChange={(event) => onChange(event.target.value as Language)}>
        <option value="en">English</option>
        <option value="hi">Hindi (हिन्दी)</option>
        <option value="te">Telugu (తెలుగు)</option>
      </select>
      <small className="field-help">The API returns a new explanation in the selected language.</small>
    </div>
  )
}
