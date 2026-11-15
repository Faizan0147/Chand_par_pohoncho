import { useEffect, useRef, useState } from 'react'
import VesperLogo from './VesperLogo.jsx'
import { BIN, HORIZON, horizonAt } from '../lib/shackleton.js'

/*
 * Startup loader: the Sun skimming the real horizon of Shackleton Rim (see lib/shackleton.js).
 * The Sun's elevation hovers around 1–2°, just as it does at the south pole, so it really does
 * slip behind the higher stretches of the rim.
 */
const W = 320, H = 120, BASE = 70, PX_PER_DEG = 8, SUN_R = 6
const LAP_MS = 2600
const MIN_SHOW_MS = LAP_MS

const elY = el => BASE - Math.max(-5, Math.min(3, el)) * PX_PER_DEG
const azX = az => (az / 360) * W
const sunElAt = az => 1.25 + 0.55 * Math.sin((az * Math.PI) / 180)

const RIDGE = HORIZON.concat(HORIZON[0]).map((el, i) => `${i ? 'L' : 'M'}${azX(i * BIN).toFixed(1)} ${elY(el).toFixed(1)}`).join(' ')
const GROUND = `${RIDGE} L${W} ${H} L0 ${H} Z`

const MESSAGES = [
  'Loading ephemeris',
  'Reading LOLA terrain',
  'Tracing horizon masks',
  'Computing solar vectors',
]

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function VesperLoader({ ready, onDone }) {
  const [exiting, setExiting] = useState(false)
  const [msgIdx, setMsgIdx] = useState(0)
  const sunRef = useRef(null)
  const readoutRef = useRef(null)
  const startRef = useRef(performance.now())
  const reduced = useRef(prefersReducedMotion()).current

  // Sun sweep. Writes straight to the DOM so the 60 fps loop doesn't re-render React.
  useEffect(() => {
    let raf
    const paint = az => {
      const el = sunElAt(az)
      const lit = el > horizonAt(az)
      sunRef.current?.setAttribute('transform', `translate(${azX(az).toFixed(1)} ${elY(el).toFixed(1)})`)
      const r = readoutRef.current
      if (r) {
        r.dataset.lit = lit
        r.querySelector('[data-az]').textContent = String(Math.round(az)).padStart(3, '0')
        r.querySelector('[data-el]').textContent = (el >= 0 ? '+' : '') + el.toFixed(1)
        r.querySelector('[data-state]').textContent = lit ? 'Sunlit' : 'Behind ridge'
      }
    }
    if (reduced) { paint(60); return }
    const tick = now => {
      paint((((now - startRef.current) / LAP_MS) * 360) % 360)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  // Step through the status messages over the Sun's lap (the data usually lands well before it ends).
  useEffect(() => {
    const id = setInterval(() => setMsgIdx(i => Math.min(i + 1, MESSAGES.length - 1)), LAP_MS / (MESSAGES.length + 0.5))
    return () => clearInterval(id)
  }, [])

  // Leave once the data is in. Normally we let the Sun finish one full lap first.
  useEffect(() => {
    if (!ready) return
    const wait = reduced ? 0 : Math.max(0, MIN_SHOW_MS - (performance.now() - startRef.current))
    const t1 = setTimeout(() => setExiting(true), wait)
    const t2 = setTimeout(() => onDone?.(), wait + (reduced ? 150 : 600))
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [ready, reduced])

  return (
    <div className={`vesper-loader${exiting ? ' loader-exit' : ''}`} role="status" aria-live="polite">
      <div className="loader-stars" aria-hidden="true">
        {Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            className="loader-star"
            style={{
              left: `${((i * 137.508 + 11) % 100).toFixed(2)}%`,
              top: `${((i * 97.3 + 7) % 62).toFixed(2)}%`,
              animationDelay: `${((i * 0.11) % 2.4).toFixed(2)}s`,
            }}
          />
        ))}
      </div>

      <div className="loader-stage">
        <div className="loader-wordmark">
          <VesperLogo size={40} className="loader-logo" />
          <span className="loader-brand">Vesper</span>
        </div>

        <svg className="loader-horizon" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <radialGradient id="loader-sun-glow">
              <stop offset="0%" stopColor="var(--sun-flare)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--sun)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="loader-ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#15161b" />
              <stop offset="100%" stopColor="#05060a" />
            </linearGradient>
          </defs>
          <line x1="0" x2={W} y1={BASE} y2={BASE} className="loader-zero" />
          <g ref={sunRef} transform={`translate(${azX(60)} ${elY(sunElAt(60))})`}>
            <circle r={SUN_R * 3.2} fill="url(#loader-sun-glow)" />
            <circle r={SUN_R} fill="var(--sun-flare)" />
          </g>
          <path d={GROUND} fill="url(#loader-ground)" />
          <path d={RIDGE} className="loader-ridge" />
        </svg>

        <div className="loader-readout mono" ref={readoutRef} data-lit="true">
          <span>AZ <b data-az>060</b>°</span>
          <span>EL <b data-el>+1.7</b>°</span>
          <span className="loader-lit"><i aria-hidden="true" /><b data-state>Sunlit</b></span>
        </div>

        <div className="loader-caption">
          <span className="loader-status mono">{exiting ? 'Ready' : MESSAGES[msgIdx]}<span className="loader-ellipsis" aria-hidden="true">{exiting ? '' : '…'}</span></span>
          <span className="loader-site">Shackleton Rim · real LOLA horizon</span>
        </div>
      </div>
    </div>
  )
}
