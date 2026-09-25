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
            <p>CropCast analyzes uploaded datasets through its local API. Statistics, model scores, predictions, and explanations are returned from the fitted pipeline rather than fabricated in the browser.</p>
            <ul>
              <li>No browser-side model training or fabricated analysis</li>
              <li>Ridge, Lasso, and Elastic Net are compared objectively</li>
              <li>One visibly labeled demo analysis adapter for exploring the interface</li>
            </ul>
          </div>
        </div>
      </section>
      <FinalCTA />
    </>
  )
}
