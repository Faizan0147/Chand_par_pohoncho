import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import ScenarioBar from './components/ScenarioBar.jsx'
import { useData, useKeepSearch } from './lib/data.jsx'
import Compare from './pages/Compare.jsx'
import Method from './pages/Method.jsx'
import Pick from './pages/Pick.jsx'
import Site from './pages/Site.jsx'

export default function App() {
  const data = useData()
  const link = useKeepSearch()
  const { pathname } = useLocation()
  const demo = data.status === 'ready' && data.sites.some(s => s.terrain === 'synthetic-demo')
  return (
    <>
      <header className="top">
        <NavLink to={link('/')} className="brand"><span className="dot" /> Rimlight</NavLink>
        <nav>
          <NavLink to={link('/')} end>Sites</NavLink>
          <NavLink to={link('/compare')}>Compare</NavLink>
          <NavLink to="/method">How it works</NavLink>
        </nav>
      </header>
      {demo && pathname !== '/method' && (
        <div className="banner" role="note"><strong>Demo terrain.</strong> Sun and Earth positions are computed from NASA/JPL ephemeris, but the terrain horizons in this build are synthetic placeholders, so the percentages are illustrative, not predictions.</div>
      )}
      {pathname !== '/method' && <ScenarioBar />}
      <main>
        {data.status === 'loading' && <p className="muted">Loading ephemeris…</p>}
        {data.status === 'error' && <p className="warn">Could not load data: {data.error}</p>}
        {data.status === 'ready' && (
          <Routes>
            <Route path="/" element={<Pick />} />
            <Route path="/site/:id" element={<Site />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/method" element={<Method />} />
            <Route path="*" element={<Pick />} />
          </Routes>
        )}
      </main>
      <footer className="foot muted small">Rimlight is a comparison and planning aid, not a guarantee of landing safety or mission success. Data: NASA/JPL, LRO. Built for NASA Space Apps 2026.</footer>
    </>
  )
}
