// Pure geometry: no React, so it can be tested in node (scripts/crosscheck.mjs).
export const R_MOON_KM = 1737.4
// Apparent angular radii seen from the lunar surface (Sun ~0.27 deg, Earth ~0.95 deg).
export const SUN_RADIUS_DEG = 0.2666
export const EARTH_RADIUS_DEG = 0.95
const D2R = Math.PI / 180

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Local up/east/north unit vectors at a surface point (smooth sphere, MOON_ME frame, east-positive lon). */
export function siteFrame(latDeg, lonDeg) {
  const la = latDeg * D2R, lo = lonDeg * D2R
  return {
    up: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)],
    east: [-Math.sin(lo), Math.cos(lo), 0],
    north: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)],
  }
}

/** Azimuth (deg, clockwise from north) and elevation (deg) of a unit vector. */
export function azEl(v, f) {
  const x = dot(v, f.east), y = dot(v, f.north), z = dot(v, f.up)
  return {
    az: ((Math.atan2(x, y) / D2R) + 360) % 360,
    el: Math.asin(Math.max(-1, Math.min(1, z))) / D2R,
  }
}

/** Terrain horizon elevation at an azimuth, linearly interpolated, circular. */
export function maskAt(horizon, az) {
  const n = horizon.length
  const p = (((az % 360) + 360) % 360) * n / 360
  const i0 = Math.floor(p) % n, i1 = (i0 + 1) % n, f = p - Math.floor(p)
  return horizon[i0] * (1 - f) + horizon[i1] * f
}

/** Parse the compact ephemeris.json into typed arrays. */
export function parseEphemeris(raw) {
  const sun = Float64Array.from(raw.sunE5, v => v / 1e5)
  const earth = Float64Array.from(raw.earthKmE1, v => v / 10)
  return { n: raw.n, stepHours: raw.stepHours, t0Ms: Date.parse(raw.t0), rMoonKm: raw.rMoonKm, sun, earth }
}

/**
 * Per-hour Sun/Earth sky position and terrain visibility for one site.
 * margin = (elevation + disc radius) - terrain horizon at that azimuth; visible when margin > 0
 * (i.e. any part of the disc is above the horizon - matches how PGDA/LOLA illumination maps count Earth).
 */
export function buildSeries(eph, site) {
  const n = eph.n, f = siteFrame(site.lat, site.lon)
  const sunAz = new Float32Array(n), sunEl = new Float32Array(n)
  const earthAz = new Float32Array(n), earthEl = new Float32Array(n)
  const sunM = new Float32Array(n), earthM = new Float32Array(n)
  const sunLit = new Uint8Array(n), earthVis = new Uint8Array(n)
  const upKm = f.up.map(c => c * eph.rMoonKm)
  for (let i = 0; i < n; i++) {
    const s = [eph.sun[3 * i], eph.sun[3 * i + 1], eph.sun[3 * i + 2]]
    const a = azEl(s, f)
    sunAz[i] = a.az; sunEl[i] = a.el
    const e = [eph.earth[3 * i] - upKm[0], eph.earth[3 * i + 1] - upKm[1], eph.earth[3 * i + 2] - upKm[2]]
    const len = Math.hypot(e[0], e[1], e[2])      // includes ~0.26 deg Earth parallax at the pole
    const b = azEl([e[0] / len, e[1] / len, e[2] / len], f)
    earthAz[i] = b.az; earthEl[i] = b.el
    sunM[i] = a.el + SUN_RADIUS_DEG - maskAt(site.horizon, a.az)
    earthM[i] = b.el + EARTH_RADIUS_DEG - maskAt(site.horizon, b.az)
    sunLit[i] = sunM[i] > 0 ? 1 : 0
    earthVis[i] = earthM[i] > 0 ? 1 : 0
  }
  return { n, stepHours: eph.stepHours, sunAz, sunEl, earthAz, earthEl, sunM, earthM, sunLit, earthVis }
}
