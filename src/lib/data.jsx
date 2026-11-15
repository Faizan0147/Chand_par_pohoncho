import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { buildSeries, parseEphemeris } from './geometry.js'
import { DEFAULTS, MAX_SLIP_DAYS } from './metrics.js'

const DataCtx = createContext(null)
export const useData = () => useContext(DataCtx)

// The single-file preview build injects the data as window.__RIMLIGHT_DATA__
async function loadJson(name) {
  const inline = typeof window !== 'undefined' && window.__RIMLIGHT_DATA__
  if (inline) { if (inline[name]) return inline[name]; if (name === 'validation') throw new Error('no validation data') }
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`)
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`)
  return res.json()
}

/** Like loadJson but resolves to null when the file is absent (e.g. validation.json before it is generated). */
export async function loadOptional(name) {
  try { return await loadJson(name) } catch { return null }
}

export function DataProvider({ children }) {
  const [state, setState] = useState({ status: 'loading' })
  const cache = useRef(new Map())
  useEffect(() => {
    Promise.all([loadJson('ephemeris'), loadJson('sites')])
      .then(([e, s]) => setState({ status: 'ready', eph: parseEphemeris(e), sites: s.sites }))
      .catch(err => setState({ status: 'error', error: String(err) }))
  }, [])

  const api = useMemo(() => {
    if (state.status !== 'ready') return state
    const { eph, sites } = state
    const siteKey = s => `${s.id}|${s.lat}|${s.lon}|${s.terrain}`
    return {
      ...state,
      getSeries(site) {
        const k = siteKey(site)
        if (!cache.current.has(k)) cache.current.set(k, buildSeries(eph, site))
        return cache.current.get(k)
      },
      /** Resolve a route id: a catalogue id or a custom point written c_<lat>_<lon>. */
      getSite(id) {
        const hit = sites.find(s => s.id === id)
        if (hit) return hit
        const m = /^c_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/.exec(id || '')
        if (!m) return null
        const lat = Number(m[1]), lon = ((Number(m[2]) % 360) + 360) % 360
        if (!(lat >= -90 && lat <= 90)) return null
        return {
          id, name: `Custom point (${lat.toFixed(2)}°, ${lon.toFixed(2)}°E)`, kind: 'Custom coordinates',
          lat, lon, terrain: 'flat-sphere', note: 'No terrain data for this point: the horizon is a smooth sphere, so real ridges are NOT accounted for.',
          horizon: new Array(360).fill(0),
        }
      },
    }
  }, [state])
  return <DataCtx.Provider value={api}>{children}</DataCtx.Provider>
}

const clamp = (v, lo, hi, dflt) => {
  const x = Number(v)
  return Number.isFinite(x) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, x)) : dflt
}

/** Scenario (planned date, slip, mission length, requirements) lives in the URL so links are shareable. */
export function useScenario() {
  const [sp, setSp] = useSearchParams()
  const sc = {
    d: /^\d{4}-\d{2}-\d{2}$/.test(sp.get('d') || '') ? sp.get('d') : DEFAULTS.d,
    slip: Math.round(clamp(sp.get('slip'), 0, MAX_SLIP_DAYS, DEFAULTS.slip)),
    len: clamp(sp.get('len'), 1, 30, DEFAULTS.len),
    bat: clamp(sp.get('bat'), 1, 500, DEFAULTS.bat),
    earth: clamp(sp.get('earth'), 0, 100, DEFAULTS.earth),
  }
  const set = patch => {
    const next = new URLSearchParams(sp)
    Object.entries(patch).forEach(([k, v]) => next.set(k, String(v)))
    setSp(next, { replace: true })
  }
  return [sc, set]
}

/** Keep the scenario when navigating between pages, cleanly splitting pathname and search parameters. */
export function useKeepSearch() {
  const { search } = useLocation()
  return to => {
    if (typeof to === 'string') {
      const [pathname, q] = to.split('?')
      const nextSearch = new URLSearchParams(search)
      if (q) {
        new URLSearchParams(q).forEach((val, key) => nextSearch.set(key, val))
      }
      const s = nextSearch.toString()
      return { pathname, search: s ? `?${s}` : '' }
    }
    return { ...to, search: to.search ?? search }
  }
}
