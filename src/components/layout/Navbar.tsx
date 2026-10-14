import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

type DummyUser = { email: string; at: number }

function readDummyUser(): DummyUser | null {
  try {
    const raw = localStorage.getItem('cropcast_dummy_user')
    if (!raw) return null
    const parsed = JSON.parse(raw) as DummyUser
    if (!parsed?.email) return null
    return parsed
  } catch {
    return null
  }
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [dummyUser, setDummyUser] = useState<DummyUser | null>(() => {
    try { return readDummyUser() } catch { return null }
  })
  const navigate = useNavigate()
  const navClass = ({ isActive }: { isActive: boolean }) => isActive ? 'nav-link is-active' : 'nav-link'

  useEffect(() => {
    setDummyUser(readDummyUser())
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'cropcast_dummy_user' || e.key === null) setDummyUser(readDummyUser())
    }
    const onFocus = () => setDummyUser(readDummyUser())
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    // also listen for same-tab updates via custom event
    const onCustom = () => setDummyUser(readDummyUser())
    window.addEventListener('cropcast:auth-change' as never, onCustom as never)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('cropcast:auth-change' as never, onCustom as never)
    }
  }, [])

  function handleLogout() {
    try { localStorage.removeItem('cropcast_dummy_user') } catch { /* ignore */ }
    setDummyUser(null)
    window.dispatchEvent(new Event('cropcast:auth-change'))
    setIsOpen(false)
    navigate('/')
  }

  const avatarLetter = (dummyUser?.email?.trim()?.[0] ?? '?').toUpperCase()
  const displayEmail = dummyUser?.email ?? ''

  return (
    <header className="site-header">
      <div className="container header-inner">
        <NavLink to="/" className="brand" onClick={() => setIsOpen(false)} aria-label="CropCast home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>CropCast<small>Yield intelligence</small></span></NavLink>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/analysis" className={navClass}>Analysis</NavLink>
          {dummyUser ? (
            <span className="nav-user" aria-label={`Signed in as ${displayEmail}`} title={displayEmail}>
              <span className="nav-avatar" aria-hidden="true">{avatarLetter}</span>
              <span className="nav-user-email">{displayEmail}</span>
              <button type="button" className="button button-secondary" onClick={handleLogout} style={{ minHeight: '2.2rem', padding: '0.35rem 0.7rem', fontSize: '0.82rem' }}>Logout</button>
            </span>
          ) : (
            <NavLink to="/login" className={navClass}>Login</NavLink>
          )}
          <NavLink to="/analysis" state={{ reset: true }} className="button button-primary">Start analysis</NavLink>
        </nav>
        <button className="menu-button" type="button" aria-expanded={isOpen} aria-controls="mobile-nav" onClick={() => setIsOpen((open) => !open)}>{isOpen ? 'Close' : 'Menu'}</button>
      </div>
      {isOpen && (
        <nav className="mobile-nav container" id="mobile-nav" aria-label="Mobile navigation">
          <NavLink to="/" end className={navClass} onClick={() => setIsOpen(false)}>Home</NavLink>
          <NavLink to="/analysis" className={navClass} onClick={() => setIsOpen(false)}>Analysis</NavLink>
          {dummyUser ? (
            <>
              <span className="nav-user" style={{ padding: '0.4rem 0' }}>
                <span className="nav-avatar" aria-hidden="true">{avatarLetter}</span>
                <span className="nav-user-email">{displayEmail}</span>
              </span>
              <button type="button" className="button button-secondary" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <NavLink to="/login" className={navClass} onClick={() => setIsOpen(false)}>Login</NavLink>
          )}
        </nav>
      )}
    </header>
  )
}
