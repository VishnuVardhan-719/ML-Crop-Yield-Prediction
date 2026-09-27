import { Hero } from '../components/landing/Hero'
import { WorkflowOverview } from '../components/landing/WorkflowOverview'
import { FinalCTA, ProductDetails } from '../components/landing/ProductDetails'

export function Home() {
  return (
    <>
      <Hero />
      <WorkflowOverview />
      <ProductDetails />
      <section className="integrity-section">
        <div className="container integrity-grid">
          <h2>Built for a transparent local Python analysis pipeline.</h2>
          <div>
            <p>CropCast analyzes uploaded datasets through its local API. Statistics, model scores, predictions, and the automated summary are returned from the fitted pipeline rather than fabricated in the browser.</p>
            <ul>
              <li>No browser-side model training or fabricated analysis</li>
              <li>Ridge, Lasso, Elastic Net, and Random Forest are compared against a mean baseline</li>
              <li>Undefined metrics are reported as missing, never as zero</li>
              <li>Grouped, temporal, and target-redundancy risks are detected and disclosed</li>
            </ul>
          </div>
        </div>
      </section>
      <FinalCTA />
    </>
  )
}
