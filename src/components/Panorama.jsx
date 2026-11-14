import { scaleLinear } from 'd3-scale'
import { area } from 'd3-shape'
import { maskAt } from '../lib/geometry.js'

const W = 920, H = 360, M = { l: 44, r: 14, t: 14, b: 32 }

function trackPath(az, el, j0, j1, x, y) {
  let d = '', prev = null
  for (let j = j0; j <= j1; j++) {
    const px = x(az[j]), py = y(el[j])
    d += (prev === null || Math.abs(az[j] - prev) > 180 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)
    prev = az[j]
  }
  return d
}

/** 360-degree horizon panorama: terrain silhouette + Sun and Earth tracks at the chosen time. */
export default function Panorama({ site, series, i }) {
  const top = Math.max(10, Math.ceil((90 - Math.abs(site.lat) + 9) / 2) * 2)
  const bottom = -3
  const x = scaleLinear().domain([0, 360]).range([M.l, W - M.r])
  const y = scaleLinear().domain([bottom, top]).range([H - M.b, M.t])
  const mask = site.horizon
  const terrain = area().x((_, k) => x(k * 360 / mask.length)).y0(H - M.b).y1(d => y(Math.max(d, bottom)))([...mask, mask[0]])
  const j0 = Math.max(0, i - 48), j1 = Math.min(series.n - 1, i + 48)
  const stretch = Math.round(((H - M.t - M.b) / (top - bottom)) / ((W - M.l - M.r) / 360))

  const bodies = [
    { key: 'sun', label: 'Sun', color: 'var(--sun)', az: series.sunAz, el: series.sunEl, vis: series.sunLit[i], track: 'sun' },
    { key: 'earth', label: 'Earth', color: 'var(--earth)', az: series.earthAz, el: series.earthEl, vis: series.earthVis[i], track: 'earth' },
  ]
  const yTicks = y.ticks(6).filter(t => t >= bottom)

  return (
    <figure className="panel pano">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Horizon panorama for ${site.name}. Sun is ${series.sunLit[i] ? 'above' : 'hidden by'} the terrain horizon; Earth is ${series.earthVis[i] ? 'in view' : 'out of view'}.`}>
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="#04060b" />
        {yTicks.map(t => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#1c2434" strokeDasharray={t === 0 ? '5 4' : undefined} />
            <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="tick">{t}°</text>
          </g>
        ))}
        {[[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [360, 'N']].map(([a, l]) => (
          <g key={a}>
            <line x1={x(a)} x2={x(a)} y1={M.t} y2={H - M.b} stroke="#161d2b" />
            <text x={x(a)} y={H - 10} textAnchor="middle" className="tick strong">{l} {a}°</text>
          </g>
        ))}
        {/* tracks +-48 h around the chosen time */}
        {bodies.map(b => <path key={b.key + 't'} d={trackPath(b.az, b.el, j0, j1, x, y)} fill="none" stroke={b.color} strokeOpacity=".45" strokeWidth="1.5" />)}
        <path d={terrain} className="terrain" />
        {/* markers (sizes are NOT to scale) */}
        {bodies.map(b => {
          const cy = Math.min(Math.max(y(b.el[i]), M.t + 8), H - M.b - 8)
          const cx = x(b.az[i])
          const blocked = !b.vis
          const maskY = y(Math.max(maskAt(mask, b.az[i]), bottom))
          return (
            <g key={b.key}>
              {blocked && b.el[i] > bottom && <line x1={cx} x2={cx} y1={cy} y2={maskY} stroke="var(--bad)" strokeWidth="1.5" strokeDasharray="3 3" />}
              <circle cx={cx} cy={cy} r={b.key === 'sun' ? 9 : 8} fill={blocked ? '#0b0e14' : b.color} stroke={b.color} strokeWidth="2" />
              <text x={cx + 13} y={cy - 9} className="label" fill={b.color}>{b.label}{blocked ? ' (hidden)' : ''} {b.el[i].toFixed(1)}°</text>
            </g>
          )
        })}
        <text x={W - M.r} y={M.t - 4} textAnchor="end" className="tick">elevation above local horizontal</text>
      </svg>
      <figcaption className="muted small">
        Azimuth runs left to right from north. Vertical scale is stretched about ×{stretch} so a 1–2° ridge is visible; marker sizes are not to scale.
        Faint lines show the Sun and Earth tracks for 48 h either side of the chosen time.
        {site.terrain === 'synthetic-demo' && <strong className="warn"> Terrain shown is a synthetic placeholder.</strong>}
        {site.terrain === 'flat-sphere' && <strong className="warn"> No terrain data: horizon is a smooth sphere.</strong>}
      </figcaption>
    </figure>
  )
}
