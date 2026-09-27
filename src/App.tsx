import { BrowserRouter, Link, Navigate, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Analysis } from './pages/Analysis'

function NotFound() {
  return <div className="analysis-page container"><header className="analysis-page-header"><p className="kicker">Not found</p><h1>That page does not exist.</h1><p>CropCast has a home page and an analysis workspace. Anything else is a bookmarked old link.</p></header><Link className="button button-primary" to="/analysis">Start an analysis</Link></div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path='/' element={<Home />} />
          <Route path='/analysis' element={<Analysis />} />
          <Route path='/predict' element={<Navigate to='/analysis' replace />} />
          <Route path='*' element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
