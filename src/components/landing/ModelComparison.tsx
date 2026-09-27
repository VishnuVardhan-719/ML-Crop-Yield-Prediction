const models = [
  { marker: 'L2', title: 'Ridge regression', copy: 'Controls coefficient size while retaining correlated features.' },
  { marker: 'L1', title: 'Lasso regression', copy: 'Can reduce less useful feature coefficients to zero.' },
  { marker: 'L1 + L2', title: 'Elastic Net', copy: 'Balances both penalties for selective, correlated feature sets.' },
  { marker: 'Trees', title: 'Random Forest', copy: 'Ensemble of decision trees that captures nonlinear yield patterns.' },
]

export function ModelComparison() {
  return (
    <section className="landing-section model-comparison">
      <div className="container model-layout">
        <div className="landing-heading"><h2>Four models. One mean baseline. One evidence-based choice.</h2><p>CropCast cross-validates every model and reports R², MAE, and RMSE for all of them, then selects the lowest cross-validated RMSE. If nothing beats simply predicting the mean, it says so instead of crowning a winner.</p></div>
        <div className="model-rows">
          {models.map((model) => <article key={model.title}><span>{model.marker}</span><h3>{model.title}</h3><p>{model.copy}</p></article>)}
        </div>
      </div>
    </section>
  )
}
