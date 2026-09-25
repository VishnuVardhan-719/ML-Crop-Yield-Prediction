import { Outlet } from 'react-router-dom'
import { Navbar } from './layout/Navbar'
import { Footer } from './layout/Footer'

export function Layout() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Navbar />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
