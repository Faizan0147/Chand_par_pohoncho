import { useEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import ScenarioBar from './components/ScenarioBar.jsx'
import RimlightLoader from './components/RimlightLoader.jsx'
import { useData, useKeepSearch } from './lib/data.jsx'
import Compare from './pages/Compare.jsx'
import Home from './pages/Home.jsx'
import Method from './pages/Method.jsx'
import Pick from './pages/Pick.jsx'
import Site from './pages/Site.jsx'

/* ── High-visibility Aerospace Rimlight Logo Mark ── */
function RimlightLogo() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="brand-logo-svg">
      {/* Outer subtle orbital boundary */}
      <circle cx="18" cy="18" r="16" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6"/>
      {/* Moon body disc */}
      <circle cx="18" cy="18" r="12" fill="var(--panel-elevated)" stroke="var(--line-strong)" strokeWidth="1.2"/>
      {/* Grazing solar rimlight arc */}
      <path
        d="M 18 6 A 12 12 0 0 1 18 30"
        fill="none"
        stroke="var(--sun)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Penetrating solar light ray */}
      <line x1="29" y1="5" x2="21.5" y2="12.5" stroke="var(--sun)" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="33" y1="12" x2="27" y2="16.5" stroke="var(--sun-flare, #fca584)" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      {/* Central south polar target dot */}
      <circle cx="18" cy="18" r="2.2" fill="var(--text-bright)"/>
    </svg>
  )
}

/* ── Sun / Moon icons for light-dark toggle ── */
function IconSun() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="2.93" y1="2.93" x2="4.34" y2="4.34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="11.66" y1="11.66" x2="13.07" y2="13.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13.07" y1="2.93" x2="11.66" y2="4.34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="4.34" y1="11.66" x2="2.93" y2="13.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconMoon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ScrollToTop() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, search])
  return null
}

export default function App() {
  const data = useData()
  const link = useKeepSearch()
  const { pathname } = useLocation()
  const headerRef = useRef(null)

  // Color theme: 'terracotta' or 'regolith'
  const [theme, setTheme] = useState(() => localStorage.getItem('rimlight-theme') || 'terracotta')
  // Light / dark mode
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('rimlight-lightmode') === 'true')
  // Navbar scrolled state
  const [scrolled, setScrolled] = useState(false)
  // Loader shown once per session
  const [loaderDone, setLoaderDone] = useState(() => sessionStorage.getItem('rimlight-loaded') === 'true')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('rimlight-theme', theme)
  }, [theme])

  useEffect(() => {
    if (lightMode) {
      document.documentElement.setAttribute('data-lightmode', '')
    } else {
      document.documentElement.removeAttribute('data-lightmode')
    }
    localStorage.setItem('rimlight-lightmode', lightMode)
  }, [lightMode])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const synthetic = data.status === 'ready' ? data.sites.filter(s => s.terrain === 'synthetic-demo').length : 0

  return (
    <>
      {!loaderDone && (
        <RimlightLoader onDone={() => {
          setLoaderDone(true)
          sessionStorage.setItem('rimlight-loaded', 'true')
        }} />
      )}
      <ScrollToTop />
      <header ref={headerRef} className={`top${scrolled ? ' top--scrolled' : ''}`}>
        <NavLink to={link('/')} className="brand">
          <RimlightLogo />
          <div className="brand-text-col">
            <span className="brand-word">Rimlight</span>
            <span className="brand-sub mono">NASA SPACE APPS</span>
          </div>
        </NavLink>

        <nav className="top-nav">
          <NavLink to={link('/')} end className="nav-link">Home</NavLink>
          <NavLink
            to={link('/sites')}
            className={({ isActive }) => `nav-link ${isActive || pathname.startsWith('/site') ? 'active' : ''}`}
          >
            Sites Explorer
          </NavLink>
          <NavLink to={link('/compare')} className="nav-link">Compare</NavLink>
          <NavLink to="/method" className="nav-link">Method &amp; Team</NavLink>
        </nav>

        <div className="top-controls">
          {/* Light / Dark toggle */}
          <button
            type="button"
            className="lightdark-toggle"
            onClick={() => setLightMode(m => !m)}
            title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {lightMode ? <IconSun /> : <IconMoon />}
          </button>

          {/* Color theme selector */}
          <div className="theme-pill" role="radiogroup" aria-label="Color theme">
            <button
              type="button"
              className={theme === 'terracotta' ? 'active' : ''}
              onClick={() => setTheme('terracotta')}
              title="Velvet Terracotta & Molten Copper"
            >
              <span className="theme-dot" style={{ background: '#e06d53' }} />
              <span>Terra</span>
            </button>
            <button
              type="button"
              className={theme === 'regolith' ? 'active' : ''}
              onClick={() => setTheme('regolith')}
              title="Lunar Regolith & Solar Ray"
            >
              <span className="theme-dot" style={{ background: '#c8b89a' }} />
              <span>Regolith</span>
            </button>
          </div>
        </div>
      </header>

      {synthetic > 0 && pathname !== '/method' && (
        <div className="banner" role="note">
          <strong>Demo terrain.</strong> {synthetic} of {data.sites.length} sites still use synthetic placeholder horizons, so their percentages are illustrative, not predictions. The other sites use real LRO LOLA elevation data.
        </div>
      )}

      {pathname !== '/' && pathname !== '/sites' && pathname !== '/method' && <ScenarioBar />}

      <main>
        {data.status === 'loading' && <p className="muted mono">Loading ephemeris…</p>}
        {data.status === 'error' && <p className="warn mono">Could not load data: {data.error}</p>}
        {data.status === 'ready' && (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/sites" element={<Pick />} />
            <Route path="/site/:id" element={<Site />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/method" element={<Method />} />
            <Route path="*" element={<Home />} />
          </Routes>
        )}
      </main>

      <footer className="foot muted small">
        Rimlight is a comparison and planning aid, not a guarantee of landing safety or mission success. Data: NASA/JPL, LRO. Built for NASA Space Apps 2026.
      </footer>
    </>
  )
}
