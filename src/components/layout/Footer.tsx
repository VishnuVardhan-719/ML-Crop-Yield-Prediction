import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div><strong>CropCast</strong><p>Automated agricultural dataset analysis, model evaluation, prediction, and multilingual explanation.</p></div>
        <nav aria-label="Footer navigation"><Link to="/">Home</Link><Link to="/analysis">Analysis</Link></nav>
        <p className="footer-status">Frontend analysis contract ready<br />Python ML integration pending</p>
      </div>
    </footer>
  )
}
