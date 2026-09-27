import { Link } from 'react-router-dom'
import { ModelComparison } from './ModelComparison'

const datasetChecks = ['Headers and table structure', 'Numeric, categorical, and date types', 'Missing values and duplicates', 'Identifier and constant columns', 'Target candidates and validity', 'Outlier, target-redundancy, and train/test-overlap indicators']
const pipeline = ['Validate', 'Split safely', 'Fit preprocessing', 'Compare four models', 'Cross-validate', 'Compare metrics', 'Select model', 'Build report']

export function ProductDetails() {
  return (
    <>
      <section className="landing-section intelligence-section">
        <div className="container intelligence-layout"><div><p className="kicker">Dataset intelligence</p><h2>Know what is in the file before a model sees it.</h2><p>CropCast prepares a structured profile for the backend to populate from the uploaded dataset.</p></div><ul>{datasetChecks.map((check) => <li key={check}>{check}</li>)}</ul></div>
      </section>

      <section className="landing-section automation-section">
        <div className="container"><div className="landing-heading"><h2>The ML workflow runs as one pipeline.</h2><p>Preprocessing is fitted inside validation folds, all four models are evaluated cross-validated, and the lowest cross-validated RMSE is selected.</p></div><ol className="pipeline-strip">{pipeline.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol></div>
      </section>

      <ModelComparison />

      <section className="landing-section explanation-section">
        <div className="container explanation-layout"><div><p className="kicker">Automated summary</p><h2>Structured evidence in. Careful language out.</h2><p>CropCast composes its summary with fixed templates in English, Hindi, and Telugu. No language model is involved and the interface does not claim one: every sentence is derived from the returned metrics, the selected model, and the detected validation risks.</p></div><blockquote>“The model indicates an association within this dataset.”<small>Never “this guarantees yield” or unsupported causal advice.</small></blockquote></div>
      </section>

      <section className="landing-section language-voice-section">
        <div className="container language-voice-layout"><div><h2>Read it. Hear it. Keep the science intact.</h2><p>One explanation architecture supports English, Hindi, and Telugu, with language-matched browser voice controls.</p></div><div className="language-sample"><span>English</span><span lang="hi">हिन्दी</span><span lang="te">తెలుగు</span><p>Listen · Pause · Resume · Stop</p></div></div>
      </section>

    </>
  )
}

export function FinalCTA() {
  return <section className="final-cta-section"><div className="container final-cta"><div><h2>You provide the data. CropCast shows what happened.</h2><p>Start with one dataset and review one complete, transparent analysis.</p></div><Link className="button button-primary" to="/analysis">Start analysis</Link></div></section>
}
