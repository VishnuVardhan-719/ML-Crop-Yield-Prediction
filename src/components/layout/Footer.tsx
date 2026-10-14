import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div><strong>CropCast</strong><p>Automated agricultural dataset analysis, model evaluation, prediction, and multilingual explanation.</p></div>
        <nav aria-label="Footer navigation"><Link to="/">Home</Link><Link to="/analysis">Analysis</Link></nav>
        <p className="footer-status">Local FastAPI analysis service<br />Four models compared against a mean baseline</p>
      </div>
      <div className="container footer-credit" aria-label="Project credits">Team T.N.-7 · Guide: Ms. Haritha · KLH University Hyderabad</div>
    </footer>
  )
}
