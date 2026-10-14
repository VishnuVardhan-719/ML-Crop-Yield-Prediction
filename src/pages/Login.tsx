import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [showPassword, setShowPassword] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const nextErrors: typeof errors = {}
    if (!email.trim()) nextErrors.email = 'Enter your email or username'
    else if (email.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address'
    if (!password.trim()) nextErrors.password = 'Enter your password'
    else if (password.trim().length < 2) nextErrors.password = 'Password is too short'

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    try {
      localStorage.setItem('cropcast_dummy_user', JSON.stringify({ email: email.trim(), at: Date.now() }))
      window.dispatchEvent(new Event('cropcast:auth-change'))
    } catch {
      // storage may be blocked in private mode — still allow navigation for demo
    }
    navigate('/analysis')
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        {/* Card */}
        <div className="login-card">
          {/* Left — field / agriculture visual (CSS gradient + inline SVG, no external image) */}
          <div className="login-visual" aria-hidden="true">
            <div className="login-visual-gradient" />
            {/* subtle grain / field SVG */}
            <svg className="login-visual-scene" viewBox="0 0 560 720" preserveAspectRatio="xMidYMid slice" role="img" focusable="false">
              <title>Abstract field illustration</title>
              <defs>
                <linearGradient id="lv-sky" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#e8f5e9" stopOpacity="0.95" />
                  <stop offset="55%" stopColor="#a7d8b5" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#1f6b45" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="lv-hill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#1f6b45" stopOpacity="0.18" />
                </linearGradient>
              </defs>
              {/* sun */}
              <circle cx="420" cy="118" r="46" fill="#fffbeb" opacity="0.95" />
              <circle cx="420" cy="118" r="72" fill="#fef3c7" opacity="0.22" />
              {/* hills */}
              <ellipse cx="180" cy="520" rx="320" ry="110" fill="url(#lv-hill)" opacity="0.9" />
              <ellipse cx="420" cy="560" rx="300" ry="95" fill="#eaf2ec" opacity="0.55" />
              {/* field rows — subtle */}
              <g stroke="#1f6b45" strokeOpacity="0.14" strokeWidth="1.2" fill="none">
                <path d="M -20 620 C 120 590 260 585 420 610 L 420 720 L -20 720 Z" fill="#1f6b45" fillOpacity="0.08" stroke="none" />
                {Array.from({ length: 9 }).map((_, i) => (
                  <path key={i} d={`M ${-30 + i * 62} 640 C ${40 + i * 62} 605 ${140 + i * 62} 595 ${200 + i * 62} 630`} />
                ))}
              </g>
              {/* crop icons */}
              <g opacity="0.9">
                {[
                  [90, 610],
                  [150, 595],
                  [210, 588],
                  [270, 592],
                  [330, 605],
                  [390, 618],
                ].map(([x, y], i) => (
                  <g key={i} transform={`translate(${x} ${y})`}>
                    <path d="M0 0 C -6 -14 6 -18 0 -28 C -4 -18 4 -14 0 0 Z" fill="#ffffff" opacity="0.92" />
                    <line x1="0" y1="0" x2="0" y2="12" stroke="#ffffff" strokeWidth="1.1" opacity="0.95" />
                  </g>
                ))}
              </g>
            </svg>

            <div className="login-visual-content">
              <Link to="/" className="login-brand" aria-label="CropCast home">
                <span className="brand-mark" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  CropCast
                  <small>Smarter Agriculture · Higher Yields</small>
                </span>
              </Link>

              <div className="login-visual-copy">
                <p className="login-kicker">Field intelligence, not fabrication</p>
                <h1>Welcome back to CropCast</h1>
                <p>Upload a dataset, compare four models live against a baseline, and get a prediction you can trace — all from your local pipeline.</p>
                <ul className="login-visual-bullets" aria-label="Highlights">
                  <li>Upload CSV · auto-detect target</li>
                  <li>Ridge · Lasso · Elastic Net · Random Forest</li>
                  <li>Transparent metrics, never hardcoded</li>
                </ul>
              </div>

              <p className="login-visual-foot">Illustration is CSS + SVG — no external image. Inspired by poster panel 1, rebuilt for the web.</p>
            </div>
          </div>

          {/* Right — form */}
          <div className="login-form-panel">
            <div className="login-form-head">
              <h2>Sign in</h2>
              <p>
                Demo access — any email and password works. No backend auth. You land straight in the <Link to="/analysis">Analysis workspace</Link>.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate aria-describedby="login-hint">
              <div className="field-block">
                <label htmlFor="login-email">Email or username</label>
                <input
                  id="login-email"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="you@university.edu or guest"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
                />
                {errors.email ? (
                  <p id="login-email-error" className="field-error" role="alert">
                    {errors.email}
                  </p>
                ) : (
                  <p className="field-help">Use any email — demo mode does not verify.</p>
                )}
              </div>

              <div className="field-block">
                <div className="login-label-row">
                  <label htmlFor="login-password">Password</label>
                  <button
                    type="button"
                    className="text-button"
                    style={{ minHeight: 'auto', fontSize: '.78rem' }}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-controls="login-password"
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'login-password-error' : 'login-password-help'}
                />
                {errors.password ? (
                  <p id="login-password-error" className="field-error" role="alert">
                    {errors.password}
                  </p>
                ) : (
                  <p id="login-password-help" className="field-help">
                    Any password works — demo access only.
                  </p>
                )}
              </div>

              <div id="login-hint" className="login-hint" role="note">
                <span aria-hidden="true">ⓘ</span> Any email/password works — demo access. Nothing is sent to a server.
              </div>

              <button type="submit" className="button button-primary login-submit">
                Log in — go to Analysis
              </button>

              <p className="login-secondary">
                No account needed. <Link to="/analysis" className="quiet-link" style={{ minHeight: 'auto', fontSize: '.85rem' }}>
                  Skip to Analysis
                </Link>
                <span aria-hidden="true"> · </span>
                <Link to="/" className="quiet-link" style={{ minHeight: 'auto', fontSize: '.85rem' }}>
                  Back to Home
                </Link>
              </p>
            </form>

            <p className="login-credit">Team T.N.-7 · Guide: Ms. Haritha · KLH University Hyderabad</p>
          </div>
        </div>

        <p className="login-page-foot">
          Poster is reference only — this is the live website. Dummy login stores <code>cropcast_dummy_user</code> in localStorage and does not gate <code>/analysis</code>.
        </p>
      </div>

      <style>{`
        .login-page { min-height: calc(100dvh - 3.5rem - 120px); display: grid; place-items: center; padding: 1.75rem 1rem 2.5rem; background: var(--bg); }
        .login-shell { width: min(1040px, 100%); display: grid; gap: 0.85rem; }
        .login-card {
          display: grid;
          grid-template-columns: 1.08fr 0.92fr;
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 1rem;
          background: var(--surface);
          box-shadow: 0 18px 48px rgba(16, 36, 22, 0.10), 0 2px 10px rgba(16, 36, 22, 0.06);
        }
        .login-visual {
          position: relative;
          overflow: hidden;
          min-height: 520px;
          background: #0f2e1f;
          color: #eaf2ec;
          isolation: isolate;
        }
        .login-visual-gradient {
          position: absolute; inset: 0;
          background:
            radial-gradient(1100px 600px at 70% 8%, rgba(255,255,255,0.92) 0%, rgba(232,245,233,0.55) 22%, transparent 62%),
            linear-gradient(165deg, #dff0e3 0%, #bfe0c8 28%, #7cba96 58%, #1f6b45 100%);
        }
        .login-visual-scene { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.95; }
        .login-visual-content {
          position: relative; z-index: 1;
          display: flex; flex-direction: column; justify-content: space-between;
          min-height: 520px; padding: 1.35rem 1.4rem 1rem;
        }
        .login-brand { display: inline-flex; align-items: center; gap: 0.65rem; color: #0f2e1f; font-weight: 700; letter-spacing: -0.015em; }
        .login-brand .brand-mark { background: #153626; }
        .login-brand span:last-child { display: grid; gap: 0.12rem; line-height: 1; }
        .login-brand small { color: #2f4a37; font-size: 0.72rem; font-weight: 500; letter-spacing: 0.02em; }
        .login-visual-copy { max-width: 28rem; margin-top: 2rem; color: #0f2e1f; }
        .login-kicker { margin: 0 0 0.55rem; color: #1f6b45; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .login-visual-copy h1 { margin: 0 0 0.6rem; font-family: var(--display); font-size: clamp(1.65rem, 3vw, 2.15rem); line-height: 1.08; letter-spacing: -0.03em; color: #12261a; }
        .login-visual-copy > p { margin: 0; color: #2a4635; font-size: 0.92rem; line-height: 1.55; }
        .login-visual-bullets { margin: 1rem 0 0; padding: 0; list-style: none; display: grid; gap: 0.35rem; }
        .login-visual-bullets li { display: flex; align-items: center; gap: 0.5rem; color: #1a3525; font-size: 0.82rem; font-weight: 500; }
        .login-visual-bullets li::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #1f6b45; flex: 0 0 auto; }
        .login-visual-foot { margin: 1.25rem 0 0; color: #2f4a37; font-size: 0.72rem; opacity: 0.9; }
        .login-form-panel { display: grid; align-content: start; gap: 1.25rem; padding: 1.6rem 1.5rem 1.25rem; }
        .login-form-head h2 { margin: 0 0 0.35rem; font-family: var(--display); font-size: 1.55rem; line-height: 1.1; letter-spacing: -0.02em; }
        .login-form-head p { margin: 0; color: var(--muted); font-size: 0.86rem; line-height: 1.5; }
        .login-form-head a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
        .login-label-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .login-hint {
          display: flex; align-items: center; gap: 0.5rem;
          margin: 0.2rem 0 0; padding: 0.65rem 0.75rem;
          border: 1px solid var(--line); border-left: 3px solid var(--accent);
          border-radius: var(--radius); background: var(--accent-soft);
          color: var(--muted); font-size: 0.8rem;
        }
        .login-submit { width: 100%; margin-top: 0.9rem; min-height: 2.9rem; font-size: 0.95rem; background: #2563eb; color: #ffffff; }
        .login-submit:hover:not(:disabled) { background: #1d4ed8; }
        .login-secondary { margin: 0.85rem 0 0; color: var(--muted); font-size: 0.84rem; }
        .login-credit {
          margin: 0.9rem 0 0; padding-top: 0.85rem; border-top: 1px solid var(--line);
          color: var(--muted); font-size: 0.7rem; letter-spacing: 0.02em; opacity: 0.9;
        }
        .login-page-foot {
          margin: 0; text-align: center; color: var(--muted);
          font-size: 0.72rem; line-height: 1.5;
        }
        .login-page-foot code { padding: 0.1rem 0.3rem; border-radius: 4px; background: var(--surface-2); font-size: 0.72rem; }
        @media (max-width: 860px) {
          .login-card { grid-template-columns: minmax(0, 1fr); }
          .login-visual { min-height: 300px; }
          .login-visual-content { min-height: 300px; padding: 1.15rem 1.15rem 0.9rem; }
          .login-form-panel { padding: 1.25rem 1.15rem 1.15rem; }
        }
        @media (max-width: 420px) {
          .login-page { padding-inline: 0.75rem; }
          .login-card { border-radius: 0.9rem; }
        }
      `}</style>
    </div>
  )
}

export default Login
