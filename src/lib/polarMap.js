// South polar stereographic helpers for the Sites-page map (module M4).
// The projection parameters come from public/data/map/map_meta.json, which pipeline/build_map.py
// derives from the DEM's own CRS; scripts/test_map.mjs checks this file against pyproj.

const D2R = Math.PI / 180

/** lat/lon (deg, east-positive) -> projected metres [x, y] (x right, y up). South polar aspect only. */
export function project(lat, lon, p) {
  const rho = 2 * p.R * p.k0 * Math.tan(Math.PI / 4 + (lat * D2R) / 2)
  const a = (lon - p.lon0) * D2R
  return [p.x0 + rho * Math.sin(a), p.y0 + rho * Math.cos(a)]
}

/** Projected metres -> pixel [col, row] in a view (bounds = [left, bottom, right, top]). */
export function toPixel([x, y], view) {
  const [l, b, r, t] = view.bounds
  return [((x - l) / (r - l)) * view.width, ((t - y) / (t - b)) * view.height]
}

export const latLonToPixel = (lat, lon, meta, view) => toPixel(project(lat, lon, meta.projection), view)

export const insideView = ([c, r], view, pad = 0) => c >= pad && r >= pad && c <= view.width - pad && r <= view.height - pad

/** Distance from the pole in metres for a latitude (for drawing latitude rings, which are circles). */
export const ringRadius = (lat, p) => 2 * p.R * p.k0 * Math.tan(Math.PI / 4 + (lat * D2R) / 2)

/** True if the projected point lies inside another view's bounds (used to collapse the polar cluster). */
export function inBounds([x, y], bounds) {
  const [l, b, r, t] = bounds
  return x >= l && x <= r && y >= b && y <= t
}

/**
 * Greedy label placement. points: [{key, x, y, text}] in view units; returns Map key -> {x, y, anchor}
 * (or no entry when a label cannot be placed without overlapping a dot, another label or the edge).
 * charW/fontSize are in view units so the result follows the on-screen scale.
 */
export function placeLabels(points, { width, height, fontSize, dotR, obstacles = [] }) {
  const charW = fontSize * 0.58, h = fontSize * 1.15
  const rOf = p => p.r ?? dotR
  const boxes = points.map(p => ({ x0: p.x - rOf(p), y0: p.y - rOf(p), x1: p.x + rOf(p), y1: p.y + rOf(p) })).concat(obstacles)
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
  const out = new Map()
  for (const p of points) {
    const w = p.text.length * charW, gap = rOf(p) + fontSize * 0.35
    const cands = [
      { x: p.x + gap, y: p.y, anchor: 'start' }, { x: p.x - gap, y: p.y, anchor: 'end' },
      { x: p.x, y: p.y - gap - h / 2, anchor: 'middle' }, { x: p.x, y: p.y + gap + h / 2, anchor: 'middle' },
      { x: p.x + gap * 0.8, y: p.y - gap, anchor: 'start' }, { x: p.x + gap * 0.8, y: p.y + gap, anchor: 'start' },
      { x: p.x - gap * 0.8, y: p.y - gap, anchor: 'end' }, { x: p.x - gap * 0.8, y: p.y + gap, anchor: 'end' },
    ]
    for (const c of cands) {
      const x0 = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2
      const box = { x0, y0: c.y - h / 2, x1: x0 + w, y1: c.y + h / 2 }
      if (box.x0 < 2 || box.y0 < 2 || box.x1 > width - 2 || box.y1 > height - 2) continue
      if (boxes.some(b => hit(b, box))) continue
      boxes.push(box)
      out.set(p.key, c)
      break
    }
  }
  return out
}

/**
 * Nudge markers apart so none is closer than minDist (view units) to another; returns new [x, y]
 * positions in the same order. Markers that are already far enough apart do not move. Callers draw
 * a leader line from the true position to the displayed one.
 */
export function spreadMarkers(pts, minDist, { width, height, margin = 0, iterations = 80 } = {}) {
  const at = pts.map(([x, y]) => [x, y])
  for (let it = 0; it < iterations; it++) {
    let moved = false
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        let dx = at[j][0] - at[i][0], dy = at[j][1] - at[i][1]
        let d = Math.hypot(dx, dy)
        if (d >= minDist - 1e-9) continue
        if (d < 1e-9) { dx = Math.cos(j * 2.4); dy = Math.sin(j * 2.4); d = 1 }   // identical points: deterministic split
        const push = (minDist - d) / 2 + 1e-6
        at[i][0] -= (dx / d) * push; at[i][1] -= (dy / d) * push
        at[j][0] += (dx / d) * push; at[j][1] += (dy / d) * push
        moved = true
      }
    }
    for (const q of at) {
      q[0] = Math.min(width - margin, Math.max(margin, q[0]))
      q[1] = Math.min(height - margin, Math.max(margin, q[1]))
    }
    if (!moved) break
  }
  return at
}

/** "nice" scale-bar length (metres) close to a target length. */
export function niceLength(target) {
  const e = 10 ** Math.floor(Math.log10(target))
  const m = target / e
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e
}
