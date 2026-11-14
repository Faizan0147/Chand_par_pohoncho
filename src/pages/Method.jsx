import { useEffect, useState } from 'react'
import { loadOptional, useData } from '../lib/data.jsx'
import { EARTH_RADIUS_DEG, SUN_RADIUS_DEG } from '../lib/geometry.js'

export default function Method() {
  const data = useData()
  const [val, setVal] = useState(undefined)
  useEffect(() => { loadOptional('validation').then(setVal) }, [])
  const demo = data.status === 'ready' && data.sites.some(s => s.terrain === 'synthetic-demo')
  return (
    <div className="prose">
      <h1>How Rimlight works</h1>

      <h2>What it does</h2>
      <p>For a landing site and date it computes where the Sun and Earth are in the lunar sky every hour, compares them with the terrain horizon, and reports when each is visible. From that it derives sunlight share, longest night, Earth-in-view share, longest communications gap, and how many days the launch can slip before your requirements fail.</p>

      <h2>Method</h2>
      <ul>
        <li><strong>Sun and Earth positions:</strong> NASA/JPL DE421 ephemeris (Sun, Moon, Earth–Moon barycentre), with the Moon's orientation from the DE421 libration angles. Everything is expressed in the Moon's mean-Earth/polar-axis frame, so libration and the Moon's orbital variations are included. Earth is placed relative to the site, so the ~0.26° parallax near the pole is included.</li>
        <li><strong>Visible means:</strong> any part of the disc is above the terrain horizon (Sun radius {SUN_RADIUS_DEG}°, Earth radius {EARTH_RADIUS_DEG}°). For radio links this is slightly optimistic: a real antenna needs clearance.</li>
        <li><strong>Terrain horizon:</strong> 360 azimuth samples per site from a ray-march over a lunar elevation model (exact spherical geometry, no atmospheric refraction). The ray-march code is tested; see below for what data is currently loaded.</li>
        <li><strong>Slip tolerance:</strong> the largest whole-day delay D such that landing on the planned date and on each of the following D days all meet your requirements. Lunar conditions repeat, so a site that fails at 5 days late may work again at 12; the 0–30 day strip shows every day.</li>
        <li><strong>“Works”</strong> means the longest darkness is within your battery hours <em>and</em> Earth is in view at least your required share of the time. Both numbers are yours to set under Requirements.</li>
      </ul>

      {demo && (
        <div className="banner">
          <strong>Terrain in this build is a placeholder.</strong> The Sun/Earth geometry is real, but the site horizons are synthetic ridges, so sunlight and Earth-visibility percentages are illustrative only. Replace them with horizons computed from LRO LOLA elevation models (see README: add <code>pipeline/dem/&lt;site-id&gt;.tif</code> and rerun <code>build_data.py</code>).
        </div>
      )}

      <h2>Validation</h2>
      <p>Checks run during development (offline): the Moon's pole direction matches the IAU rotation model; the long-run mean Earth direction sits at 0°, 0° in the mean-Earth frame (to ~0.006°); libration extremes (±8° longitude, ±7° latitude) match the known ranges; a published worked example (Meeus, Astronomical Algorithms 53.a) agrees to ~0.03°; the terrain ray-marcher reproduces a synthetic mountain's elevation angle to 0.03°; and the JavaScript matches the Python numbers to 0.0003°.</p>
      {val === undefined ? <p className="muted">Checking for Horizons comparison…</p> : val === null ? (
        <p><strong>JPL Horizons comparison: not yet run.</strong> Run <code>python pipeline/validate_horizons.py</code> with internet access; it writes the comparison table shown here.</p>
      ) : (
        <>
          <p>Comparison with JPL Horizons, {val.window}:</p>
          <table className="cmp"><thead><tr><th>Site</th><th>Body</th><th>Max elevation diff</th><th>RMS elevation diff</th><th>Max azimuth diff</th></tr></thead>
            <tbody>{val.rows.map((r, k) => <tr key={k}><td>{r.site}</td><td>{r.body}</td><td>{r.elMaxAbsDeg.toFixed(4)}°</td><td>{r.elRmsDeg.toFixed(4)}°</td><td>{r.azMaxAbsDeg.toFixed(3)}°</td></tr>)}</tbody></table>
        </>
      )}

      <h2>Limits</h2>
      <ul>
        <li>A comparison and planning aid, not a guarantee of landing safety or mission success.</li>
        <li>Earth in view is not the same as a working communications link (antenna pointing, link budget, ground-station visibility are not modelled).</li>
        <li>Not modelled: light-time/aberration (&lt; 0.01°), terrain-height uncertainty, shadows from boulders, observer height other than the value used to build the horizon.</li>
        <li>Ephemeris covers 1 Nov 2026 – 30 Dec 2027 at one-hour steps.</li>
        <li>Site coordinates are region centres or LROC-derived fixes, not landing ellipses.</li>
      </ul>

      <h2>Data and credits</h2>
      <ul>
        <li>NASA/JPL Solar System Dynamics: DE421 planetary ephemeris and lunar libration.</li>
        <li>NASA JPL Horizons System: validation reference.</li>
        <li>LRO LOLA lunar elevation models (NASA PDS / PGDA): terrain horizon source.</li>
        <li>Site positions: NASA Lunar Surface Data Book regions and LROC landing-site imagery (verify before citing).</li>
      </ul>
    </div>
  )
}
