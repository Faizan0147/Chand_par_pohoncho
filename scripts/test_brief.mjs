// node scripts/test_brief.mjs : checks for the PDF Site Brief (M3)
// The brief must show the same numbers as the Site page, warn about non-real terrain, fit one page,
// and only use characters jsPDF's built-in fonts can print.
import fs from 'node:fs'
import { parseEphemeris, buildSeries } from '../src/lib/geometry.js'
import { windowStats, slipProfile, missionWindow, fmtHours, DEFAULTS } from '../src/lib/metrics.js'
import { verdict } from '../src/lib/explain.js'
import { briefContent, briefFileName, buildBriefDoc, pdfSafe } from '../src/lib/brief.js'

const eph = parseEphemeris(JSON.parse(fs.readFileSync('public/data/ephemeris.json', 'utf8')))
const sites = JSON.parse(fs.readFileSync('public/data/sites.json', 'utf8')).sites
const validation = fs.existsSync('public/data/validation.json') ? JSON.parse(fs.readFileSync('public/data/validation.json', 'utf8')) : null
let fail = 0
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? `  [${detail}]` : '')); if (!ok) fail++ }

function scenario(site, sc) {
  const series = buildSeries(eph, site)
  const [i0, i1] = missionWindow(eph, sc)
  const st = windowStats(series, i0, i1), sp = slipProfile(eph, series, sc), v = verdict(st, sc)
  return { site, sc, st, sp, v, eph, i0, i1, series, validation, url: 'http://localhost/#/site/x' }
}
// Text of every page, as the PDF viewer would extract it (uncompressed content streams).
async function pdfText(args) {
  const doc = await buildBriefDoc({ ...args, now: new Date(Date.UTC(2026, 10, 15)) })
  return { pages: doc.getNumberOfPages(), raw: doc.output() }
}

const scenarios = [
  ['default', DEFAULTS],
  ['slip + strict', { ...DEFAULTS, slip: 12, len: 14, bat: 10, earth: 80 }],
  ['late window', { ...DEFAULTS, d: '2027-11-20', slip: 5, len: 29 }],
]
let maxPages = 0, allNumbersFound = true, printed = true, missing = '', notPrinted = ''
for (const site of sites) {
  for (const [label, sc] of scenarios) {
    const a = scenario(site, sc)
    const b = briefContent(a)
    // numbers in the brief are the page's formulas applied to the same objects
    const want = [`${Math.round(a.st.sunlitPct)}%`, fmtHours(a.st.longestDarkH), `${Math.round(a.st.earthPct)}%`, fmtHours(a.st.longestGapH), `${Math.round(a.st.bothPct)}%`]
    const got = b.stats.map(s => s[1])
    if (JSON.stringify(want) !== JSON.stringify(got)) { allNumbersFound = false; missing = `${site.id}/${label}: ${got} vs ${want}` }
    if (b.verdict.ok !== a.v.ok || b.slip.tolerance !== a.sp.tolerance) { allNumbersFound = false; missing = `${site.id}/${label}: verdict/slip` }
    const { pages, raw } = await pdfText(a)
    maxPages = Math.max(maxPages, pages)
    for (const w of [...want, site.name.replace(/[()]/g, '\\$&')]) if (!raw.includes(w)) { printed = false; notPrinted = `${site.id}/${label}: "${w}" not in PDF` }
  }
}
check('brief stats, verdict and slip tolerance equal the Site page values (7 sites x 3 scenarios)', allNumbersFound, missing)
check('those values and the site name are printed in the PDF', printed, notPrinted)
check('brief fits on one A4 page', maxPages === 1, `max ${maxPages} page(s)`)

const real = scenario({ ...sites[0], terrain: 'LOLA DEM, observer 2 m' }, DEFAULTS)
const realRaw = (await pdfText(real)).raw
check('real-terrain brief has no synthetic warning', !/SYNTHETIC TERRAIN|NO TERRAIN/.test(realRaw))
check('brief carries the safety disclaimer', /not a guarantee of landing safety/.test(realRaw))
if (validation) check('brief quotes the JPL Horizons check', /JPL Horizons/.test(realRaw))

const synth = { ...sites[0], id: 'fake', terrain: 'synthetic-demo' }
check('synthetic-demo site: PDF says "SYNTHETIC TERRAIN"', /SYNTHETIC TERRAIN/.test((await pdfText(scenario(synth, DEFAULTS))).raw))
const flat = { ...sites[0], id: 'c_-89_0', name: 'Custom point', terrain: 'flat-sphere', horizon: new Array(360).fill(0) }
check('custom smooth-sphere point: PDF says "NO TERRAIN"', /NO TERRAIN/.test((await pdfText(scenario(flat, DEFAULTS))).raw))

const b = briefContent(real)
const allText = [b.title, b.verdict.text, b.slip.text, ...b.sentences, ...b.rows.flat(), b.terrain.label].join(' ')
check('no character in the brief text is lost by the PDF font (WinAnsi)', !pdfSafe(allText).includes('?') || allText.includes('?'))
check('file name is safe and names site + date', /^vesper-brief-[a-z0-9_-]+-\d{4}-\d{2}-\d{2}(-slip\d+)?\.pdf$/.test(briefFileName(sites[0], { ...DEFAULTS, slip: 3 })), briefFileName(sites[0], { ...DEFAULTS, slip: 3 }))

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED')
process.exit(fail ? 1 : 0)

