// Mission metrics on top of the per-hour series. Pure functions (no React).
export const DEFAULTS = {
  d: '2026-12-15',   // planned landing date (UTC)
  slip: 0,           // launch slip in days
  len: 10,           // surface mission length in days
  bat: 30,           // battery hours the lander can ride through a dark spell
  earth: 50,         // minimum share of time Earth must be in view (%)
}
export const MAX_SLIP_DAYS = 30

function longestRun(flags, i0, i1, value) {
  let best = 0, cur = 0
  for (let i = i0; i < i1; i++) {
    if (flags[i] === value) { cur++; if (cur > best) best = cur } else cur = 0
  }
  return best
}

/** Stats for the sample window [i0, i1). Hours = samples * stepHours. */
export function windowStats(series, i0, i1) {
  const h = series.stepHours
  const a = Math.max(0, i0), b = Math.min(series.n, i1)
  const n = Math.max(0, b - a)
  if (n === 0) return null
  let sun = 0, earth = 0, both = 0
  for (let i = a; i < b; i++) {
    sun += series.sunLit[i]; earth += series.earthVis[i]; both += series.sunLit[i] & series.earthVis[i]
  }
  return {
    hours: n * h,
    sunlitPct: 100 * sun / n,
    earthPct: 100 * earth / n,
    bothPct: 100 * both / n,
    longestDarkH: longestRun(series.sunLit, a, b, 0) * h,
    longestGapH: longestRun(series.earthVis, a, b, 0) * h,
    complete: b - a === i1 - i0,
  }
}

export const works = (st, sc) => !!st && st.longestDarkH <= sc.bat && st.earthPct >= sc.earth

export function idxFromDate(eph, isoDate) {
  const ms = Date.parse(isoDate + 'T00:00:00Z')
  return Math.round((ms - eph.t0Ms) / (eph.stepHours * 3600e3))
}
export function dateFromIdx(eph, i) {
  return new Date(eph.t0Ms + i * eph.stepHours * 3600e3)
}

/** Window of the planned mission after applying the slip. */
export function missionWindow(eph, sc) {
  const perDay = 24 / eph.stepHours
  const i0 = idxFromDate(eph, sc.d) + Math.round(sc.slip * perDay)
  return [i0, i0 + Math.round(sc.len * perDay)]
}

/**
 * Slip tolerance: the largest whole-day delay D such that landing on planned date + 0..D days
 * ALL satisfy the requirements. Also returns one pass/fail cell per slip day (null = beyond data).
 */
export function slipProfile(eph, series, sc) {
  const perDay = 24 / eph.stepHours
  const base = idxFromDate(eph, sc.d)
  const len = Math.round(sc.len * perDay)
  const cells = []
  for (let d = 0; d <= MAX_SLIP_DAYS; d++) {
    const i0 = base + Math.round(d * perDay)
    if (i0 < 0 || i0 + len > series.n) { cells.push(null); continue }
    cells.push(works(windowStats(series, i0, i0 + len), sc))
  }
  let tolerance = 0, status = 'ok'
  if (cells[0] === false) status = 'fails-now'
  else {
    let d = 0
    while (d + 1 <= MAX_SLIP_DAYS && cells[d + 1] === true) d++
    tolerance = d
    if (d === MAX_SLIP_DAYS) status = 'never-fails'
    else if (cells[d + 1] === null) status = 'data-ends'
  }
  return { cells, tolerance, status }
}

/** Hours until the next lit<->dark change after sample i (interpolated inside the step). */
export function nextChange(margin, i, n, stepHours) {
  const lit = margin[i] > 0
  for (let j = i + 1; j < n; j++) {
    if ((margin[j] > 0) !== lit) {
      const a = margin[j - 1], b = margin[j]
      const frac = a === b ? 0 : a / (a - b)
      return { lit, hours: (j - 1 - i + frac) * stepHours }
    }
  }
  return { lit, hours: null }
}

export function fmtHours(h) {
  if (h == null) return 'beyond data'
  if (h < 1) return '< 1 h'
  if (h < 48) return `${Math.round(h)} h`
  const tot = Math.round(h), d = Math.floor(tot / 24), r = tot - d * 24
  return r ? `${d} d ${r} h` : `${d} d`
}
export const fmtDate = (dt, withTime = false) =>
  dt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'UTC' }) + (withTime ? ' UTC' : '')
