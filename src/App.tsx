import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Analysis } from './pages/Analysis'
import { NotFound } from './pages/NotFound'

const Login = lazy(() => import('./pages/Login'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="container" style={{ padding: '2rem 0' }}>Loading…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route path='/' element={<Home />} />
            <Route path='/login' element={<Login />} />
            <Route path='/analysis' element={<Analysis />} />
            <Route path='/predict' element={<Navigate to='/analysis' replace />} />
            <Route path='/dashboard' element={<Navigate to='/analysis' replace />} />
            <Route path='*' element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
