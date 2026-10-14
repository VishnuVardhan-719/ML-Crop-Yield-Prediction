import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="analysis-page container">
      <header className="analysis-page-header">
        <p className="kicker">Not found</p>
        <h1>That page does not exist.</h1>
        <p>CropCast has a home page and an analysis workspace. Anything else is a bookmarked old link.</p>
      </header>
      <Link className="button button-primary" to="/analysis">
        Start an analysis
      </Link>
    </div>
  )
}

export default NotFound
