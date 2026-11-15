import { lazy, Suspense, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ScenarioBar from '../components/ScenarioBar.jsx'
import SlipStrip from '../components/SlipStrip.jsx'
import ViewToggle from '../components/ViewToggle.jsx'
import { useData, useKeepSearch, useScenario } from '../lib/data.jsx'
import { missionWindow, slipProfile, windowStats, works } from '../lib/metrics.js'

const SiteMap = lazy(() => import('../components/SiteMap.jsx'))

export default function Pick() {
  const data = useData()
  const link = useKeepSearch()
  const [sc] = useScenario()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const explorerRef = useRef(null)

  const [lat, setLat] = useState('-89.5')
  const [lon, setLon] = useState('30')
  const [err, setErr] = useState('')

  if (data.status !== 'ready') return null

  const selected = (sp.get('sites') || '').split(',').filter(Boolean)
  const view = sp.get('view') === 'map' ? 'map' : 'cards'

  const setView = v => {
    const next = new URLSearchParams(sp)
    v === 'map' ? next.set('view', 'map') : next.delete('view')
    setSp(next, { replace: true })
  }

  const toggle = id => {
    const next = new URLSearchParams(sp)
    const cur = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id].slice(-3)
    cur.length ? next.set('sites', cur.join(',')) : next.delete('sites')
    setSp(next, { replace: true })
  }

  const goCustom = e => {
    e.preventDefault()
    const la = Number(lat), lo = Number(lon)
    if (!(la >= -90 && la <= 90) || !(lo >= -180 && lo <= 360)) {
      setErr('Latitude must be −90…90 and longitude −180…360 (east positive).')
      return
    }
    setErr('')
    nav({ ...link(`/site/c_${la}_${lo}`) })
  }

  const scrollToExplorer = () => {
    explorerRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="explorer-page-wrap">
      {/* Candidate Sites Exploration Header */}
      <div id="site-explorer" ref={explorerRef} className="explorer-section">
        <div className="explorer-header">
          <div className="explorer-title-wrap">
            <div className="section-header-tag mono">
              <span className="dot-live" />
              <span>MISSION WORKBENCH · SOUTH POLAR CANDIDATES</span>
            </div>
            <h1>Candidate Landing Sites</h1>
            <p className="muted">
              Adjust mission parameters below to evaluate real-time solar illumination, direct Earth line-of-sight, and 30-day launch slip tolerance across Artemis south-polar exploration zones.
            </p>
          </div>
          <ViewToggle value={view} onChange={setView} />
        </div>

        {/* Mission Parameter Console */}
        <ScenarioBar />

        {view === 'map' && (
          <Suspense fallback={<p className="muted mono">Loading shaded-relief map…</p>}>
            <SiteMap />
          </Suspense>
        )}

        {view !== 'map' && (
          <div className="cards">
            {data.sites.map(s => {
              const series = data.getSeries(s)
              const [a, b] = missionWindow(data.eph, sc)
              const st = windowStats(series, a, b)
              const prof = slipProfile(data.eph, series, sc)
              const ok = works(st, sc)

              return (
                <article className="card" key={s.id}>
                  <header>
                    <div>
                      <h3>{s.name}</h3>
                      <p className="muted small mono">
                        {s.lat.toFixed(2)}°S, {s.lon.toFixed(2)}°E · {s.kind}
                      </p>
                    </div>
                    <span className={`badge ${ok ? 'ok' : 'bad'}`}>
                      {ok ? 'Nominal' : 'Fails limit'}
                    </span>
                  </header>

                  {st && (
                    <div className="card-kpis">
                      <div className="card-kpi-item">
                        <span className="card-kpi-label mono">SUNLIGHT</span>
                        <strong className="card-kpi-val mono">{Math.round(st.sunlitPct)}%</strong>
                      </div>
                      <div className="card-kpi-item">
                        <span className="card-kpi-label mono">EARTH SIGHT</span>
                        <strong className="card-kpi-val mono">{Math.round(st.earthPct)}%</strong>
                      </div>
                      <div className="card-kpi-item">
                        <span className="card-kpi-label mono">MAX NIGHT</span>
                        <strong className="card-kpi-val mono">{Math.round(st.longestDarkH)}h</strong>
                      </div>
                    </div>
                  )}

                  <div className="card-slip-section">
                    <div className="card-slip-header mono small">
                      <span>Slip tolerance:</span>
                      <strong>
                        {prof.status === 'fails-now'
                          ? '0 days (fails now)'
                          : prof.status === 'never-fails'
                          ? '30+ days'
                          : `${prof.tolerance} day${prof.tolerance === 1 ? '' : 's'}`}
                      </strong>
                    </div>
                    <SlipStrip cells={prof.cells} slip={sc.slip} />
                  </div>

                  <footer>
                    <Link className="btn primary site-card-btn" to={link(`/site/${s.id}`)}>
                      <span>Analyze Site &amp; 3D Horizon</span>
                      <span className="btn-arrow">→</span>
                    </Link>
                    <label className="check mono small">
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      Compare
                    </label>
                  </footer>
                </article>
              )
            })}
          </div>
        )}

        {selected.length > 0 && (
          <div className="compare-bar-float">
            <span>{selected.length} site{selected.length > 1 ? 's' : ''} selected for comparison</span>
            <Link className="btn primary" to={{ ...link('/compare') }}>
              Compare Selected Sites →
            </Link>
          </div>
        )}

        {/* Custom Coordinates Section */}
        <div className="custom-coord-card panel">
          <div className="custom-coord-header">
            <h3>Custom coordinates</h3>
            <p className="muted small">
              Evaluate any arbitrary coordinate on the lunar surface (uses smooth-sphere horizon).
            </p>
          </div>
          <form className="customform" onSubmit={goCustom}>
            <label>
              <span>Latitude (°S)</span>
              <input
                value={lat}
                onChange={e => setLat(e.target.value)}
                inputMode="decimal"
                className="mono"
              />
            </label>
            <label>
              <span>Longitude (°E)</span>
              <input
                value={lon}
                onChange={e => setLon(e.target.value)}
                inputMode="decimal"
                className="mono"
              />
            </label>
            <button className="btn" type="submit">
              Evaluate coordinate
            </button>
            {err && <p className="warn small">{err}</p>}
          </form>
        </div>
      </div>
    </div>
  )
}
