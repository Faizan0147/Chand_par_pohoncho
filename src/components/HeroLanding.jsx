import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useKeepSearch } from '../lib/data.jsx'

export default function HeroLanding() {
  const link = useKeepSearch()
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [showScience, setShowScience] = useState(false)
  
  // Dynamic solar angle control (in degrees, 0..360)
  const [sunAngle, setSunAngle] = useState(48)
  const [autoSun, setAutoSun] = useState(true)

  // Interactive site target selection
  const SITES = [
    { id: 'connecting-ridge', name: 'Connecting Ridge', lat: -89.45, lon: 222.8, illum: '93%', slip: '30+ d' },
    { id: 'shackleton-rim', name: 'Shackleton Rim', lat: -89.74, lon: 201.2, illum: '82%', slip: '18 d' },
    { id: 'de-gerlache-rim', name: 'de Gerlache Rim', lat: -88.68, lon: 291.9, illum: '87%', slip: '24 d' },
    { id: 'mons-mouton', name: 'Mons Mouton', lat: -84.79, lon: 29.2, illum: '74%', slip: '12 d' }
  ]
  const [selectedSite, setSelectedSite] = useState(SITES[0])

  // Mouse drag & parallax state
  const isDragging = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const rotationOffset = useRef(0)
  const targetRotation = useRef(0)
  const mouseTilt = useRef({ x: 0, y: 0 })

  // Animation sync refs — allow 60fps continuous frame motion without effect teardown
  const autoRotRef = useRef(0.8)
  const sunAngleRef = useRef(sunAngle)
  sunAngleRef.current = sunAngle
  const autoSunRef = useRef(autoSun)
  autoSunRef.current = autoSun
  const selectedSiteRef = useRef(selectedSite)
  selectedSiteRef.current = selectedSite

  // Select a site and automatically rotate globe to face it
  const handleSelectSite = site => {
    setSelectedSite(site)
    selectedSiteRef.current = site
    // Orient globe so site longitude faces viewer
    const desiredRot = -((site.lon * Math.PI) / 180) + Math.PI / 2
    targetRotation.current = desiredRot - rotationOffset.current
  }

  // High-precision 3D Point-Cloud Lunar Globe
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animationId

    // Pre-generate spherical point cloud points (Fibonacci sphere distribution)
    const NUM_POINTS = 1150
    const points = []
    const goldenRatio = (1 + Math.sqrt(5)) / 2

    for (let i = 0; i < NUM_POINTS; i++) {
      const theta = (2 * Math.PI * i) / goldenRatio
      const phi = Math.acos(1 - (2 * (i + 0.5)) / NUM_POINTS)
      const x = Math.sin(phi) * Math.cos(theta)
      const y = Math.cos(phi)
      const z = Math.sin(phi) * Math.sin(theta)
      points.push({ x, y, z })
    }

    const render = () => {
      const W = canvas.clientWidth
      const H = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1

      // Ensure canvas pixel buffer matches rendered CSS pixels precisely
      if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
        canvas.width = Math.floor(W * dpr)
        canvas.height = Math.floor(H * dpr)
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, W, H)

      const cx = W / 2
      const cy = (H - 45) / 2
      const R = Math.min(W * 0.44, H * 0.40, 168)

      // When animation is playing, rotate frame automatically in sync with solar motion
      if (!isDragging.current) {
        if (autoSunRef.current) {
          autoRotRef.current += 0.0035 // dynamic active frame motion
        } else {
          autoRotRef.current += 0.0008 // gentle ambient drift
        }
      }
      rotationOffset.current += (targetRotation.current - rotationOffset.current) * 0.06
      const currentRot = autoRotRef.current + rotationOffset.current

      // Dynamic Sun Vector from sunAngleRef
      const curSunAngle = sunAngleRef.current
      const sunRad = (curSunAngle * Math.PI) / 180
      const lx = Math.cos(sunRad) * 0.85
      const ly = -0.32
      const lz = Math.sin(sunRad) * 0.85
      const lLen = Math.hypot(lx, ly, lz)
      const sunDir = [lx / lLen, ly / lLen, lz / lLen]

      // Subtle ambient lunar halo
      const halo = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.3)
      halo.addColorStop(0, 'rgba(224, 109, 83, 0.09)')
      halo.addColorStop(0.5, 'rgba(224, 109, 83, 0.02)')
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2)
      ctx.fill()

      // Rotation matrix values with parallax tilt
      const cosR = Math.cos(currentRot)
      const sinR = Math.sin(currentRot)
      const tilt = 0.22 + mouseTilt.current.y // ~12° polar tilt + parallax
      const cosT = Math.cos(tilt)
      const sinT = Math.sin(tilt)

      const projected = []

      for (let i = 0; i < points.length; i++) {
        const pt = points[i]

        // Spin Y
        const rx = pt.x * cosR - pt.z * sinR
        const rz = pt.x * sinR + pt.z * cosR
        const ry = pt.y

        // Tilt X
        const fx = rx + mouseTilt.current.x * 0.1
        const fy = ry * cosT - rz * sinT
        const fz = ry * sinT + rz * cosT

        if (fz > -0.18) {
          const dot = fx * sunDir[0] + fy * sunDir[1] + fz * sunDir[2]
          const isLimb = Math.abs(fx * fx + fy * fy - 1) < 0.16
          projected.push({
            px: cx + fx * R,
            py: cy + fy * R,
            depth: fz,
            dot,
            isLimb,
          })
        }
      }

      // Render points
      for (let i = 0; i < projected.length; i++) {
        const p = projected[i]
        const normZ = (p.depth + 0.18) / 1.18

        if (p.dot > 0.15) {
          // Sunlit face
          const alpha = Math.min(1, 0.35 + p.dot * 0.65)
          ctx.fillStyle = `rgba(253, 186, 116, ${alpha})`
          const r = p.dot > 0.6 ? 1.6 : 1.2
          ctx.fillRect(p.px - r / 2, p.py - r / 2, r, r)
        } else if (p.isLimb && p.dot > -0.2) {
          // Vesper grazing edge
          ctx.fillStyle = `rgba(224, 109, 83, ${0.45 + normZ * 0.4})`
          ctx.fillRect(p.px - 0.7, p.py - 0.7, 1.4, 1.4)
        } else {
          // Unlit dark side
          ctx.fillStyle = `rgba(148, 163, 184, ${0.12 * normZ})`
          ctx.fillRect(p.px - 0.5, p.py - 0.5, 1, 1)
        }
      }

      // Latitude Rings (Polar Grid)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 5])
      ctx.beginPath()
      ctx.ellipse(cx, cy + R * 0.45, R * 0.7, R * 0.18, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // Selected Landing Site Pin with Callout (tracks rotating globe)
      const curSite = selectedSiteRef.current
      const siteRad = (curSite.lon * Math.PI) / 180 + currentRot
      const pinX = cx + R * 0.35 * Math.sin(siteRad)
      const pinY = cy + R * 0.54

      // Pin target
      ctx.strokeStyle = '#e06d53'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(pinX, pinY, 5, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(pinX, pinY, 2, 0, Math.PI * 2)
      ctx.fill()

      // Hairline callout line to right
      const calloutX = Math.min(W - 140, cx + R + 35)
      const calloutY = cy - 20

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pinX, pinY)
      ctx.lineTo(pinX + 30, calloutY)
      ctx.lineTo(calloutX - 8, calloutY)
      ctx.stroke()

      // Callout typography
      ctx.font = '600 11px Plus Jakarta Sans, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(curSite.name, calloutX, calloutY - 6)

      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.fillText(`${Math.abs(curSite.lat).toFixed(2)}°S, ${curSite.lon.toFixed(1)}°E`, calloutX, calloutY + 8)
      ctx.fillText(`Illumination ~${curSite.illum} · Slip ${curSite.slip}`, calloutX, calloutY + 20)

      ctx.restore()
      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [])

  // Auto-rotate sun when active
  useEffect(() => {
    if (!autoSun) return
    const timer = setInterval(() => {
      setSunAngle(prev => (prev + 0.35) % 360)
    }, 35)
    return () => clearInterval(timer)
  }, [autoSun])

  // Mouse drag & parallax handlers
  const handlePointerDown = e => {
    isDragging.current = true
    lastMousePos.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerMove = e => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 0.08
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 0.08
      mouseTilt.current = { x: nx, y: ny }
    }

    if (!isDragging.current) return
    const dx = e.clientX - lastMousePos.current.x
    lastMousePos.current = { x: e.clientX, y: e.clientY }
    targetRotation.current += dx * 0.008
  }

  const handlePointerUp = () => {
    isDragging.current = false
  }

  return (
    <section className="hero-landing" ref={containerRef}>
      {/* 1. Header Hero Typography */}
      <div className="hero-center-copy">
        <div className="hero-pill-badge">
          <span className="badge-pulse-dot" />
          <span>NASA SPACE APPS 2026 · LUNAR SOUTH POLE NAVIGATOR</span>
        </div>

        <h1 className="hero-editorial-title">
          When does the Sun shine on the lunar south pole?
        </h1>

        <p className="hero-editorial-sub">
          A few hundred meters on the Moon separates perpetual solar power from freezing darkness. 
          Vesper models real-time 360° terrain horizons from NASA LOLA elevation data, predicting solar illumination, 
          Earth line-of-sight, and launch slip tolerance for Artemis candidate landing sites.
        </p>

        <div className="hero-cta-row">
          <Link
            className="hero-primary-pill"
            to={link('/sites')}
          >
            <span>Explore Candidate Sites</span>
            <span className="btn-arrow">→</span>
          </Link>

          <Link
            className="hero-ghost-pill"
            to={link('/site/connecting-ridge?mode=3d')}
          >
            <span>Launch 3D Celestial Orbit ✦</span>
          </Link>
        </div>
      </div>

      {/* 2. Visual Centerpiece: Interactive 3D Point-Cloud Globe with Solar Scrubber */}
      <div className="hero-globe-stage">
        {/* Quick site targets bar floating at top of stage */}
        <div className="globe-targets-bar mono">
          <span className="targets-title">Target Zone:</span>
          {SITES.map(s => (
            <button
              key={s.id}
              type="button"
              className={`target-pill-btn ${selectedSite.id === s.id ? 'active' : ''}`}
              onClick={() => handleSelectSite(s)}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Dynamic Solar Angle Scrubber HUD */}
        <div className="globe-solar-hud mono">
          <button
            type="button"
            className={`solar-play-btn ${autoSun ? 'active' : ''}`}
            onClick={() => setAutoSun(p => !p)}
            title={autoSun ? 'Pause solar rotation' : 'Play solar rotation'}
          >
            {autoSun ? '⏸' : '▶'}
          </button>
          <span className="solar-hud-lbl">SOLAR AZ:</span>
          <input
            type="range"
            min="0"
            max="360"
            value={Math.round(sunAngle)}
            onChange={e => {
              setAutoSun(false)
              setSunAngle(Number(e.target.value))
            }}
            className="solar-hud-slider"
            aria-label="Solar Azimuth Angle"
          />
          <strong className="solar-hud-val">{Math.round(sunAngle)}°</strong>
        </div>

        {/* Canvas with drag & parallax interaction */}
        <canvas
          ref={canvasRef}
          className="hero-globe-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          title="Drag to rotate the Moon"
        />

        <div className="globe-hint mono">
          <span>✦ Drag to rotate Moon · Scrubber simulates solar grazing rays</span>
        </div>

        {/* Technical telemetry row at bottom */}
        <div className="hero-bottom-telemetry mono">
          <div className="tel-metric">
            <span className="tel-num">7</span>
            <span className="tel-name">candidate sites</span>
          </div>
          <div className="tel-metric">
            <span className="tel-num">15 km</span>
            <span className="tel-name">ray-march radius</span>
          </div>
          <div className="tel-metric">
            <span className="tel-num">0–30 d</span>
            <span className="tel-name">launch slip tolerance</span>
          </div>
          <div className="tel-metric">
            <span className="tel-num">&lt;0.0058°</span>
            <span className="tel-name">JPL Horizons accuracy</span>
          </div>
        </div>
      </div>

      {/* 3. Expandable Science & Architecture Drawer */}
      <div className="hero-science-toggle-wrap">
        <button
          type="button"
          className="science-toggle-btn"
          onClick={() => setShowScience(prev => !prev)}
        >
          <span>{showScience ? 'Hide scientific architecture' : 'How it works: 360° ray-marching & ephemeris'}</span>
          <span className="science-arrow">{showScience ? '↑' : '↓'}</span>
        </button>

        {showScience && (
          <div className="hero-architecture-wrap">
            <div className="arch-editorial-head">
              <h2>Terrain-accurate orbital planning</h2>
              <p>Every calculation runs against real Lunar Reconnaissance Orbiter laser altimetry and JPL DE421 ephemeris.</p>
            </div>

            <div className="arch-trio-grid">
              <div className="arch-trio-card">
                <span className="arch-step mono">01</span>
                <h4>360° Horizon ray-marching</h4>
                <p>
                  Rays are marched 15 km out in 360 directions over NASA LOLA 20m/px elevation models, 
                  accounting for lunar curvature and a 2-meter lander observer height.
                </p>
              </div>

              <div className="arch-trio-card">
                <span className="arch-step mono">02</span>
                <h4>JPL ephemeris & libration</h4>
                <p>
                  Sun and Earth positions are computed hourly from JPL DE421 with physical libration in the 
                  Moon’s mean-Earth frame, matching JPL Horizons to within 0.0058° across all 14 months.
                </p>
              </div>

              <div className="arch-trio-card">
                <span className="arch-step mono">03</span>
                <h4>Power & 30-day launch slip</h4>
                <p>
                  Calculates if the stay survives the longest night within battery limits, verifies direct 
                  line-of-sight to Earth without relays, and profiles 31 launch slip days.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}


