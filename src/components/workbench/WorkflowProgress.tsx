const steps = ['Upload', 'Structure', 'Inputs', 'Model', 'Run', 'Result', 'Explain', 'Language', 'Voice']

export function WorkflowProgress({ current }: { current: number }) {
  return (
    <nav className="workflow-progress" aria-label="Prediction workflow progress">
      <ol>
        {steps.map((step, index) => {
          const number = index + 1
          const state = number < current ? 'complete' : number === current ? 'current' : 'upcoming'
          return <li key={step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}><span>{String(number).padStart(2, '0')}</span>{step}</li>
        })}
      </ol>
    </nav>
  )
}
