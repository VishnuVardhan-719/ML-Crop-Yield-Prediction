import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Analysis } from './pages/Analysis'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path='/' element={<Home />} />
          <Route path='/analysis' element={<Analysis />} />
          <Route path='/predict' element={<Navigate to='/analysis' replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
