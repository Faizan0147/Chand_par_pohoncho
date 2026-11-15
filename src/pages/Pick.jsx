import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
    if (!(la >= -90 && la <= 90) || !(lo >= -180 && lo <= 360)) { setErr('Latitude must be −90…90 and longitude −180…360 (east positive).'); return }
    setErr('')
    nav({ ...link(`/site/c_${la}_${lo}`) })
  }

  return (
    <>
      <div className="intro">
        <h1>Will the Sun and Earth clear the horizon?</h1>
        <p>Pick a landing site. Rimlight shows what the sky looks like from there, when the Sun and Earth set, and how many days the launch can slip before the mission stops working.</p>
      </div>
      <ViewToggle value={view} onChange={setView} />
      {view === 'map' && <Suspense fallback={<p className="muted">Loading map…</p>}><SiteMap /></Suspense>}
      {view !== 'map' && <div className="cards">
        {data.sites.map(s => {
          const series = data.getSeries(s)
          const [a, b] = missionWindow(data.eph, sc)
          const st = windowStats(series, a, b)
          const prof = slipProfile(data.eph, series, sc)
          const ok = works(st, sc)
          return (
            <article className="card" key={s.id}>
              <header>
                <h3>{s.name}</h3>
                <span className={`badge ${ok ? 'ok' : 'bad'}`}>{ok ? 'Works' : 'Fails'}</span>
              </header>
              <p className="muted small">{s.kind} · {s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°E</p>
              {st && <p className="metrics"><span>☀ {Math.round(st.sunlitPct)}%</span><span>🌍 {Math.round(st.earthPct)}%</span><span>night {Math.round(st.longestDarkH)} h</span></p>}
              <p className="small">Slip tolerance: <strong>{prof.status === 'fails-now' ? 'none (fails now)' : prof.status === 'never-fails' ? '30+ days' : `${prof.tolerance} day${prof.tolerance === 1 ? '' : 's'}`}</strong></p>
              <SlipStrip cells={prof.cells} slip={sc.slip} />
              <footer>
                <Link className="btn primary" to={link(`/site/${s.id}`)}>Open</Link>
                <label className="check"><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} /> Compare</label>
              </footer>
            </article>
          )
        })}
      </div>}
      {selected.length > 0 && (
        <p><Link className="btn primary" to={{ ...link('/compare') }}>Compare {selected.length} selected site{selected.length > 1 ? 's' : ''} →</Link></p>
      )}

      <h2>Or enter coordinates</h2>
      <form className="panel customform" onSubmit={goCustom}>
        <label>Latitude (°) <input value={lat} onChange={e => setLat(e.target.value)} inputMode="decimal" /></label>
        <label>East longitude (°) <input value={lon} onChange={e => setLon(e.target.value)} inputMode="decimal" /></label>
        <button className="btn" type="submit">Show sky</button>
        <p className="muted small">Custom points have no terrain data yet, so their horizon is a smooth sphere: ridges are not accounted for.</p>
        {err && <p className="warn small">{err}</p>}
      </form>
    </>
  )
}
