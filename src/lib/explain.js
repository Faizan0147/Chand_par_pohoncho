import { fmtHours } from './metrics.js'
import { maskAt } from './geometry.js'

const pct = v => `${Math.round(v)}%`

export function sunSentence(st, sc) {
  const dark = st.longestDarkH
  const tail = dark === 0 ? 'The Sun never sets in this window.'
    : dark > sc.bat ? `The longest night lasts ${fmtHours(dark)}, longer than your ${sc.bat} h battery.`
    : `The longest night lasts ${fmtHours(dark)}, which your ${sc.bat} h battery covers.`
  return `The Sun is above the local horizon for ${pct(st.sunlitPct)} of the stay. ${tail}`
}

export function earthSentence(st, sc) {
  const gap = st.longestGapH
  const tail = gap === 0 ? 'Earth is always in view.'
    : `The longest stretch without a line of sight to Earth is ${fmtHours(gap)}.`
  const need = st.earthPct >= sc.earth ? '' : ` That is below your ${sc.earth}% requirement.`
  return `Earth is in view for ${pct(st.earthPct)} of the stay. ${tail}${need}`
}

export function bothSentence(st) {
  return `For ${pct(st.bothPct)} of the stay the lander has both power and a direct line to Earth.`
}

export function verdict(st, sc) {
  const reasons = []
  if (st.longestDarkH > sc.bat) reasons.push(`darkness lasts ${fmtHours(st.longestDarkH)} (battery ${sc.bat} h)`)
  if (st.earthPct < sc.earth) reasons.push(`Earth is in view only ${pct(st.earthPct)} of the time (need ${sc.earth}%)`)
  return { ok: reasons.length === 0, reasons }
}

export function slipSentence(sp, sc) {
  if (sp.status === 'fails-now') return 'The plan already fails on the planned date, so there is no slip margin. Try another site or date.'
  if (sp.status === 'never-fails') return `Requirements are still met for every landing in the 30 days after the planned date.`
  const t = sp.tolerance
  const lead = `Landing on the planned date, or up to ${t} day${t === 1 ? '' : 's'} later, still meets your requirements; ${t + 1} days late does not.`
  return sp.status === 'data-ends' ? lead.replace('; ', ' (the data ends there); ') : lead
}

/** Why is the Sun / Earth hidden right now? Names the terrain azimuth and height responsible. */
export function whyHidden(label, vis, az, el, site, radius) {
  if (vis) return null
  const m = maskAt(site.horizon, az)
  if (el + radius <= 0) return `${label} is below the horizon at the moment (${el.toFixed(1)}°).`
  if (site.terrain === 'flat-sphere') return `${label} is below the smooth-sphere horizon (no terrain data for this point).`
  return `${label} is ${el.toFixed(1)}° above the geometric horizon, but terrain toward azimuth ${Math.round(az)}° rises to ${m.toFixed(1)}°, hiding it.`
}
