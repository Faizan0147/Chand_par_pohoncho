import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Panorama from '../components/Panorama.jsx'
import Timeline from '../components/Timeline.jsx'
import SlipStrip from '../components/SlipStrip.jsx'
import MoonVsHome from '../components/MoonVsHome.jsx'
import BriefButton from '../components/BriefButton.jsx'
import { useData, useKeepSearch, useScenario } from '../lib/data.jsx'
import { SUN_RADIUS_DEG, EARTH_RADIUS_DEG } from '../lib/geometry.js'
import { dateFromIdx, fmtDate, fmtHours, missionWindow, nextChange, slipProfile, windowStats } from '../lib/metrics.js'
import { bothSentence, earthSentence, slipSentence, sunSentence, verdict, whyHidden } from '../lib/explain.js'

export default function Site() {
  const { id } = useParams()
  const data = useData()
  const link = useKeepSearch()
  if (data.status !== 'ready') return null
  const site = data.getSite(id)
  if (!site) return <div className="panel"><p>Unknown site “{id}”.</p><Link to={link('/')}>← Back to site list</Link></div>
  return <SiteView key={site.id} site={site} />
}

function Stat({ label, value, hint, tone }) {
  return <div className={`stat ${tone || ''}`}><div className="stat-v">{value}</div><div className="stat-l">{label}</div>{hint && <div className="muted small">{hint}</div>}</div>
}

function SiteView({ site }) {
  const data = useData()
  const link = useKeepSearch()
  const [sc, set] = useScenario()
  const { eph } = data
  const series = data.getSeries(site)
  const [i0, i1] = missionWindow(eph, sc)
  const [cursor, setCursor] = useState(i0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => { setCursor(i0) }, [i0, i1])
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setCursor(c => (c + 1 >= i1 ? i0 : c + 1)), 60)
    return () => clearInterval(t)
  }, [playing, i0, i1])

  const outOfData = i0 < 0 || i1 > series.n
  const i = Math.min(Math.max(cursor, i0, 0), Math.min(i1, series.n) - 1)
  const st = useMemo(() => windowStats(series, i0, i1), [series, i0, i1])
  const sp = useMemo(() => slipProfile(eph, series, sc), [eph, series, sc.d, sc.len, sc.bat, sc.earth])
  if (outOfData || !st) return <div className="panel"><p>That date range is outside the ephemeris data (1 Nov 2026 – 30 Dec 2027). Pick an earlier date or smaller slip.</p></div>

  const sunNext = nextChange(series.sunM, i, series.n, series.stepHours)
  const earthNext = nextChange(series.earthM, i, series.n, series.stepHours)
  const v = verdict(st, sc)
  const whySun = whyHidden('The Sun', series.sunLit[i], series.sunAz[i], series.sunEl[i], site, SUN_RADIUS_DEG)
  const whyEarth = whyHidden('Earth', series.earthVis[i], series.earthAz[i], series.earthEl[i], site, EARTH_RADIUS_DEG)

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{site.name}</h1>
          <p className="muted">{site.kind} · {site.lat.toFixed(2)}°, {site.lon.toFixed(2)}°E · terrain: <span className={site.terrain === 'synthetic-demo' || site.terrain === 'flat-sphere' ? 'warn' : ''}>{site.terrain === 'synthetic-demo' ? 'synthetic placeholder' : site.terrain === 'flat-sphere' ? 'none (smooth sphere)' : site.terrain}</span></p>
        </div>
        <div className="pagehead-actions">
          <Link className="btn" to={{ ...link('/compare'), search: addSite(link('/').search, site.id) }}>Compare this site</Link>
          <BriefButton site={site} sc={sc} st={st} sp={sp} v={v} eph={eph} i0={i0} i1={i1} series={series} />
        </div>
      </div>

      <div className={`verdict ${v.ok ? 'ok' : 'bad'}`} role="status">
        <strong>{v.ok ? 'Works' : 'Does not work'}</strong> for a {sc.len}-day stay from {fmtDate(dateFromIdx(eph, i0))}
        {sc.slip ? ` (planned date + ${sc.slip} d slip)` : ''}
        {!v.ok && <> — {v.reasons.join('; ')}.</>}
      </div>

      <div className="controls panel">
        <button type="button" className="btn" onClick={() => setPlaying(p => !p)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <input type="range" aria-label="Time within the mission window" min={i0} max={i1 - 1} value={i}
          onChange={e => { setPlaying(false); setCursor(Number(e.target.value)) }} />
        <span className="clock">{fmtDate(dateFromIdx(eph, i), true)}</span>
      </div>

      <Panorama site={site} series={series} i={i} />

      <div className="grid4">
        <Stat label="Sun elevation" value={`${series.sunEl[i].toFixed(1)}°`} tone={series.sunLit[i] ? 'ok' : 'bad'}
          hint={series.sunLit[i] ? 'above the terrain horizon' : 'hidden'} />
        <Stat label={sunNext.lit ? 'Sunset in' : 'Sunrise in'} value={fmtHours(sunNext.hours)} />
        <Stat label="Earth elevation" value={`${series.earthEl[i].toFixed(1)}°`} tone={series.earthVis[i] ? 'ok' : 'bad'}
          hint={series.earthVis[i] ? 'in view' : 'out of view'} />
        <Stat label={earthNext.lit ? 'Earthset in' : 'Earthrise in'} value={fmtHours(earthNext.hours)} />
      </div>
      {(whySun || whyEarth) && (
        <div className="panel why"><strong>Why?</strong> {[whySun, whyEarth].filter(Boolean).join(' ')}</div>
      )}

      <h2>Whole stay</h2>
      <Timeline series={series} i0={i0} i1={i1} i={i} onPick={c => { setPlaying(false); setCursor(c) }} t0Ms={eph.t0Ms} />
      <div className="grid5">
        <Stat label="Sunlight" value={`${Math.round(st.sunlitPct)}%`} />
        <Stat label="Longest night" value={fmtHours(st.longestDarkH)} tone={st.longestDarkH > sc.bat ? 'bad' : ''} />
        <Stat label="Earth in view" value={`${Math.round(st.earthPct)}%`} tone={st.earthPct < sc.earth ? 'bad' : ''} />
        <Stat label="Longest comms gap" value={fmtHours(st.longestGapH)} />
        <Stat label="Power + Earth" value={`${Math.round(st.bothPct)}%`} />
      </div>
      <ul className="plain">
        <li>{sunSentence(st, sc)}</li>
        <li>{earthSentence(st, sc)}</li>
        <li>{bothSentence(st)}</li>
      </ul>

      <h2>Moon vs. home</h2>
      <MoonVsHome site={site} series={series} eph={eph} i0={i0} />

      <h2>If the launch slips</h2>
      <div className="panel">
        <p>{slipSentence(sp, sc)}</p>
        <SlipStrip cells={sp.cells} slip={sc.slip} onPick={d => set({ slip: d })} />
        <p className="muted small">Each box is one day of slip (0 → 30). Green: requirements met. Red: not met. Outlined: the slip currently selected. Click a box to try it.</p>
      </div>
      {site.note && <p className="muted small">{site.note}</p>}
    </>
  )
}

function addSite(search, id) {
  const p = new URLSearchParams(search)
  const cur = (p.get('sites') || '').split(',').filter(Boolean)
  if (!cur.includes(id)) cur.push(id)
  p.set('sites', cur.slice(-3).join(','))
  return `?${p.toString()}`
}
