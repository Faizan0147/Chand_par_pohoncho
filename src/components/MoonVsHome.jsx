import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import SunCalc from 'suncalc'
import { useWidth } from '../lib/useWidth.js'

export const CITIES = [
  { id: 'london', name: 'London', lat: 51.51, lon: -0.13 },
  { id: 'new-york', name: 'New York', lat: 40.71, lon: -74.0 },
  { id: 'karachi', name: 'Karachi', lat: 24.86, lon: 67.01 },
  { id: 'delhi', name: 'Delhi', lat: 28.61, lon: 77.21 },
  { id: 'cairo', name: 'Cairo', lat: 30.04, lon: 31.24 },
  { id: 'lagos', name: 'Lagos', lat: 6.52, lon: 3.38 },
  { id: 'tokyo', name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { id: 'sydney', name: 'Sydney', lat: -33.87, lon: 151.21 },
  { id: 'sao-paulo', name: 'São Paulo', lat: -23.55, lon: -46.63 },
  { id: 'reykjavik', name: 'Reykjavik', lat: 64.15, lon: -21.94 },
]
const DEFAULT_HOME = 'london'
const HOURS = 72

/** Resolve the `home` URL value: a preset id, or c_<lat>_<lon> for a custom place. */
export function resolveHome(v) {
  const hit = CITIES.find(c => c.id === v)
  if (hit) return hit
  const m = /^c_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/.exec(v || '')
  if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { id: v, name: `${(+m[1]).toFixed(1)}°, ${(+m[2]).toFixed(1)}°`, lat: +m[1], lon: +m[2], custom: true }
  return CITIES.find(c => c.id === DEFAULT_HOME)
}

/** Sun elevation (degrees, geometric, no refraction, flat horizon) at a place on Earth. */
export function homeSunElevation(date, lat, lon) {
  return SunCalc.getPosition(date, lat, lon).altitude * 180 / Math.PI
}

const H = 230, M = { l: 40, r: 12, t: 14, b: 28 }
const YMIN = -20, YMAX = 90

/** Your sky vs the lunar pole: Sun elevation over three days, drawn on the SAME 1:1 degree scale. */
export default function MoonVsHome({ site, series, eph, i0 }) {
  const [sp, setSp] = useSearchParams()
  const home = resolveHome(sp.get('home'))
  const [ref, boxW] = useWidth(920)
  const W = Math.max(280, boxW - 32)
  const n = Math.min(HOURS / series.stepHours, series.n - i0)

  const data = useMemo(() => {
    const out = []
    for (let k = 0; k < n; k++) {
      const idx = i0 + k
      out.push({ h: k * series.stepHours, t: eph.t0Ms + idx * series.stepHours * 3600e3, moon: series.sunEl[idx], lit: series.sunLit[idx] })
    }
    out.forEach(d => { d.home = homeSunElevation(new Date(d.t), home.lat, home.lon) })
    return out
  }, [n, i0, series, eph, home.lat, home.lon])

  if (n < 2) return null
  const x = h => M.l + (h / (HOURS)) * (W - M.l - M.r)
  const y = e => M.t + (1 - (e - YMIN) / (YMAX - YMIN)) * (H - M.t - M.b)
  const path = key => data.map((d, k) => `${k ? 'L' : 'M'}${x(d.h).toFixed(1)} ${y(d[key]).toFixed(1)}`).join('')
  const stats = key => {
    const v = data.map(d => d[key])
    return { max: Math.max(...v), up: (100 * v.filter(e => e > 0).length) / v.length }
  }
  const hs = stats('home'), ms = stats('moon')
  const litPct = (100 * data.filter(d => d.lit === 1).length) / data.length   // with the real terrain horizon
  const dayTicks = [0, 24, 48, 72].filter(h => h <= HOURS)
  const fmtDay = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const setHome = v => { const next = new URLSearchParams(sp); next.set('home', v); setSp(next, { replace: true }) }
  const customLat = home.custom ? home.lat : ''
  const customLon = home.custom ? home.lon : ''
  const setCustom = (la, lo) => {
    const a = Number(la), b = Number(lo)
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) setHome(`c_${a}_${b}`)
  }

  return (
    <section className="panel" ref={ref} aria-label="Moon versus home Sun comparison">
      <div className="mvh-head">
        <label>Compare with
          <select value={home.custom ? 'custom' : home.id} onChange={e => setHome(e.target.value === 'custom' ? `c_${home.lat}_${home.lon}` : e.target.value)}>
            {CITIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="custom">Other place…</option>
          </select>
        </label>
        {home.custom && (
          <>
            <label>Latitude <input type="number" step="0.01" min="-90" max="90" defaultValue={customLat} onBlur={e => setCustom(e.target.value, customLon)} /></label>
            <label>Longitude (E+) <input type="number" step="0.01" min="-180" max="180" defaultValue={customLon} onBlur={e => setCustom(customLat, e.target.value)} /></label>
          </>
        )}
      </div>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Sun elevation over three days. At ${home.name} it peaks at ${hs.max.toFixed(0)} degrees. At ${site.name} it peaks at ${ms.max.toFixed(1)} degrees.`}>
        <rect x={M.l} y={y(0)} width={W - M.l - M.r} height={y(YMIN) - y(0)} fill="#04060b" />
        {[-20, 0, 20, 40, 60, 80].map(t => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#4a566e' : '#1c2434'} strokeDasharray={t === 0 ? '5 4' : undefined} />
            <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="tick">{t}°</text>
          </g>
        ))}
        {dayTicks.map(h => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={M.t} y2={H - M.b} stroke="#161d2b" />
            <text x={x(h)} y={H - 9} textAnchor={h === 0 ? 'start' : h === HOURS ? 'end' : 'middle'} className="tick">{fmtDay(data[0].t + h * 3600e3)}</text>
          </g>
        ))}
        <defs><clipPath id="mvh-clip"><rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} /></clipPath></defs>
        <g clipPath="url(#mvh-clip)">
        <path d={path('home')} fill="none" stroke="#ff9f6b" strokeWidth="2.5" />
        <path d={path('moon')} fill="none" stroke="var(--sun)" strokeWidth="3" />
        </g>
        <text x={x(2)} y={y(hs.max) - 6} className="label" fill="#ff9f6b">{home.name}</text>
        <text x={W - M.r - 4} y={y(ms.max) - 8} textAnchor="end" className="label" fill="var(--sun)">{site.name}</text>
      </svg>

      <ul className="plain">
        <li><strong>{home.name}:</strong> {hs.up === 0 ? <>the Sun stays below the horizon for all three days (it peaks at {hs.max.toFixed(0)}°): polar night.</> : <>the Sun climbs to {hs.max.toFixed(0)}° and is above the horizon {Math.round(hs.up)}% of these three days{hs.up < 100 ? ', setting and rising every day' : ' (midnight Sun)'}.</>}</li>
        <li><strong>{site.name}:</strong> the Sun never gets above {ms.max.toFixed(1)}° and moves slowly around the horizon{ms.up > 90 ? ' instead of setting' : ''}, so a ridge of a degree or two decides whether it shines. With this site's terrain it is lit {Math.round(litPct)}% of these three days.</li>
      </ul>
      <p className="muted small">
        Both lines use the same real-degree scale (no stretching), time in UTC, a flat horizon and no atmospheric refraction. For the Moon, the line is the Sun's height above the smooth lunar sphere (before terrain);
        the percentage in the last sentence includes the terrain horizon. Earth-side values use SunCalc (open source).
      </p>
    </section>
  )
}
