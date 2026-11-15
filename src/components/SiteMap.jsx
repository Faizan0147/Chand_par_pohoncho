import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadOptional, useData, useKeepSearch, useScenario } from '../lib/data.jsx'
import { missionWindow, windowStats, works } from '../lib/metrics.js'
import { inBounds, insideView, niceLength, placeLabels, project, ringRadius, spreadMarkers, toPixel } from '../lib/polarMap.js'
import './SiteMap.css'

const RING_LATS = [-80, -82, -84, -86, -87, -88, -88.5, -89, -89.5, -89.8]
const fmtLat = l => `${Math.abs(l)}°S`
const fmtLon = l => (l === 0 ? '0°' : l === 180 ? '180°' : `${l}°E`)

/** South-polar shaded-relief map with the catalogue sites (M4). Lazy-loaded from the Sites page. */
export default function SiteMap() {
  const data = useData()
  const link = useKeepSearch()
  const nav = useNavigate()
  const [sc] = useScenario()
  const [meta, setMeta] = useState(undefined)
  const [psr, setPsr] = useState(undefined)
  const [viewId, setViewId] = useState('region')
  const [showPsr, setShowPsr] = useState(false)
  const [imgFailed, setImgFailed] = useState({})
  const [px, setPx] = useState(600)                       // rendered width in CSS px (for tap-size maths)
  const frame = useRef(null)

  useEffect(() => { loadOptional('map/map_meta').then(setMeta); loadOptional('map/psr').then(setPsr) }, [])
  useEffect(() => {
    if (!frame.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setPx(e.contentRect.width || 600))
    ro.observe(frame.current)
    return () => ro.disconnect()
  }, [meta])

  const sites = useMemo(() => {
    if (!meta || data.status !== 'ready') return []
    const [a, b] = missionWindow(data.eph, sc)
    return data.sites.map((s, i) => {
      const st = windowStats(data.getSeries(s), a, b)
      return { ...s, n: i + 1, xy: project(s.lat, s.lon, meta.projection), ok: works(st, sc) }
    })
  }, [meta, data, sc.d, sc.slip, sc.len, sc.bat, sc.earth]) // eslint-disable-line react-hooks/exhaustive-deps

  if (meta === undefined) return <p className="muted">Loading map…</p>
  if (meta === null || !meta.views?.length) {
    return <p className="panel">The map is not available in this build. Use <strong>Cards</strong> to pick a site.</p>
  }

  const view = meta.views.find(v => v.id === viewId) || meta.views[0]
  const poleView = meta.views.find(v => v.id === 'pole')
  const p = meta.projection
  const W = view.width, H = view.height
  const u = W / px                                         // view units per CSS pixel
  const dotR = 11 * u, hitR = 22 * u, font = 13 * u
  const psrOk = !!psr && meta.views.every(v => JSON.stringify(psr.map_views?.[v.id]) === JSON.stringify(v.bounds))
  const psrPath = psrOk && showPsr ? psr.views?.[view.id]?.d : null
  const verdict = s => (s.ok ? 'works' : 'fails')

  // which sites are drawn individually in this view, and which collapse into the "near the pole" box
  const clustered = view.id === 'region' && poleView ? sites.filter(s => inBounds(s.xy, poleView.bounds)) : []
  const inBox = new Set(clustered.map(s => s.id))
  const shown = sites
    .map(s => ({ ...s, pix: toPixel(s.xy, view) }))
    .filter(s => insideView(s.pix, view) && !inBox.has(s.id))
  const hidden = sites.filter(s => !insideView(toPixel(s.xy, view), view))
  let box = null
  if (clustered.length) {
    const [l, b, r, t] = poleView.bounds
    const [x0, y0] = toPixel([l, t], view), [x1, y1] = toPixel([r, b], view)
    const pad = Math.max(0, (44 * u - (x1 - x0)) / 2)        // at least a 44 px tap target
    box = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
  }
  // graticule: latitude rings (circles about the pole) and meridians every 30 degrees
  const [cx, cy] = toPixel([p.x0, p.y0], view)
  const scale = W / (view.bounds[2] - view.bounds[0])       // px per metre
  const rings = []
  for (const lat of RING_LATS) {
    const r = ringRadius(lat, p) * scale
    if (r < 0.1 * W || r > 0.7 * W || rings.some(q => Math.abs(q.r - r) < 0.09 * W)) continue
    rings.push({ lat, r })
  }
  const spokes = Array.from({ length: 12 }, (_, k) => k * 30)

  // marker layout: nudge apart markers that would overlap at this screen size (leader line to the true spot),
  // and give each a tap area of up to 44 px that never covers a neighbour
  const disp = spreadMarkers(shown.map(s => s.pix), 2 * dotR + 8 * u, { width: W, height: H, margin: dotR + 2 * u })
  shown.forEach((s, i) => {
    s.at = disp[i]
    const near = Math.min(Infinity, ...disp.filter((_, j) => j !== i).map(q => Math.hypot(q[0] - disp[i][0], q[1] - disp[i][1])))
    s.hitR = Math.max(dotR, Math.min(hitR, near / 2))
  })
  const lonFont = 11 * u
  const meridians = [
    { lon: 0, x: cx - 5 * u, y: 12 * u, anchor: 'end' },
    { lon: 180, x: cx - 5 * u, y: H - 12 * u, anchor: 'end' },
    { lon: 90, x: W - 8 * u, y: cy - 9 * u, anchor: 'end' },
    { lon: 270, x: 8 * u, y: cy - 9 * u, anchor: 'start' },
  ].map(m => {
    const w = fmtLon(m.lon).length * lonFont * 0.6, x0 = m.anchor === 'end' ? m.x - w : m.x
    return { ...m, box: { x0, x1: x0 + w, y0: m.y - lonFont * 0.6, y1: m.y + lonFont * 0.6 } }
  }).filter(m => !shown.some(s => s.at[0] + dotR + 4 * u > m.box.x0 && s.at[0] - dotR - 4 * u < m.box.x1 && s.at[1] + dotR > m.box.y0 && s.at[1] - dotR < m.box.y1))
  const clusterText = `${clustered.length} near the pole: zoom`
  const labels = placeLabels([
    ...(box ? [{ key: '__cluster', x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, r: (box.x1 - box.x0) / 2, text: clusterText }] : []),
    ...shown.map(s => ({ key: s.id, x: s.at[0], y: s.at[1], text: s.name })),
  ], { width: W, height: H, fontSize: font, dotR, obstacles: meridians.map(m => m.box) })
  const clusterLab = labels.get('__cluster')
  // latitude-ring labels are lowest priority: drop any that would sit under a marker or a site label
  const taken = shown.map(s => ({ x0: s.at[0] - dotR, x1: s.at[0] + dotR, y0: s.at[1] - dotR, y1: s.at[1] + dotR }))
  for (const [k, c] of labels) {
    const w = (k === '__cluster' ? clusterText : sites.find(s => s.id === k).name).length * font * 0.58
    const x0 = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2
    taken.push({ x0, x1: x0 + w, y0: c.y - font * 0.6, y1: c.y + font * 0.6 })
  }
  if (box) taken.push(box)
  const ringLabels = rings.map(q => {
    const x = cx + q.r * Math.SQRT1_2 + 3 * u, y = cy + q.r * Math.SQRT1_2 + 12 * u
    return { ...q, x, y, box: { x0: x, x1: x + 5 * lonFont * 0.6, y0: y - lonFont, y1: y + lonFont * 0.3 } }
  }).filter(q => !taken.some(b => b.x0 < q.box.x1 && b.x1 > q.box.x0 && b.y0 < q.box.y1 && b.y1 > q.box.y0))
  const spokeEnd = lon => { const [x, y] = toPixel(project(-60, lon, p), view); return [x, y] }
  const bar = niceLength((view.bounds[2] - view.bounds[0]) * 0.2)
  const go = (e, s) => { e.preventDefault(); nav(link(`/site/${s.id}`)) }
  const href = s => { const l = link(`/site/${s.id}`); return `#${l.pathname}${l.search}` }
  const imgSrc = view.file ? `${import.meta.env.BASE_URL}data/map/${view.file}` : null
  const showImg = imgSrc && !imgFailed[view.id]
  const built = (meta.generated_utc || '').slice(0, 10)

  return (
    <section className="sm" aria-label="Map of landing sites">
      {meta.placeholder && (
        <div className="banner" role="note"><strong>Placeholder map.</strong> No LOLA elevation image has been built yet, so the background is only a latitude/longitude grid, not terrain. Site positions are projected correctly. To add real shaded relief, run <code>pipeline/build_map.py</code> with a LOLA DEM (see README).</div>
      )}
      <div className="sm-bar">
        {meta.views.length > 1 && (
          <div className="viewtoggle sm-zoom" role="group" aria-label="Map area">
            {meta.views.map(v => <button key={v.id} type="button" aria-pressed={v.id === view.id} onClick={() => setViewId(v.id)}>{v.label}</button>)}
          </div>
        )}
        <label className={`check sm-psrtoggle${psrOk ? '' : ' off'}`}>
          <input type="checkbox" checked={psrOk && showPsr} disabled={!psrOk} onChange={e => setShowPsr(e.target.checked)} />
          Permanently shadowed regions
          {!psrOk && <span className="small"> (not built yet; see README)</span>}
        </label>
      </div>

      <div className="sm-frame" ref={frame}>
        {showImg && (
          <img src={imgSrc} width={W} height={H} loading="lazy" decoding="async" onError={() => setImgFailed(f => ({ ...f, [view.id]: true }))}
            alt={`Shaded-relief map of the lunar south pole (${view.label.toLowerCase()}), from NASA LRO LOLA elevation data. Lighting is artificial.`} />
        )}
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${view.label}: ${shown.length} site${shown.length === 1 ? '' : 's'} shown${clustered.length ? `, ${clustered.length} grouped near the pole` : ''}. The pole is at the centre, 0° longitude points up.`}>
          {psrPath && <path d={psrPath} className="sm-psr" aria-hidden="true" />}
          <g className="sm-grat" aria-hidden="true">
            {spokes.map(lon => { const [x, y] = spokeEnd(lon); return <line key={lon} x1={cx} y1={cy} x2={x} y2={y} /> })}
            {rings.map(q => <circle key={q.lat} cx={cx} cy={cy} r={q.r} />)}
          </g>
          <g className="sm-gratlabel" aria-hidden="true" style={{ fontSize: 11 * u, strokeWidth: 3 * u }}>
            {ringLabels.map(q => <text key={q.lat} x={q.x} y={q.y}>{fmtLat(q.lat)}</text>)}
            {/* meridian labels sit just left of / above their line at the frame edge, clear of markers on the line */}
            {meridians.map(m => <text key={m.lon} x={m.x} y={m.y} textAnchor={m.anchor} dominantBaseline="middle">{fmtLon(m.lon)}</text>)}
          </g>
          <g className="sm-scale" aria-hidden="true" style={{ fontSize: 11 * u }}>
            <rect x={14 * u} y={H - 22 * u} width={bar * scale} height={4 * u} />
            <text x={14 * u} y={H - 28 * u} strokeWidth={3 * u}>{bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}</text>
          </g>

          {box && (
            <g className="sm-cluster" role="button" tabIndex={0} aria-label={`Zoom in to the ${clustered.length} sites near the pole`}
              onClick={() => setViewId('pole')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewId('pole') } }}>
              <rect x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0} rx={4 * u} />
              {clustered.map(s => { const [x, y] = toPixel(s.xy, view); return <circle key={s.id} cx={x} cy={y} r={3.5 * u} className={`sm-mini ${verdict(s)}`} /> })}
              {clusterLab && <text x={clusterLab.x} y={clusterLab.y} textAnchor={clusterLab.anchor} dominantBaseline="middle" style={{ fontSize: font, strokeWidth: 3 * u }}>{clusterText}</text>}
            </g>
          )}

          {shown.map(s => {
            const [x, y] = s.at
            const moved = Math.hypot(x - s.pix[0], y - s.pix[1]) > u
            return (
              <a key={s.id} href={href(s)} className="sm-site" onClick={e => go(e, s)}
                aria-label={`${s.n}. ${s.name}: ${s.ok ? 'works' : 'fails'} for this scenario. Open site.`}>
                <title>{`${s.name} (${s.ok ? 'Works' : 'Fails'})`}</title>
                {moved && <line x1={s.pix[0]} y1={s.pix[1]} x2={x} y2={y} className="sm-leader" />}
                {moved && <circle cx={s.pix[0]} cy={s.pix[1]} r={2.5 * u} className="sm-true" />}
                <circle cx={x} cy={y} r={s.hitR} className="sm-hit" />
                {s.ok
                  ? <circle cx={x} cy={y} r={dotR} className="sm-dot ok" />
                  : <rect x={x - dotR * 0.9} y={y - dotR * 0.9} width={dotR * 1.8} height={dotR * 1.8} transform={`rotate(45 ${x} ${y})`} className="sm-dot bad" />}
                <text x={x} y={y} className="sm-num" style={{ fontSize: 11 * u }}>{s.n}</text>
                {labels.get(s.id) && <text x={labels.get(s.id).x} y={labels.get(s.id).y} textAnchor={labels.get(s.id).anchor} dominantBaseline="middle" className="sm-label" style={{ fontSize: font, strokeWidth: 3.5 * u }}>{s.name}</text>}
              </a>
            )
          })}
        </svg>
      </div>

      {hidden.length > 0 && (
        <p className="small muted">{hidden.length} site{hidden.length > 1 ? 's are' : ' is'} outside this view. <button type="button" className="linkbtn" onClick={() => setViewId('region')}>Show the whole region</button></p>
      )}

      <ol className="sm-legend" aria-label="Sites on the map">
        {sites.map(s => (
          <li key={s.id}>
            <span className={`sm-key ${verdict(s)}`} aria-hidden="true">{s.n}</span>
            <Link to={link(`/site/${s.id}`)}>{s.name}</Link>
            <span className={`badge ${s.ok ? 'ok' : 'bad'}`}>{s.ok ? 'Works' : 'Fails'}</span>
          </li>
        ))}
      </ol>

      <p className="small muted sm-credit">
        South polar stereographic projection (1737.4 km sphere, true scale at the pole): pole at the centre, 0° longitude up, 90°E right.{' '}
        {meta.placeholder
          ? 'Background: grid only (placeholder, no terrain).'
          : <>Shaded relief from NASA LRO LOLA elevation data ({meta.source?.dems?.map(d => `${d.file}, ${d.native_m_per_px} m/px`).join('; ')}; Barker et al. 2023), shown at {Math.round(view.m_per_px)} m per image pixel, built {built}. Light comes from the upper left for readability; it is not the real Sun.{view.coverage_pct < 100 && ' Black areas are outside the elevation model.'}</>}
        {' '}Circles = works, diamonds = fails for the current scenario. Markers are not to scale; where markers would overlap they are nudged apart, with a thin line to the true position.
        {/* shown whenever the layer exists (not only while it is on), so toggling it never reflows the page */}
        {psrOk && psr.views?.[view.id] && <> Blue (when the layer is on): permanently shadowed regions ≥ {psr.views[view.id].min_area_km2} km² ({psr.source.file}, LOLA-derived, Barker et al. 2023).</>}
        {imgSrc && imgFailed[view.id] && <> The map image failed to load.</>}
      </p>
    </section>
  )
}
