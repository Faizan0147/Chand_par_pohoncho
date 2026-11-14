// node scripts/test_map.mjs  (also run by `npm test`)
// Map layer (M4): lat/lon -> pixel conversion and the data files the map reads.
import fs from 'node:fs'
import { insideView, latLonToPixel, placeLabels, project, ringRadius, spreadMarkers, toPixel } from '../src/lib/polarMap.js'

let fail = 0
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? `  [${detail}]` : '')); if (!ok) fail++ }
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'))

const meta = read('public/data/map/map_meta.json')
const p = meta.projection
const appSites = read('public/data/sites.json').sites
const pipeSites = read('pipeline/sites.json').sites

// 1. projection basics
check('map_meta.json describes a south polar stereographic sphere', p.R > 1.7e6 && p.R < 1.8e6 && p.k0 > 0.9 && p.k0 <= 1, `R ${p.R} m, k0 ${p.k0}`)
for (const v of meta.views) {
  const [c, r] = latLonToPixel(-90, 0, meta, v)
  check(`south pole maps to the centre of the '${v.id}' view`, Math.abs(c - v.width / 2) < 1e-6 && Math.abs(r - v.height / 2) < 1e-6, `(${c.toFixed(3)}, ${r.toFixed(3)})`)
  check(`'${v.id}' view is square in metres per pixel`, Math.abs((v.bounds[2] - v.bounds[0]) / v.width - (v.bounds[3] - v.bounds[1]) / v.height) < 1e-9)
}
const [x80, y80] = project(-80, 0, p)
check('lat -80 lon 0 is straight up from the pole, 2R tan(5 deg) away', Math.abs(x80 - p.x0) < 1e-6 && Math.abs(y80 - p.y0 - 2 * p.R * p.k0 * Math.tan(5 * Math.PI / 180)) < 1e-3)
const [x90, y90] = project(-80, 90, p)
check('lon 90E points right (+x)', x90 - p.x0 > 3e5 && Math.abs(y90 - p.y0) < 1e-6)
const a = project(-85, 362, p), b = project(-85, 2, p), c2 = project(-85, -10, p), d2 = project(-85, 350, p)
check('longitude wraps (362 = 2, -10 = 350)', Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6 && Math.hypot(c2[0] - d2[0], c2[1] - d2[1]) < 1e-6)
check('latitude ring radius equals the projected distance from the pole', Math.abs(ringRadius(-88, p) - Math.hypot(...project(-88, 123, p).map((q, i) => q - [p.x0, p.y0][i]))) < 1e-6)
const reg = meta.views[0]
const [cR] = toPixel([reg.bounds[2], 0], reg), [, rT] = toPixel([0, reg.bounds[3]], reg)
check('view edges map to pixel edges (right = width, top = 0)', Math.abs(cR - reg.width) < 1e-9 && Math.abs(rT) < 1e-9)

// 2. JS formula vs pyproj (check points written by build_map.py from the DEM's CRS)
let worst = 0
for (const q of meta.check_points) {
  const [x, y] = project(q.lat, q.lon, p)
  worst = Math.max(worst, Math.hypot(x - q.x, y - q.y))
}
check(`JS projection matches pyproj at ${meta.check_points.length} check points (< 0.5 m)`, worst < 0.5, `worst ${worst.toExponential(2)} m`)

// 3. every site in sites.json lands inside the region image (both the app's file and the pipeline's)
for (const [label, list] of [['public/data/sites.json', appSites], ['pipeline/sites.json', pipeSites]]) {
  const out = list.filter(s => !insideView(latLonToPixel(s.lat, s.lon, meta, reg), reg, 4)).map(s => s.id)
  check(`every site in ${label} lands inside the '${reg.id}' image`, out.length === 0, out.length ? `outside: ${out.join(', ')}` : `${list.length} sites`)
}
const pole = meta.views.find(v => v.id === 'pole')
if (pole) {
  const ins = appSites.filter(s => insideView(latLonToPixel(s.lat, s.lon, meta, pole), pole, 4))
  check("'pole' view holds at least two sites", ins.length >= 2, ins.map(s => s.id).join(', '))
}

// 4. data files the map refers to
for (const v of meta.views) {
  if (meta.placeholder) { check(`placeholder build: '${v.id}' has no image`, v.file === null); continue }
  const f = `public/data/map/${v.file}`
  const ok = v.file && fs.existsSync(f)
  check(`'${v.id}' image exists and is <= 500 KB`, ok && fs.statSync(f).size <= 500 * 1024, ok ? `${(fs.statSync(f).size / 1024).toFixed(0)} KB` : 'missing')
}
check('real build names its source DEM and citation', meta.placeholder || (meta.source?.dems?.length > 0 && /Barker/.test(meta.source.citation)))
if (fs.existsSync('public/data/map/psr.json')) {
  const psr = read('public/data/map/psr.json')
  const same = meta.views.every(v => JSON.stringify(psr.map_views?.[v.id]) === JSON.stringify(v.bounds))
  check('psr.json was built for the current map views', same)
  check('psr.json records source and method', !!psr.source?.file && !!psr.method)
}

// 5. label placement never overlaps
const pts = Array.from({ length: 12 }, (_, i) => ({ key: i, x: 100 + (i % 4) * 40, y: 100 + Math.floor(i / 4) * 30, text: 'Label ' + i }))
const placed = placeLabels(pts, { width: 400, height: 400, fontSize: 12, dotR: 8 })
const boxes = [...placed.entries()].map(([k, c]) => {
  const w = pts[k].text.length * 12 * 0.58, x0 = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2
  return { x0, x1: x0 + w, y0: c.y - 6.9, y1: c.y + 6.9 }
})
const overlap = boxes.some((p1, i) => boxes.some((p2, j) => i < j && p1.x0 < p2.x1 && p1.x1 > p2.x0 && p1.y0 < p2.y1 && p1.y1 > p2.y0))
check('placed labels never overlap each other', !overlap, `${placed.size}/${pts.length} placed`)

// 6. overlapping markers are spread to a minimum distance; isolated ones stay put
const raw = [[100, 100], [104, 101], [100, 100], [300, 300]]
const sp = spreadMarkers(raw, 30, { width: 400, height: 400, margin: 10 })
let minD = Infinity
for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) minD = Math.min(minD, Math.hypot(sp[i][0] - sp[j][0], sp[i][1] - sp[j][1]))
check('overlapping markers end up >= the minimum distance apart', minD >= 30 - 1e-6, `min ${minD.toFixed(2)}`)
check('an isolated marker is not moved', sp[3][0] === 300 && sp[3][1] === 300)

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED')
process.exit(fail ? 1 : 0)
