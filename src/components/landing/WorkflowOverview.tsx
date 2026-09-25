const steps = ['Drop dataset', 'Profile and validate', 'Prepare data', 'Train three models', 'Cross-validate', 'Select best model', 'Predict', 'Explain', 'Listen or download']

export function WorkflowOverview() {
  return (
    <section className="landing-section workflow-overview" id="product-flow">
      <div className="container">
        <div className="landing-heading">
          <h2>Drop. Analyze. Understand.</h2>
          <p>CropCast automates the safe decisions and asks only when dataset ambiguity matters.</p>
        </div>
        <ol className="flow-list">
          {steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong></li>)}
        </ol>
      </div>
    </section>
  )
}
