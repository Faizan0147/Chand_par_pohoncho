import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'
import { maskAt } from '../lib/geometry.js'
import { useWidth } from '../lib/useWidth.js'

function trackPath(az, el, j0, j1, x, y) {
  let d = '', prev = null
  for (let j = j0; j <= j1; j++) {
    const px = x(az[j]), py = y(el[j])
    d += (prev === null || Math.abs(az[j] - prev) > 180 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)
    prev = az[j]
  }
  return d
}

/** 360-degree horizon panorama: 2D Panoramic Strip + Interactive 3D Horizon Dome */
export default function Panorama({ site, series, i }) {
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') === '3d' ? '3d' : '2d'
  const [viewMode, setViewMode] = useState(initialMode)
  const [ref, svgW] = useWidth(920)

  const W = Math.max(280, svgW - 16)
  const small = W < 560
  const H = small ? 320 : 380
  const M = { l: small ? 36 : 46, r: small ? 12 : 16, t: 18, b: 34 }
  const top = Math.max(10, Math.ceil((90 - Math.abs(site.lat) + 9) / 2) * 2)
  const bottom = -3

  const x = scaleLinear().domain([0, 360]).range([M.l, W - M.r])
  const y = scaleLinear().domain([bottom, top]).range([H - M.b, M.t])
  const mask = site.horizon

  // 2D terrain area and rimlight ridge stroke
  const terrainArea = area()
    .x((_, k) => x((k * 360) / mask.length))
    .y0(H - M.b)
    .y1(d => y(Math.max(d, bottom)))([...mask, mask[0]])

  const ridgeStroke = line()
    .x((_, k) => x((k * 360) / mask.length))
    .y(d => y(Math.max(d, bottom)))([...mask, mask[0]])

  const j0 = Math.max(0, i - 48), j1 = Math.min(series.n - 1, i + 48)
  const stretch = Math.round(((H - M.t - M.b) / (top - bottom)) / ((W - M.l - M.r) / 360))

  const sunLit = series.sunLit[i]
  const earthVis = series.earthVis[i]
  const sunAz = series.sunAz[i]
  const sunEl = series.sunEl[i]
  const earthAz = series.earthAz[i]
  const earthEl = series.earthEl[i]

  const bodies = [
    { key: 'sun', label: 'Sun', color: 'var(--sun)', az: series.sunAz, el: series.sunEl, vis: sunLit, track: 'sun' },
    { key: 'earth', label: 'Earth', color: 'var(--earth)', az: series.earthAz, el: series.earthEl, vis: earthVis, track: 'earth' },
  ]
  const yTicks = y.ticks(6).filter(t => t >= bottom)

  return (
    <figure className="panel pano" ref={ref}>
      {/* Top Controls: Mode Switcher & Telemetry Readout */}
      <div className="pano-top-bar">
        <div className="pano-title">
          <span className="dot" />
          <strong>360° Horizon Observation</strong>
          <span className="mono muted small">({site.name})</span>
        </div>

        <div className="pano-mode-toggle" role="radiogroup" aria-label="Panorama visual mode">
          <button
            type="button"
            className={viewMode === '2d' ? 'active' : ''}
            onClick={() => setViewMode('2d')}
          >
            2D Strip View
          </button>
          <button
            type="button"
            className={`mode-btn-3d ${viewMode === '3d' ? 'active' : ''}`}
            onClick={() => setViewMode('3d')}
            title="Switch to interactive 3D perspective"
          >
            <span className="sparkle-pulse">✦</span>
            <span>View 3D Dome</span>
            <span className="badge-tag">Interactive</span>
          </button>
        </div>
      </div>

      {viewMode === '2d' ? (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Horizon panorama for ${site.name}. Sun is ${sunLit ? 'above' : 'hidden by'} the terrain horizon; Earth is ${earthVis ? 'in view' : 'out of view'}.`}
        >
          <defs>
            {/* Deep Space Background with subtle gradient */}
            <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#040508" />
              <stop offset="85%" stopColor="#080a10" />
              <stop offset="100%" stopColor="#0c0e14" />
            </linearGradient>

            {/* Terrain Shading */}
            <linearGradient id="terrainGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--terrain-top)" />
              <stop offset="100%" stopColor="var(--terrain-bottom)" />
            </linearGradient>

            {/* Rimlight glow filter */}
            <filter id="rimGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Solar Corona Radial Gradient */}
            <radialGradient id="sunCorona" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="25%" stopColor="var(--sun-flare, #fdba74)" />
              <stop offset="65%" stopColor="var(--sun, #e06d53)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--sun, #e06d53)" stopOpacity="0" />
            </radialGradient>

            {/* Earth Marble Radial Gradient */}
            <radialGradient id="earthCorona" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#e0f2fe" />
              <stop offset="40%" stopColor="var(--earth, #38bdf8)" />
              <stop offset="85%" stopColor="#0369a1" />
              <stop offset="100%" stopColor="#082f49" />
            </radialGradient>
          </defs>

          {/* Sky Canvas Rect */}
          <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="url(#skyGrad)" rx="8" />

          {/* Elevation Horizontal Grid Lines */}
          {yTicks.map(t => (
            <g key={t}>
              <line
                x1={M.l}
                x2={W - M.r}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--line-subtle, #1c2434)"
                strokeDasharray={t === 0 ? '5 4' : undefined}
                strokeWidth={t === 0 ? '1.5' : '1'}
              />
              <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="tick mono">
                {t}°
              </text>
            </g>
          ))}

          {/* Cardinal Directions / Azimuth Ticks */}
          {[[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [360, 'N']].map(([a, l]) => (
            <g key={a}>
              <line x1={x(a)} x2={x(a)} y1={M.t} y2={H - M.b} stroke="var(--line-subtle, #161d2b)" />
              <text
                x={x(a)}
                y={H - 12}
                textAnchor={a === 0 ? 'start' : a === 360 ? 'end' : 'middle'}
                className="tick strong mono"
              >
                {l} {a}°
              </text>
            </g>
          ))}

          {/* Celestial Body ±48h Tracks */}
          {bodies.map(b => (
            <path
              key={b.key + 't'}
              d={trackPath(b.az, b.el, j0, j1, x, y)}
              fill="none"
              stroke={b.color}
              strokeOpacity=".35"
              strokeWidth="1.6"
              strokeDasharray="4 3"
            />
          ))}

          {/* Mountain Silhouette Body */}
          <path d={terrainArea} fill="url(#terrainGrad)" />

          {/* Glowing Rimlight Ridge (The literal Rimlight effect) */}
          <path
            d={ridgeStroke}
            fill="none"
            stroke="var(--rim)"
            strokeWidth="2.4"
            filter="url(#rimGlow)"
            strokeLinecap="round"
          />

          {/* Celestial Bodies */}
          {bodies.map(b => {
            const cy = Math.min(Math.max(y(b.el[i]), M.t + 8), H - M.b - 8)
            const cx = x(b.az[i])
            const blocked = !b.vis
            const maskY = y(Math.max(maskAt(mask, b.az[i]), bottom))

            return (
              <g key={b.key}>
                {blocked && b.el[i] > bottom && (
                  <line
                    x1={cx}
                    x2={cx}
                    y1={cy}
                    y2={maskY}
                    stroke="var(--bad)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Sun Corona Glow & Disc */}
                {b.key === 'sun' && (
                  <>
                    {!blocked && (
                      <circle cx={cx} cy={cy} r={22} fill="url(#sunCorona)" opacity="0.85" />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={blocked ? 7 : 10}
                      fill={blocked ? 'var(--bg)' : 'url(#sunCorona)'}
                      stroke={b.color}
                      strokeWidth="2"
                    />
                  </>
                )}

                {/* Earth Atmosphere & Disc */}
                {b.key === 'earth' && (
                  <>
                    {!blocked && (
                      <circle cx={cx} cy={cy} r={16} fill="var(--earth)" opacity="0.25" filter="url(#rimGlow)" />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={blocked ? 6 : 9}
                      fill={blocked ? 'var(--bg)' : 'url(#earthCorona)'}
                      stroke={b.color}
                      strokeWidth="2"
                    />
                  </>
                )}

                {/* Body Label */}
                <text
                  x={cx > W * 0.62 ? cx - 14 : cx + 14}
                  y={cy - 9}
                  textAnchor={cx > W * 0.62 ? 'end' : 'start'}
                  className="label mono"
                  fill={b.color}
                >
                  {b.label}
                  {blocked ? ' (hidden)' : ''} {b.el[i].toFixed(1)}°
                </text>
              </g>
            )
          })}

          {!small && (
            <text x={W - M.r} y={M.t - 4} textAnchor="end" className="tick mono">
              elevation above local horizontal
            </text>
          )}
        </svg>
      ) : (
        /* 3D Horizon Observer Dome Canvas */
        <Horizon3DDome
          site={site}
          mask={mask}
          sunAz={sunAz}
          sunEl={sunEl}
          sunLit={sunLit}
          earthAz={earthAz}
          earthEl={earthEl}
          earthVis={earthVis}
          width={W}
          height={H}
        />
      )}

      <figcaption className="muted small">
        Azimuth runs left to right from north. Vertical scale is stretched about ×{stretch} so a 1–2° ridge is visible.
        {site.terrain === 'synthetic-demo' && <strong className="warn"> Terrain shown is a synthetic placeholder.</strong>}
        {site.terrain === 'flat-sphere' && <strong className="warn"> No terrain data: horizon is a smooth sphere.</strong>}
      </figcaption>
    </figure>
  )
}

/** Interactive 3D Lunar Horizon & Celestial Orbit Simulator (NASA Eyes style) */
function Horizon3DDome({ site, mask, sunAz, sunEl, sunLit, earthAz, earthEl, earthVis, width, height }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  
  // Perspective mode: 'surface' (Astronaut 360° POV on ridge) | 'orbit' (3D Apollo/Satellite Polar Orbit)
  const [perspective, setPerspective] = useState('surface')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Camera state: yaw (heading, deg), pitch (elevation, deg), fov (field of view, deg)
  const [yaw, setYaw] = useState(() => sunAz) // default look toward the Sun
  const [pitch, setPitch] = useState(() => Math.max(0, sunEl))
  const [fov, setFov] = useState(70)
  
  // Tracking mode: 'sun' | 'earth' | 'manual' — automatically follows celestial target when playing timeline
  const [trackingMode, setTrackingMode] = useState('sun')

  // Orbit camera angles
  const [orbitRotX, setOrbitRotX] = useState(0.4) // tilt
  const [orbitRotY, setOrbitRotY] = useState(0.8) // spin

  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, yaw: 0, pitch: 0, rotX: 0, rotY: 0 })

  // Auto-track celestial bodies: when timeline animation plays, move camera frame accordingly!
  useEffect(() => {
    if (trackingMode === 'sun') {
      setYaw(sunAz)
      setPitch(Math.max(-2, Math.min(60, sunEl)))
    } else if (trackingMode === 'earth') {
      setYaw(earthAz)
      setPitch(Math.max(-2, Math.min(60, earthEl)))
    }
  }, [sunAz, sunEl, earthAz, earthEl, trackingMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = isFullscreen ? window.innerWidth : width
    const H = isFullscreen ? window.innerHeight : height

    // High-DPI scaling
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    ctx.scale(dpr, dpr)

    // Clear with deep space void
    ctx.fillStyle = '#040508'
    ctx.fillRect(0, 0, W, H)

    // Render starry background grid
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
    for (let s = 0; s < 40; s++) {
      const sx = ((s * 97) % W)
      const sy = ((s * 61) % (H * 0.7))
      ctx.fillRect(sx, sy, 1.2, 1.2)
    }

    if (perspective === 'surface') {
      // Camera projection helper
      // Returns { x, y, visible } for spherical coord (azimuth, elevation)
      function project(az, el) {
      let relAz = az - yaw
      while (relAz > 180) relAz -= 360
      while (relAz < -180) relAz += 360

      const relPitch = el - pitch

      // Projection mapping: equirectangular to planar perspective
      const fovRad = (fov * Math.PI) / 180
      const px = W / 2 + (relAz * (Math.PI / 180) / fovRad) * W
      const py = H / 2 - (relPitch * (Math.PI / 180) / fovRad) * H

      const visible = px >= -100 && px <= W + 100
      return { x: px, y: py, visible, relAz }
    }

    // 1. Draw 3D Lunar Mountain Terrain (Filled Silhouette)
    const terrainGrad = ctx.createLinearGradient(0, H * 0.3, 0, H)
    terrainGrad.addColorStop(0, '#1c1f26')
    terrainGrad.addColorStop(1, '#090a0d')

    // Screen-space monotonic ray-sampling from left-of-screen to right-of-screen.
    // Guaranteed 100% artifact-free: cannot fold back, wrap, or draw diagonal crossing lines.
    const stepPx = 3
    const startPx = -30
    const endPx = W + 30

    ctx.beginPath()
    ctx.moveTo(startPx, H + 120)

    for (let px = startPx; px <= endPx; px += stepPx) {
      const relAz = ((px - W / 2) / W) * fov
      const curAz = ((yaw + relAz) % 360 + 360) % 360
      const el = maskAt(mask, curAz)
      const relPitch = el - pitch
      const py = H / 2 - (relPitch / fov) * H
      ctx.lineTo(px, py)
    }
    ctx.lineTo(endPx, H + 120)
    ctx.closePath()
    ctx.fillStyle = terrainGrad
    ctx.fill()

    // 2. Stroke ONLY the Glowing Rimlight Ridge (Top Edge Only)
    ctx.beginPath()
    let firstRidge = true
    for (let px = startPx; px <= endPx; px += stepPx) {
      const relAz = ((px - W / 2) / W) * fov
      const curAz = ((yaw + relAz) % 360 + 360) % 360
      const el = maskAt(mask, curAz)
      const relPitch = el - pitch
      const py = H / 2 - (relPitch / fov) * H
      if (firstRidge) {
        ctx.moveTo(px, py)
        firstRidge = false
      } else {
        ctx.lineTo(px, py)
      }
    }
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#e06d53'
    ctx.shadowColor = '#e06d53'
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.shadowBlur = 0 // reset shadow

    // 3. Draw Horizon Compass Ring & Degree Marks
    const cardinal = [
      { az: 0, label: 'N 0°' },
      { az: 45, label: 'NE 45°' },
      { az: 90, label: 'E 90°' },
      { az: 135, label: 'SE 135°' },
      { az: 180, label: 'S 180°' },
      { az: 225, label: 'SW 225°' },
      { az: 270, label: 'W 270°' },
      { az: 315, label: 'NW 315°' },
    ]

    ctx.font = '10px JetBrains Mono, monospace'
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)'
    ctx.textAlign = 'center'

    cardinal.forEach(c => {
      const p = project(c.az, 0)
      if (p.visible && p.x >= 10 && p.x <= W - 10) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - 12)
        ctx.lineTo(p.x, p.y + 12)
        ctx.stroke()
        ctx.fillText(c.label, p.x, p.y + 24)
      }
    })

    // 4. Render 3D Sun
    const sunP = project(sunAz, sunEl)
    if (sunP.visible) {
      // Corona glow
      const corona = ctx.createRadialGradient(sunP.x, sunP.y, 2, sunP.x, sunP.y, 45)
      corona.addColorStop(0, '#ffffff')
      corona.addColorStop(0.25, '#fdba74')
      corona.addColorStop(0.65, 'rgba(224, 109, 83, 0.5)')
      corona.addColorStop(1, 'rgba(224, 109, 83, 0)')

      ctx.fillStyle = corona
      ctx.beginPath()
      ctx.arc(sunP.x, sunP.y, 45, 0, Math.PI * 2)
      ctx.fill()

      // Core disc
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(sunP.x, sunP.y, 9, 0, Math.PI * 2)
      ctx.fill()

      // Sun Label
      ctx.fillStyle = '#fdba74'
      ctx.font = 'bold 11px JetBrains Mono, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`SUN ${sunEl.toFixed(1)}° (${sunLit ? 'LIT' : 'OCCULTED'})`, sunP.x, sunP.y - 16)
    }

    // 5. Render 3D Earth
    const earthP = project(earthAz, earthEl)
    if (earthP.visible) {
      // Atmospheric glow
      const earthHalo = ctx.createRadialGradient(earthP.x, earthP.y, 4, earthP.x, earthP.y, 25)
      earthHalo.addColorStop(0, '#7dd3fc')
      earthHalo.addColorStop(0.5, 'rgba(56, 189, 248, 0.4)')
      earthHalo.addColorStop(1, 'rgba(56, 189, 248, 0)')

      ctx.fillStyle = earthHalo
      ctx.beginPath()
      ctx.arc(earthP.x, earthP.y, 25, 0, Math.PI * 2)
      ctx.fill()

      // Earth Disc
      const earthDisc = ctx.createRadialGradient(earthP.x - 2, earthP.y - 2, 1, earthP.x, earthP.y, 8)
      earthDisc.addColorStop(0, '#e0f2fe')
      earthDisc.addColorStop(0.4, '#0ea5e9')
      earthDisc.addColorStop(1, '#0369a1')

      ctx.fillStyle = earthDisc
      ctx.beginPath()
      ctx.arc(earthP.x, earthP.y, 8, 0, Math.PI * 2)
      ctx.fill()

      // Earth Label
      ctx.fillStyle = '#38bdf8'
      ctx.font = 'bold 11px JetBrains Mono, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`EARTH ${earthEl.toFixed(1)}° (${earthVis ? 'IN VIEW' : 'OCCULTED'})`, earthP.x, earthP.y - 14)
    }

    // 6. Center Crosshair Reticle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(W / 2 - 8, H / 2)
    ctx.lineTo(W / 2 + 8, H / 2)
    ctx.moveTo(W / 2, H / 2 - 8)
    ctx.lineTo(W / 2, H / 2 + 8)
    ctx.stroke()
  } else {
    // ══════════════════════════════════════════════════════════════
    // MODE B: 3D CELESTIAL ORBITAL VIEW (APOLLO/SATELLITE POV)
    // ══════════════════════════════════════════════════════════════
    const cx = W / 2
    const cy = H / 2
    const R = Math.min(W * 0.38, H * 0.38, 200)

    const sunRad = (sunAz * Math.PI) / 180
    const sunElevRad = (sunEl * Math.PI) / 180
    const lx = Math.cos(sunRad) * Math.cos(sunElevRad)
    const ly = -Math.sin(sunElevRad) - 0.2
    const lz = Math.sin(sunRad) * Math.cos(sunElevRad)
    const lLen = Math.hypot(lx, ly, lz) || 1
    const sunDir = [lx / lLen, ly / lLen, lz / lLen]

    const earthRad = (earthAz * Math.PI) / 180
    const earthElevRad = (earthEl * Math.PI) / 180

    // Ambient halo
    const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.25)
    halo.addColorStop(0, 'rgba(224, 109, 83, 0.12)')
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2)
    ctx.fill()

    // 3D Moon sphere shaded by true Sun direction
    const moonBody = ctx.createRadialGradient(cx - R * sunDir[0] * 0.3, cy - R * sunDir[1] * 0.3, R * 0.2, cx, cy, R)
    moonBody.addColorStop(0, '#262a36')
    moonBody.addColorStop(0.65, '#12141a')
    moonBody.addColorStop(1, '#06070a')
    ctx.fillStyle = moonBody
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fill()

    // Grazing rimlight limb
    ctx.strokeStyle = 'var(--sun, #e06d53)'
    ctx.lineWidth = 2.4
    ctx.shadowColor = 'var(--sun, #e06d53)'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0

    // 3D Polar latitude grid rings
    const cosX = Math.cos(orbitRotX)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 5])
    ctx.beginPath()
    ctx.ellipse(cx, cy, R * 0.75, R * 0.75 * Math.abs(cosX), 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(cx, cy, R * 0.45, R * 0.45 * Math.abs(cosX), 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Landing site surface marker
    const siteLonRad = (site.lon * Math.PI) / 180 + orbitRotY
    const siteLatDist = ((90 - Math.abs(site.lat)) / 10) * R * 0.8
    const pinX = cx + siteLatDist * Math.cos(siteLonRad)
    const pinY = cy + siteLatDist * Math.sin(siteLonRad) * Math.abs(cosX)

    ctx.strokeStyle = 'var(--sun, #e06d53)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(pinX, pinY, 7, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(pinX, pinY, 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.beginPath()
    ctx.moveTo(pinX, pinY)
    ctx.lineTo(pinX + 35, pinY - 30)
    ctx.lineTo(pinX + 110, pinY - 30)
    ctx.stroke()

    ctx.font = '600 12px Plus Jakarta Sans, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText(site.name, pinX + 40, pinY - 35)
    ctx.font = '10px JetBrains Mono, monospace'
    ctx.fillStyle = 'var(--muted, #8c8f9a)'
    ctx.fillText(`${Math.abs(site.lat).toFixed(2)}°S, ${site.lon.toFixed(1)}°E`, pinX + 40, pinY - 20)

    // Sun in 3D orbit
    const sunDistX = cx + Math.cos(sunRad) * (R + 110)
    const sunDistY = cy - Math.sin(sunElevRad) * (R + 110)
    const sunGlow = ctx.createRadialGradient(sunDistX, sunDistY, 2, sunDistX, sunDistY, 35)
    sunGlow.addColorStop(0, '#ffffff')
    sunGlow.addColorStop(0.3, '#fde68a')
    sunGlow.addColorStop(1, 'rgba(224, 109, 83, 0)')
    ctx.fillStyle = sunGlow
    ctx.beginPath()
    ctx.arc(sunDistX, sunDistY, 35, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(sunDistX, sunDistY, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fde68a'
    ctx.font = '600 10px JetBrains Mono, monospace'
    ctx.fillText(`SUN (${sunLit ? 'ILLUMINATED' : 'SHADOW'})`, sunDistX + 14, sunDistY + 4)

    // Earth in 3D orbit
    const earthDistX = cx + Math.cos(earthRad) * (R + 95)
    const earthDistY = cy - Math.sin(earthElevRad) * (R + 95)
    const earthGlow = ctx.createRadialGradient(earthDistX, earthDistY, 2, earthDistX, earthDistY, 20)
    earthGlow.addColorStop(0, '#7dd3fc')
    earthGlow.addColorStop(1, 'rgba(56, 189, 248, 0)')
    ctx.fillStyle = earthGlow
    ctx.beginPath()
    ctx.arc(earthDistX, earthDistY, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0284c7'
    ctx.beginPath()
    ctx.arc(earthDistX, earthDistY, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#38bdf8'
    ctx.font = '600 10px JetBrains Mono, monospace'
    ctx.fillText(`EARTH (${earthVis ? 'LOS' : 'OCCULTED'})`, earthDistX + 12, earthDistY + 4)
  }

  }, [site, mask, sunAz, sunEl, sunLit, earthAz, earthEl, earthVis, width, height, yaw, pitch, fov, perspective, orbitRotX, orbitRotY, isFullscreen])

  // Drag to Look Around Handlers
  const onPointerDown = e => {
    setTrackingMode('manual') // switch to manual look on user drag
    isDragging.current = true
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      yaw,
      pitch,
      rotX: orbitRotX,
      rotY: orbitRotY,
    }
  }

  const onPointerMove = e => {
    if (!isDragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y

    if (perspective === 'surface') {
      const sensitivity = fov / (isFullscreen ? window.innerWidth : width)
      let newYaw = dragStart.current.yaw - dx * sensitivity
      newYaw = ((newYaw % 360) + 360) % 360

      let newPitch = dragStart.current.pitch + dy * sensitivity
      newPitch = Math.max(-15, Math.min(65, newPitch))

      setYaw(newYaw)
      setPitch(newPitch)
    } else {
      setOrbitRotY(dragStart.current.rotY + dx * 0.008)
      setOrbitRotX(Math.max(0.1, Math.min(1.4, dragStart.current.rotX + dy * 0.008)))
    }
  }

  const onPointerUp = () => {
    isDragging.current = false
  }

  return (
    <div ref={wrapRef} className={`dome-3d-wrap ${isFullscreen ? 'dome-fullscreen' : ''}`}>
      <div className="dome-top-hint mono">
        <span className="dot-live" />
        <span>
          {perspective === 'surface'
            ? '3D SURFACE HORIZON OBSERVER · DRAG TO LOOK 360°'
            : '3D POLAR ORBITAL PERSPECTIVE · DRAG TO ROTATE MOON'}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          width: isFullscreen ? '100vw' : `${width}px`,
          height: isFullscreen ? '100vh' : `${height}px`,
          display: 'block',
          cursor: 'grab'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* 3D HUD Telemetry Overlay */}
      <div className="dome-hud">
        <div className="dome-hud-readout mono">
          {perspective === 'surface' ? (
            <>
              <span>AZ: <strong>{yaw.toFixed(0)}°</strong></span>
              <span>EL: <strong>{pitch >= 0 ? `+${pitch.toFixed(1)}°` : `${pitch.toFixed(1)}°`}</strong></span>
              <span>FOV: <strong>{fov}°</strong></span>
            </>
          ) : (
            <>
              <span>ORBIT TILT: <strong>{(orbitRotX * (180 / Math.PI)).toFixed(0)}°</strong></span>
              <span>SUN INCIDENCE: <strong>{sunEl.toFixed(1)}°</strong></span>
            </>
          )}
        </div>

        <div className="dome-hud-buttons">
          {/* Perspective switch */}
          <button
            type="button"
            className={`btn small hud-btn ${perspective === 'surface' ? 'active' : ''}`}
            onClick={() => setPerspective('surface')}
          >
            Astronaut POV
          </button>
          <button
            type="button"
            className={`btn small hud-btn ${perspective === 'orbit' ? 'active' : ''}`}
            onClick={() => setPerspective('orbit')}
          >
            3D Orbit POV
          </button>

          {perspective === 'surface' && (
            <>
              <button
                type="button"
                className={`btn small hud-btn ${trackingMode === 'sun' ? 'active' : ''}`}
                onClick={() => {
                  setTrackingMode('sun')
                  setYaw(sunAz)
                  setPitch(Math.max(0, sunEl))
                }}
                title="Follow Sun automatically across the sky as timeline plays"
              >
                Track Sun ☀
              </button>
              <button
                type="button"
                className={`btn small hud-btn ${trackingMode === 'earth' ? 'active' : ''}`}
                onClick={() => {
                  setTrackingMode('earth')
                  setYaw(earthAz)
                  setPitch(Math.max(0, earthEl))
                }}
                title="Follow Earth automatically across the sky as timeline plays"
              >
                Track Earth ⊕
              </button>
              <button
                type="button"
                className={`btn small hud-btn ${trackingMode === 'manual' && yaw === 0 ? 'active' : ''}`}
                onClick={() => {
                  setTrackingMode('manual')
                  setYaw(0)
                  setPitch(5)
                }}
              >
                North 0°
              </button>
            </>
          )}

          {/* Fullscreen toggle */}
          <button
            type="button"
            className="btn small hud-btn hud-fullscreen-btn"
            onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? '✕ Exit' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>
    </div>
  )
}
