const sections = [
  ['overview', 'Overview'],
  ['models', 'Compare models'],
  ['prediction', 'Predict a new record'],
  ['evidence', 'Testing evidence'],
  ['quality', 'Data quality'],
  ['exploration', 'Exploration'],
  ['preprocessing', 'Preprocessing'],
  ['insights', 'Model associations'],
  ['explanation', 'Automated summary'],
  ['visuals', 'Visuals'],
] as const

export function AnalysisNavigation() {
  return (
    <nav className="analysis-navigation" aria-label="Analysis report navigation">
      <label className="analysis-navigation-select">Report section<select aria-label="Analysis section" defaultValue="" onChange={(event) => { if (event.target.value) document.getElementById(event.target.value)?.scrollIntoView() }}><option value="" disabled>Jump to section</option>{sections.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <ul>{sections.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ul>
    </nav>
  )
}
