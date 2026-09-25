import { useState } from 'react'
import { NavLink } from 'react-router-dom'

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const navClass = ({ isActive }: { isActive: boolean }) => isActive ? 'nav-link is-active' : 'nav-link'
  return (
    <header className="site-header">
      <div className="container header-inner">
        <NavLink to="/" className="brand" onClick={() => setIsOpen(false)} aria-label="CropCast home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>CropCast<small>Yield intelligence</small></span></NavLink>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/analysis" className={navClass}>Analysis</NavLink>
          <NavLink to="/analysis" className="button button-primary">Start analysis</NavLink>
        </nav>
        <button className="menu-button" type="button" aria-expanded={isOpen} aria-controls="mobile-nav" onClick={() => setIsOpen((open) => !open)}>{isOpen ? 'Close' : 'Menu'}</button>
      </div>
      {isOpen && <nav className="mobile-nav container" id="mobile-nav" aria-label="Mobile navigation"><NavLink to="/" end className={navClass} onClick={() => setIsOpen(false)}>Home</NavLink><NavLink to="/analysis" className={navClass} onClick={() => setIsOpen(false)}>Analysis</NavLink></nav>}
    </header>
  )
}
