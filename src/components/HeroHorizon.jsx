import { useEffect, useRef } from 'react'
import { BIN, HORIZON, horizonAt } from '../lib/shackleton.js'

/*
 * Hero centrepiece: Shackleton Rim's real horizon, with a Sun the visitor steers with the cursor.
 * Pointer X picks the azimuth, pointer Y the elevation; the ridge lights up around the Sun and the
 * terrain hides it behind the peaks, exactly the question the headline asks. Without a mouse
 * (phones) the Sun drifts along the horizon on its own. Everything is written to the DOM in one
 * rAF loop, so React never re-renders on mouse move.
 */
const W = 1200, H = 150, BASE = 96, PX_PER_DEG = 9, SUN_R = 7
const elY = el => BASE - Math.max(-6, Math.min(5, el)) * PX_PER_DEG
const azX = az => (az / 360) * W

const RIDGE = HORIZON.concat(HORIZON[0]).map((el, i) => `${i ? 'L' : 'M'}${azX(i * BIN).toFixed(1)} ${elY(el).toFixed(1)}`).join(' ')
const GROUND = `${RIDGE} L${W} ${H} L0 ${H} Z`

export default function HeroHorizon({ zoneRef }) {
  const sunRef = useRef(null)
  const glowRef = useRef(null)
  const readoutRef = useRef(null)

  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return
    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let az = 205, el = 1.4          // current (eased) Sun position
    let target = null                // { az, el } while the pointer is in the hero
    let raf = 0, t0 = performance.now()

    const paint = () => {
      const lit = el > horizonAt(az)
      const x = azX(az), y = elY(el)
      sunRef.current?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`)
      glowRef.current?.setAttribute('cx', x.toFixed(1))
      glowRef.current?.setAttribute('cy', y.toFixed(1))
      const r = readoutRef.current
      if (r) {
        r.dataset.lit = lit
        r.querySelector('[data-az]').textContent = String(Math.round(az)).padStart(3, '0')
        r.querySelector('[data-el]').textContent = (el >= 0 ? '+' : '') + el.toFixed(1)
        r.querySelector('[data-state]').textContent = lit ? 'Sunlit' : 'Behind ridge'
      }
    }

    const tick = now => {
      if (target) {
        az += (target.az - az) * 0.12
        el += (target.el - el) * 0.12
      } else {
        // idle: the Sun keeps skimming the rim, as it does at the pole
        az = (az + 0.06) % 360
        el += (1.3 + 0.7 * Math.sin((now - t0) / 2400) - el) * 0.05
      }
      paint()
      raf = requestAnimationFrame(tick)
    }

    const onMove = e => {
      const r = zone.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
      target = { az: x * 359, el: 4.5 - y * 6.5 }        // top of hero = high Sun, bottom = below the rim
      zone.style.setProperty('--px', (x - 0.5).toFixed(3))
      zone.style.setProperty('--py', (y - 0.5).toFixed(3))
    }
    const onLeave = () => {
      target = null
      zone.style.setProperty('--px', '0')
      zone.style.setProperty('--py', '0')
    }

    paint()
    if (reduced) return
    raf = requestAnimationFrame(tick)
    if (fine) {
      zone.addEventListener('pointermove', onMove)
      zone.addEventListener('pointerleave', onLeave)
    }
    return () => {
      cancelAnimationFrame(raf)
      zone.removeEventListener('pointermove', onMove)
      zone.removeEventListener('pointerleave', onLeave)
    }
  }, [zoneRef])

  return (
    <div className="hero-horizon" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="hh-sun-glow">
            <stop offset="0%" stopColor="var(--sun-flare)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--sun)" stopOpacity="0" />
          </radialGradient>
          {/* The ridge is lit only near the Sun: a soft circle mask that follows it */}
          <radialGradient id="hh-lit-fade">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="hh-lit-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <circle ref={glowRef} r="260" cx="600" cy="80" fill="url(#hh-lit-fade)" />
          </mask>
        </defs>
        <line x1="0" x2={W} y1={BASE} y2={BASE} className="hh-zero" />
        <g ref={sunRef}>
          <circle r={SUN_R * 4} fill="url(#hh-sun-glow)" />
          <circle r={SUN_R} fill="var(--sun-flare)" />
        </g>
        <path d={GROUND} className="hh-ground" />
        <path d={RIDGE} className="hh-ridge" />
        <path d={RIDGE} className="hh-ridge-lit" mask="url(#hh-lit-mask)" />
      </svg>
      <div className="hero-horizon-readout mono" ref={readoutRef} data-lit="true">
        <span>Shackleton Rim · real LOLA horizon</span>
        <span>AZ <b data-az>205</b>°</span>
        <span>EL <b data-el>+1.4</b>°</span>
        <span className="hh-state"><i /><b data-state>Sunlit</b></span>
      </div>
    </div>
  )
}
