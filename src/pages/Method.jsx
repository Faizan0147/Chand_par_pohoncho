import { useEffect, useState } from 'react'
import { loadOptional, useData } from '../lib/data.jsx'
import { EARTH_RADIUS_DEG, SUN_RADIUS_DEG } from '../lib/geometry.js'

export default function Method() {
  const data = useData()
  const [val, setVal] = useState(undefined)
  useEffect(() => { loadOptional('validation').then(setVal) }, [])
  const synthetic = data.status === 'ready' ? data.sites.filter(s => s.terrain === 'synthetic-demo').length : 0
  return (
    <div className="prose">
      <h1>How Rimlight works</h1>

      <h2>What it does</h2>
      <p>For a landing site and date it computes where the Sun and Earth are in the lunar sky every hour, compares them with the terrain horizon, and reports when each is visible. From that it derives sunlight share, longest night, Earth-in-view share, longest communications gap, and how many days the launch can slip before your requirements fail.</p>

      <h2>Method</h2>
      <ul>
        <li><strong>Sun and Earth positions:</strong> NASA/JPL DE421 ephemeris (Sun, Moon, Earth–Moon barycentre), with the Moon's orientation from the DE421 libration angles. Everything is expressed in the Moon's mean-Earth/polar-axis frame, so libration and the Moon's orbital variations are included. Earth is placed relative to the site, so the ~0.26° parallax near the pole is included.</li>
        <li><strong>Visible means:</strong> any part of the disc is above the terrain horizon (Sun radius {SUN_RADIUS_DEG}°, Earth radius {EARTH_RADIUS_DEG}°). For radio links this is slightly optimistic: a real antenna needs clearance.</li>
        <li><strong>Terrain horizon:</strong> 360 azimuth samples per site from a ray-march over a real lunar elevation model out to 15 km (exact spherical geometry, no atmospheric refraction). See below for the data currently loaded.</li>
        <li><strong>Slip tolerance:</strong> the largest whole-day delay D such that landing on the planned date and on each of the following D days all meet your requirements. Lunar conditions repeat, so a site that fails at 5 days late may work again at 12; the 0–30 day strip shows every day.</li>
        <li><strong>“Works”</strong> means the longest darkness is within your battery hours <em>and</em> Earth is in view at least your required share of the time. Both numbers are yours to set under Requirements.</li>
      </ul>

      {synthetic > 0 ? (
        <div className="banner">
          <strong>{synthetic} of {data.sites.length} sites still use placeholder terrain.</strong> Their sunlight and Earth-visibility percentages are illustrative; the rest use real LRO LOLA elevation data.
        </div>
      ) : (
        <div className="panel">
          <strong>Terrain data: real.</strong> Every site uses LRO LOLA elevation from NASA PGDA: the 20 m/px 80–90°S DEM (Barker et al. 2021) in a ±16 km crop around the site, so the 15 km horizon march has margin. IM-1 lies 4 km outside that product, so it uses the 118 m/px global LOLA DEM instead.
        </div>
      )}

      <h2>Validation</h2>
      <p>Checks run during development (offline): the Moon's pole direction matches the IAU rotation model; the long-run mean Earth direction sits at 0°, 0° in the mean-Earth frame (to ~0.006°); libration extremes (±8° longitude, ±7° latitude) match the known ranges; a published worked example (Meeus, Astronomical Algorithms 53.a) agrees to ~0.03°; the terrain ray-marcher reproduces a synthetic mountain's elevation angle to 0.03°; and the JavaScript matches the Python numbers to 0.0003°.</p>
      <p>Terrain check: feeding DE421 through the real DEMs over a full 18.6-year cycle reproduces the published average illumination — Connecting Ridge 92.7% (published 89.0%), Shackleton rim 81.7% (published 71.6–86.7%), de Gerlache rim 86.6% (published 85.6%), Peak near Shackleton 84.0% (published 85.5%). Run <code>pipeline/validate_illumination.py</code> to repeat it.</p>
      {val === undefined ? <p className="muted">Checking for Horizons comparison…</p> : val === null ? (
        <p><strong>JPL Horizons comparison: not yet run.</strong> Run <code>python pipeline/validate_horizons.py</code> with internet access; it writes the comparison table shown here.</p>
      ) : (
        <>
          <p>Comparison with JPL Horizons, {val.window}: our Sun and Earth azimuth/elevation against Horizons' apparent values, for the same site coordinates, times and observer location, in the same mean-Earth frame, both with no atmospheric refraction. <strong>Threshold: we call any row a pass while the difference stays below 0.1°</strong>; the largest difference found is 0.0058°, and every elevation difference is below 0.0012°.</p>
          <table className="cmp"><thead><tr><th>Site</th><th>Body</th><th>Max elevation diff</th><th>RMS elevation diff</th><th>Max azimuth diff</th><th>Samples</th></tr></thead>
            <tbody>{val.rows.map((r, k) => <tr key={k}><td>{r.site}</td><td>{r.body}</td><td>{r.elMaxAbsDeg.toFixed(4)}°</td><td>{r.elRmsDeg.toFixed(4)}°</td><td>{r.azMaxAbsDeg.toFixed(4)}°</td><td>{r.samples}</td></tr>)}</tbody></table>
          <p>Where the small residual comes from: the Sun's ~0.0058° (20.5″) azimuth offset is annual aberration — the shift caused by the observer moving around the Sun — which this app does not model. The measured angular separation from Horizons averages 20.45″ against the 20.496″ predicted for annual aberration, so the residual is accounted for rather than unexplained. The Earth's residual is far smaller (0.0002°).</p>
          <p>The Moon-frame rotation (MOON_PA → MOON_ME, 67.92″, 78.56″, 0.30″ about axes 3, 2, 1) was taken from NAIF's DE421 frame kernel <code>moon_080317.tf</code> and re-checked with SpiceyPy: our matrix matches SPICE to 0.004″ (the opposite sign would be off by 208″).</p>
        </>
      )}

      <h2>Limits</h2>
      <ul>
        <li>A comparison and planning aid, not a guarantee of landing safety or mission success.</li>
        <li>Earth in view is not the same as a working communications link (antenna pointing, link budget, ground-station visibility are not modelled).</li>
        <li>Not modelled: light-time/aberration (&lt; 0.01°), terrain-height uncertainty, shadows from boulders, observer height other than the value used to build the horizon.</li>
        <li>UTC → TDB assumes TAI−UTC = 37 s. IERS Bulletin C 72 (6 July 2026) confirms no leap second at the end of 2026 and keeps −37 s "until further notice"; the next decision is January 2027. A surprise 1 s step would move these angles by less than 0.6″.</li>
        <li>Ephemeris covers 1 Nov 2026 – 30 Dec 2027 at one-hour steps; percentages describe the stay you select, not an 18.6-year average.</li>
        <li>IM-1 uses a 118 m/px elevation model (the 20 m/px polar product stops 4 km short of it), so its horizon is coarser than the other sites.</li>
        <li>Site coordinates are documented region centres or LROC-derived fixes, not landing ellipses.</li>
      </ul>

      <h2>Data and credits</h2>
      <ul>
        <li>NASA/JPL Solar System Dynamics: DE421 planetary ephemeris and lunar libration.</li>
        <li>NASA JPL Horizons System: validation reference.</li>
        <li>LRO LOLA elevation models: 20 m/px 80–90°S DEM (Barker et al. 2021, PSS 203) and 118 m/px global LOLA DEM (Smith et al. 2010, GRL 37), via NASA PGDA and USGS Astrogeology.</li>
        <li>Site positions: Mazarico et al. 2011 (Icarus 211), Speyerer &amp; Robinson 2013 (Icarus 222), De Rosa et al. 2012, and LROC landing-site fixes.</li>
        <li>Published illumination figures used for validation: Mazarico et al. 2011, Speyerer &amp; Robinson 2013, Noda et al. 2008.</li>
        <li>Site map (Sites → Map): shaded relief computed from the LRO LOLA 80–90°S polar elevation model (LDEM_80S_*_ADJ) from the NASA GSFC Planetary Geodesy Data Archive (PGDA). Source: Barker et al. (2023), “A New View of the Lunar South Pole from LOLA”, Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1; data doi:10.60903/gsfcpgda-lola-spole. Usage terms: PGDA asks that this paper be cited.</li>
        <li>Permanently shadowed regions on the map (optional layer): LOLA-derived PSR polygons (LPSR_80S_20MPP_ADJ) from the same PGDA product and citation, simplified for display. Shown only once built from the downloaded data.</li>
      </ul>
    </div>
  )
}
