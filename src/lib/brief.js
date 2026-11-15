// PDF Site Brief (M3): a one-page summary of the current scenario for one site.
// Every number comes from the same objects the Site page renders (windowStats, slipProfile,
// verdict), so the PDF cannot disagree with the screen. jsPDF is loaded only on click.
import { MAX_SLIP_DAYS, dateFromIdx, fmtDate, fmtHours } from './metrics.js'
import { bothSentence, earthSentence, slipSentence, sunSentence } from './explain.js'

// jsPDF's built-in fonts are WinAnsi (cp1252); swap characters outside it for plain text.
export const pdfSafe = s => String(s)
  .replace(/[→]/g, '->').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=')
  .replace(/[′]/g, "'").replace(/[″]/g, '"').replace(/[−]/g, '-')
  .replace(/[^\x00-\xff–—‘’“”•€]/g, '?')

const C = {
  ink: [20, 24, 32], muted: [95, 104, 120], line: [210, 214, 222],
  ok: [34, 139, 84], bad: [196, 52, 52], sun: [232, 172, 30], earth: [52, 120, 220], both: [40, 170, 110],
  warnBg: [255, 243, 205], warnInk: [120, 80, 0], dark: [228, 230, 236],
}

export function terrainStatus(site) {
  if (site.terrain === 'synthetic-demo') return { real: false, label: 'SYNTHETIC TERRAIN (placeholder horizon)', warn: 'This site uses a synthetic placeholder horizon, not real elevation data. Its percentages are illustrative, not predictions.' }
  if (site.terrain === 'flat-sphere') return { real: false, label: 'NO TERRAIN (smooth sphere)', warn: 'No terrain data for this point: the horizon is a smooth sphere, so real ridges and craters are NOT accounted for.' }
  return { real: true, label: `${site.terrain} (LRO LOLA elevation model)`, warn: null }
}

/** Plain-data summary of the brief; also used by the test so the numbers can be checked without a PDF. */
export function briefContent({ site, sc, st, sp, v, eph, i0 }) {
  const landing = dateFromIdx(eph, i0)
  return {
    title: site.name,
    terrain: terrainStatus(site),
    rows: [
      ['Site', `${site.kind} · ${site.lat.toFixed(2)}°, ${site.lon.toFixed(2)}°E`],
      ['Planned landing', fmtDate(new Date(`${sc.d}T00:00:00Z`)) + ' (UTC)'],
      ['Launch slip', `${sc.slip} day${sc.slip === 1 ? '' : 's'}${sc.slip ? ` -> lands ${fmtDate(landing)}` : ''}`],
      ['Stay on surface', `${sc.len} days`],
      ['Requirements', `battery rides through darkness up to ${sc.bat} h; Earth in view at least ${sc.earth}% of the stay`],
    ],
    verdict: {
      ok: v.ok,
      text: `${v.ok ? 'WORKS' : 'DOES NOT WORK'} for a ${sc.len}-day stay from ${fmtDate(landing)}` + (v.ok ? '' : ` - ${v.reasons.join('; ')}.`),
    },
    stats: [
      ['Sunlight', `${Math.round(st.sunlitPct)}%`, false],
      ['Longest night', fmtHours(st.longestDarkH), st.longestDarkH > sc.bat],
      ['Earth in view', `${Math.round(st.earthPct)}%`, st.earthPct < sc.earth],
      ['Longest comms gap', fmtHours(st.longestGapH), false],
      ['Power + Earth', `${Math.round(st.bothPct)}%`, false],
    ],
    sentences: [sunSentence(st, sc), earthSentence(st, sc), bothSentence(st)],
    slip: { text: slipSentence(sp, sc), cells: sp.cells, tolerance: sp.tolerance, status: sp.status },
  }
}

export function briefFileName(site, sc) {
  return `rimlight-brief-${site.id.replace(/[^a-z0-9_-]/gi, '_')}-${sc.d}${sc.slip ? `-slip${sc.slip}` : ''}.pdf`
}

/** Build the PDF and trigger the download. `validation` is public/data/validation.json or null. */
export async function downloadBrief(args) {
  const doc = await buildBriefDoc(args)
  doc.save(briefFileName(args.site, args.sc))
}

export async function buildBriefDoc({ site, sc, st, sp, v, eph, i0, i1, series, validation, url, now = new Date() }) {
  const { jsPDF } = await import('jspdf')
  const b = briefContent({ site, sc, st, sp, v, eph, i0 })
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `Rimlight Site Brief - ${site.name}`, subject: 'Lunar landing site brief', creator: 'Rimlight' })
  const W = 210, M = 16, CW = W - 2 * M
  let y = M

  const color = c => doc.setTextColor(...c)
  const text = (s, x, yy, o) => doc.text(pdfSafe(s), x, yy, o)
  const room = h => { if (y + h > 297 - 10) { doc.addPage(); y = M } }
  const para = (s, size = 9.5, c = C.ink, gap = 1.2) => {
    doc.setFontSize(size); color(c)
    const lines = doc.splitTextToSize(pdfSafe(s), CW)
    room(lines.length * size * 0.3528 * 1.25)
    doc.text(lines, M, y)
    y += lines.length * size * 0.3528 * 1.25 + gap
  }
  const heading = (s, need = 20) => { room(need); y += 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); color(C.ink); text(s, M, y); doc.setFont('helvetica', 'normal'); y += 5 }

  // Header
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); color(C.muted); text('RIMLIGHT SITE BRIEF', M, y)
  doc.setFont('helvetica', 'normal'); text(`Generated ${fmtDate(now, true)}`, W - M, y, { align: 'right' }); y += 8
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); color(C.ink); text(b.title, M, y); doc.setFont('helvetica', 'normal'); y += 7

  // Terrain status (warning box if not real)
  if (!b.terrain.real) {
    doc.setFontSize(9.5)
    const lines = doc.splitTextToSize(pdfSafe(b.terrain.warn), CW - 8)
    const h = 13 + (lines.length - 1) * 4.2
    doc.setFillColor(...C.warnBg); doc.setDrawColor(...C.warnInk); doc.roundedRect(M, y, CW, h, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold'); color(C.warnInk); text(b.terrain.label, M + 4, y + 5.5)
    doc.setFont('helvetica', 'normal'); doc.text(lines, M + 4, y + 10.5, { lineHeightFactor: 1.25 })
    y += h + 6
  }

  // Scenario table
  doc.setFontSize(9.5)
  for (const [k, val] of [...b.rows, ['Terrain', b.terrain.label]]) {
    color(C.muted); text(k, M, y)
    color(C.ink); const lines = doc.splitTextToSize(pdfSafe(val), CW - 38); doc.text(lines, M + 38, y)
    y += lines.length * 4.2 + 0.8
  }
  y += 2

  // Verdict banner
  doc.setFontSize(11)
  const vl = doc.splitTextToSize(pdfSafe(b.verdict.text), CW - 8)
  const vh = 5 + vl.length * 4.8
  doc.setFillColor(...(b.verdict.ok ? C.ok : C.bad)); doc.roundedRect(M, y, CW, vh, 2, 2, 'F')
  doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255); doc.text(vl, M + 4, y + 6)
  doc.setFont('helvetica', 'normal'); y += vh + 5

  // Stat tiles
  const tw = (CW - 4 * 3) / 5
  b.stats.forEach(([label, val, bad], k) => {
    const x = M + k * (tw + 3)
    doc.setDrawColor(...C.line); doc.roundedRect(x, y, tw, 17, 1.5, 1.5, 'S')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); color(bad ? C.bad : C.ink); text(val, x + 3, y + 8)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(C.muted); text(label, x + 3, y + 13.5)
  })
  y += 22

  // Whole-stay timeline (same hourly flags as the page)
  heading('Whole stay')
  const rows = [['Sunlight', series.sunLit, C.sun], ['Earth in view', series.earthVis, C.earth], ['Both', null, C.both]]
  const lx = M + 24, lw = CW - 24, rh = 4.2, n = i1 - i0
  rows.forEach(([label, flags, col], r) => {
    const yy = y + r * (rh + 1.6)
    doc.setFontSize(8); color(C.muted); text(label, M, yy + 3.2)
    doc.setFillColor(...C.dark); doc.rect(lx, yy, lw, rh, 'F')
    doc.setFillColor(...col)
    let start = -1
    for (let k = 0; k <= n; k++) {
      const on = k < n && (flags ? flags[i0 + k] : series.sunLit[i0 + k] & series.earthVis[i0 + k])
      if (on && start < 0) start = k
      if (!on && start >= 0) { doc.rect(lx + lw * start / n, yy, lw * (k - start) / n, rh, 'F'); start = -1 }
    }
  })
  y += 3 * (rh + 1.6)
  doc.setFontSize(7.5); color(C.muted)
  text(fmtDate(dateFromIdx(eph, i0)), lx, y + 2.5); text(fmtDate(dateFromIdx(eph, i1)), lx + lw, y + 2.5, { align: 'right' })
  text('coloured = yes, grey = no (hourly samples)', lx + lw / 2, y + 2.5, { align: 'center' })
  y += 8
  for (const s of b.sentences) para(`•  ${s}`, 9.5, C.ink, 0.6)

  // Slip strip
  heading('If the launch slips', 35)
  para(b.slip.text, 9.5)
  const cw = CW / (MAX_SLIP_DAYS + 1)
  b.slip.cells.forEach((c, d) => {
    const x = M + d * cw
    if (c === null) { doc.setFillColor(...C.dark) } else doc.setFillColor(...(c ? C.ok : C.bad))
    doc.rect(x + 0.3, y, cw - 0.6, 6, 'F')
    if (d === sc.slip) { doc.setDrawColor(...C.ink); doc.setLineWidth(0.6); doc.rect(x + 0.3, y, cw - 0.6, 6, 'S'); doc.setLineWidth(0.2) }
    if (d % 5 === 0) { doc.setFontSize(7); color(C.muted); text(String(d), x + cw / 2, y + 9.5, { align: 'center' }) }
  })
  y += 14
  para('Each box is one day of slip after the planned date (0 -> 30). Green: requirements met. Red: not met. Grey: beyond the data. Outlined: the slip in this brief.', 8, C.muted)

  // Terrain horizon profile
  heading('Terrain horizon from the site', 45)
  const hz = site.horizon
  const lo = Math.min(-2, Math.floor(Math.min(...hz))), hi = Math.max(4, Math.ceil(Math.max(...hz)) + 1)
  const ph = 26, px = M + 8, pw = CW - 8
  const Y = e => y + ph * (hi - e) / (hi - lo)
  doc.setDrawColor(...C.line); doc.rect(px, y, pw, ph, 'S')
  doc.setFontSize(7); color(C.muted)
  for (const e of [lo, 0, hi]) { text(`${e}°`, px - 1, Y(e) + 1, { align: 'right' }) }
  doc.setLineDashPattern([0.8, 0.8], 0); doc.line(px, Y(0), px + pw, Y(0)); doc.setLineDashPattern([], 0)
  doc.setDrawColor(...C.ink); doc.setLineWidth(0.35)
  for (let a = 0; a < 360; a++) doc.line(px + pw * a / 360, Y(hz[a]), px + pw * (a + 1) / 360, Y(hz[(a + 1) % 360]))
  doc.setLineWidth(0.2)
  ;['N 0°', 'E 90°', 'S 180°', 'W 270°', 'N 360°'].forEach((l, k) => text(l, px + pw * k / 4, y + ph + 3.5, { align: k === 0 ? 'left' : k === 4 ? 'right' : 'center' }))
  y += ph + 8
  para(`Elevation of the skyline above local horizontal, by azimuth (0 = north, clockwise), seen from 2 m above the surface. Range ${Math.min(...hz).toFixed(1)}° to ${Math.max(...hz).toFixed(1)}°.`, 8, C.muted)

  // Data, validation, disclaimer
  heading('Data and limits')
  let val = ''
  if (validation?.rows?.length) {
    const maxEl = Math.max(...validation.rows.map(r => r.elMaxAbsDeg)), maxAz = Math.max(...validation.rows.map(r => r.azMaxAbsDeg))
    val = ` Checked against NASA JPL Horizons (${validation.window}): largest difference ${maxEl.toFixed(4)}° in elevation, ${maxAz.toFixed(4)}° in azimuth.`
  }
  para(`Sun and Earth positions: NASA/JPL DE421 ephemeris, hourly samples, 1 Nov 2026 - 30 Dec 2027.${val} Terrain: LRO LOLA elevation models via NASA PGDA. "Lit" means the Sun's disc clears the terrain horizon; "Earth in view" means Earth's disc clears it.`, 8, C.muted)
  para('A comparison and planning aid, not a guarantee of landing safety or mission success. Earth in view is not the same as a working communications link (antenna pointing, link budget and ground stations are not modelled).', 8, C.ink)
  if (url) para(`Open this scenario: ${url}`, 7.5, C.earth)

  return doc
}
