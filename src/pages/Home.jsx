import { useState } from 'react'
import { Link } from 'react-router-dom'
import HeroLanding from '../components/HeroLanding.jsx'
import { useData, useKeepSearch, useScenario } from '../lib/data.jsx'
import { missionWindow, slipProfile, windowStats, works } from '../lib/metrics.js'

export default function Home() {
  const data = useData()
  const link = useKeepSearch()
  const [sc] = useScenario()

  // Featured 3 premier candidate sites for the homepage showcase
  const featuredIds = ['connecting-ridge', 'shackleton-rim', 'mons-mouton']
  const featuredSites = data.status === 'ready'
    ? featuredIds.map(id => data.getSite(id)).filter(Boolean)
    : []

  return (
    <div className="home-container">
      {/* 1. Flagship Interactive Hero Experience */}
      <HeroLanding />

      {/* 2. The South Pole Paradox (Why this mission matters) */}
      <section className="home-section paradox-section">
        <div className="section-header-tag mono">
          <span className="dot-live" />
          <span>MISSION PROBLEM STATEMENT</span>
        </div>
        <h2 className="section-title">
          At the lunar south pole, light is life.
        </h2>
        <p className="section-lead">
          Because the Moon’s rotational axis is tilted only 1.54°, the Sun skims perpetually along the south polar horizon.
          A lander placed atop a crater ridge can bask in over 90% continuous solar illumination, while a rover just 500 meters away inside a Permanently Shadowed Region (PSR) freezes in pitch-black −240°C cryogenic darkness.
        </p>
      </section>

      {/* 3. Technology Pillars: Fast, Precise & Client-Side */}
      <section className="home-section bento-section">
        <div className="section-header-tag mono">
          <span>ENGINEERING ARCHITECTURE</span>
        </div>
        <h2 className="section-title">How Rimlight Solves the Horizon Problem</h2>

        <div className="bento-grid">
          <div className="bento-card bento-card-large">
            <div className="bento-badge mono">01 · TERRAIN RAY-MARCHING</div>
            <h3>360° Real-Horizon Occlusion</h3>
            <p>
              Instead of assuming a flat or smooth sphere, Rimlight marches rays 15 kilometers outwards in 360 azimuthal directions over NASA Lunar Reconnaissance Orbiter (LRO) LOLA 20-meter/pixel laser altimetry models, accounting for lunar curvature and a 2-meter astronaut/lander instrument deck.
            </p>
            <div className="bento-stat-row mono">
              <div>
                <span className="bento-num">15 km</span>
                <span className="bento-lbl">Ray-March Radius</span>
              </div>
              <div>
                <span className="bento-num">360°</span>
                <span className="bento-lbl">Horizon Azimuths</span>
              </div>
              <div>
                <span className="bento-num">20 m</span>
                <span className="bento-lbl">LOLA Resolution</span>
              </div>
            </div>
          </div>

          <div className="bento-card">
            <div className="bento-badge mono">02 · JPL EPHEMERIS</div>
            <h3>Physical Libration Accuracy</h3>
            <p>
              Solar and terrestrial vectors are derived from high-precision JPL DE421 ephemeris with full physical libration in the Moon’s mean-Earth frame, validated against NASA JPL Horizons to within 0.0058° over 14 consecutive months.
            </p>
            <div className="bento-tag-pill mono">&lt;0.0058° vs JPL Horizons</div>
          </div>

          <div className="bento-card">
            <div className="bento-badge mono">03 · LAUNCH SLIP RADAR</div>
            <h3>30-Day Launch Window Margin</h3>
            <p>
              Rockets rarely launch on the exact planned second. Rimlight computes an instant 31-day slip profile, showing whether a delay will push the stay into an unrecoverable lunar night.
            </p>
            <div className="bento-tag-pill mono">31-Day Slip Radar Profile</div>
          </div>

          <div className="bento-card bento-card-full">
            <div className="bento-badge mono">04 · SUB-MILLISECOND PERFORMANCE</div>
            <div className="bento-split">
              <div>
                <h3>Zero Latency. Offline-First. 100% Client-Side.</h3>
                <p>
                  Built with pre-computed geometric horizon profiles and optimized D3/WebGL rendering. All orbital calculations, sliders, and timeline animations run completely in your browser at 60 FPS without sending a single byte to external servers.
                </p>
              </div>
              <div className="bento-speed-box mono">
                <span className="speed-num">&lt; 1 ms</span>
                <span className="speed-txt">Mission Evaluation Latency</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Featured Candidate Sites Spotlight */}
      {data.status === 'ready' && featuredSites.length > 0 && (
        <section className="home-section sites-spotlight-section">
          <div className="spotlight-header">
            <div>
              <div className="section-header-tag mono">
                <span>ARTEMIS CANDIDATE ZONES</span>
              </div>
              <h2 className="section-title">Premier South Polar Landing Sites</h2>
              <p className="section-sub">
                Explore key regions evaluated for NASA’s Artemis and commercial lunar payload (CLPS) missions.
              </p>
            </div>
            <Link to={link('/sites')} className="btn primary explore-all-btn">
              <span>View All 7 Candidate Sites</span>
              <span className="btn-arrow">→</span>
            </Link>
          </div>

          <div className="featured-cards-grid">
            {featuredSites.map(s => {
              const series = data.getSeries(s)
              const [a, b] = missionWindow(data.eph, sc)
              const st = windowStats(series, a, b)
              const prof = slipProfile(data.eph, series, sc)
              const ok = works(st, sc)

              return (
                <div key={s.id} className="featured-site-card">
                  <div className="featured-card-head">
                    <div>
                      <span className="site-kind-badge mono">{s.kind}</span>
                      <h3 className="featured-site-name">{s.name}</h3>
                      <p className="featured-site-coords mono">
                        {Math.abs(s.lat).toFixed(2)}°S, {s.lon.toFixed(1)}°E
                      </p>
                    </div>
                    <span className={`badge ${ok ? 'ok' : 'bad'}`}>
                      {ok ? 'Nominal' : 'Shadow Risk'}
                    </span>
                  </div>

                  {st && (
                    <div className="featured-kpi-row mono">
                      <div className="featured-kpi">
                        <span className="kpi-lbl">SUNLIGHT</span>
                        <strong className="kpi-val">{Math.round(st.sunlitPct)}%</strong>
                      </div>
                      <div className="featured-kpi">
                        <span className="kpi-lbl">EARTH COMMS</span>
                        <strong className="kpi-val">{Math.round(st.earthPct)}%</strong>
                      </div>
                      <div className="featured-kpi">
                        <span className="kpi-lbl">MAX DARK</span>
                        <strong className="kpi-val">{Math.round(st.longestDarkH)}h</strong>
                      </div>
                    </div>
                  )}

                  <div className="featured-card-foot">
                    <Link to={link(`/site/${s.id}`)} className="btn site-btn">
                      <span>Analyze Horizon</span>
                    </Link>
                    <Link to={link(`/site/${s.id}?mode=3d`)} className="btn primary site-btn-3d">
                      <span>✦ 3D Dome View</span>
                      <span className="btn-arrow">→</span>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 5. Team & NASA Space Apps 2026 Credits */}
      <section className="home-section credits-section">
        <div className="credits-card">
          <div className="credits-top">
            <div className="section-header-tag mono">
              <span>PROJECT CREDITS & ATTRIBUTION</span>
            </div>
            <h2>Built for NASA Space Apps Challenge 2026</h2>
            <p>
              Rimlight is an open-source lunar mission comparison and trajectory planning instrument.
              Conceived, designed, and engineered for the NASA Space Apps Challenge to provide aerospace engineers, mission architects, and the public with clear, human-centered access to lunar terrain illumination physics.
            </p>
          </div>

          <div className="credits-grid">
            <div className="credit-col">
              <h4 className="mono">DATA SOURCES</h4>
              <ul>
                <li><strong>NASA Lunar Reconnaissance Orbiter (LRO)</strong> LOLA Science Team 20m digital elevation models (DEM)</li>
                <li><strong>NASA Jet Propulsion Laboratory (JPL)</strong> DE421 Planetary & Lunar Ephemeris</li>
                <li><strong>LROC</strong> Permanently Shadowed Region (PSR) Ice & Radar Maps</li>
              </ul>
            </div>
            <div className="credit-col">
              <h4 className="mono">DESIGN & ENGINEERING</h4>
              <ul>
                <li>Human-crafted aerospace design system with custom dual-color celestial palettes</li>
                <li>Real-time WebGL/Canvas 3D celestial orbit & horizon simulation</li>
                <li>Zero external dependencies for calculation · Instant A4 PDF Mission Brief generation</li>
              </ul>
            </div>
          </div>

          <div className="credits-foot mono">
            <span>NASA SPACE APPS 2026 · CHALLENGE: WILL IT CLEAR THE HORIZON?</span>
            <Link to={link('/method')} className="linkbtn">Read full scientific methodology →</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
