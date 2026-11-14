// node scripts/crosscheck.mjs
// 1) JS az/el must reproduce the Python reference values (pipeline/tests/reference.json)
// 2) basic invariants of the metrics code
import fs from 'node:fs'
import { parseEphemeris, buildSeries } from '../src/lib/geometry.js'
import { windowStats, slipProfile, nextChange, works, DEFAULTS } from '../src/lib/metrics.js'

const eph = parseEphemeris(JSON.parse(fs.readFileSync('public/data/ephemeris.json', 'utf8')))
const sites = JSON.parse(fs.readFileSync('public/data/sites.json', 'utf8')).sites
const ref = JSON.parse(fs.readFileSync('pipeline/tests/reference.json', 'utf8'))
let fail = 0
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? `  [${detail}]` : '')); if (!ok) fail++ }

// 1. cross-check against Python (smooth horizon so use zero mask; elevations are independent of terrain)
let worst = 0
for (const s of sites) {
  const flat = { ...s, horizon: new Array(360).fill(0) }
  const ser = buildSeries(eph, flat)
  for (const r of ref[s.id]) {
    const d = [ser.sunEl[r.i] - r.sunEl, ser.earthEl[r.i] - r.earthEl]
    const da = [ser.sunAz[r.i] - r.sunAz, ser.earthAz[r.i] - r.earthAz].map(x => Math.abs(((x + 540) % 360) - 180))
    worst = Math.max(worst, ...d.map(Math.abs), ...da)
  }
}
check('JS az/el matches Python reference (< 0.001 deg, quantisation of stored data)', worst < 0.001, `worst ${worst.toExponential(2)} deg`)

// 2. invariants
const s0 = sites[0], ser = buildSeries(eph, s0)
const i0 = 24 * 30, len = 24 * 10
const st = windowStats(ser, i0, i0 + len)
check('stats percentages within 0..100', st.sunlitPct >= 0 && st.sunlitPct <= 100 && st.earthPct >= 0 && st.earthPct <= 100)
check('both% <= min(sun%, earth%)', st.bothPct <= Math.min(st.sunlitPct, st.earthPct) + 1e-9)
check('longest dark <= window hours', st.longestDarkH <= st.hours)
const sp = slipProfile(eph, ser, DEFAULTS)
check('slip profile has 31 cells', sp.cells.length === 31)
if (sp.status === 'ok' || sp.status === 'data-ends') {
  check('tolerance consistent with cells', sp.cells.slice(0, sp.tolerance + 1).every(c => c === true) && sp.cells[sp.tolerance + 1] !== true)
}
// countdown: next change must flip the lit state shortly after
let flipOk = true
for (let i = 100; i < 4000; i += 37) {
  const c = nextChange(ser.sunM, i, ser.n, 1)
  if (c.hours != null) {
    const j = i + Math.ceil(c.hours) + 1
    if (j < ser.n && (ser.sunM[j] > 0) === c.lit && Math.abs(ser.sunM[j]) > 1e-6) { flipOk = false; break }
  }
}
check('countdown lands on a state change', flipOk)
// terrain with a 0-degree mask must give a flat-horizon Sun at the pole almost half the time lit
const flatSer = buildSeries(eph, { ...sites[1], horizon: new Array(360).fill(0) })
const fl = windowStats(flatSer, 0, flatSer.n)
check('pole smooth-sphere Sun lit 40-65% (disc extends above)', fl.sunlitPct > 40 && fl.sunlitPct < 65, `${fl.sunlitPct.toFixed(1)}%`)
console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED')
process.exit(fail ? 1 : 0)
