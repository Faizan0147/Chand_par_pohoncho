/**
 * Shackleton Rim's LOLA horizon (public/data/sites.json), max-pooled into 8° azimuth bins:
 * degrees of terrain elevation, starting at azimuth 0°. Baked in so the loader and the hero
 * can draw it before any data has been fetched.
 */
export const HORIZON = [-1.8, -0.9, -0.5, 0.7, 1.4, 1.4, -0.4, -1.1, -1.1, -1.5, -4.3, -6.3, -7.6, -8.2, -6.4, -4, -2, 0, 1.4, 2.2, 2.3, 1.6, 0.1, -0.2, -0.5, -1.2, -2.4, -3.4, -3.5, -3.1, -2.8, -2.9, -3.9, -4.9, -5.8, -2.9, -2.7, -2.6, -2.9, -2.3, -1.5, 0.8, 0.9, 0.3, -1]

export const BIN = 360 / HORIZON.length

/** Terrain elevation (deg) at any azimuth, linearly interpolated between bins. */
export const horizonAt = az => {
  const f = (((az % 360) + 360) % 360) / BIN
  const i = Math.floor(f), t = f - i
  return HORIZON[i % HORIZON.length] * (1 - t) + HORIZON[(i + 1) % HORIZON.length] * t
}
