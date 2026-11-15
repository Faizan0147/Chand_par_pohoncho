import { useEffect, useState } from 'react'

/**
 * Dribbble-inspired cinematic loader for Rimlight.
 * Shows while data is loading, then fades out gracefully.
 */
export default function RimlightLoader({ onDone }) {
  const [phase, setPhase] = useState('enter') // 'enter' | 'scanning' | 'exit'
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('INITIALISING EPHEMERIS')

  const MESSAGES = [
    'INITIALISING EPHEMERIS',
    'LOADING LOLA TERRAIN DATA',
    'COMPUTING SOLAR VECTORS',
    'TRACING HORIZON MASKS',
    'CALIBRATING JPL HORIZONS',
    'READY FOR LAUNCH',
  ]

  useEffect(() => {
    // Stagger progress bar fill
    let p = 0
    const interval = setInterval(() => {
      p += Math.random() * 14 + 4
      if (p >= 100) {
        p = 100
        clearInterval(interval)
        setStatusMsg(MESSAGES[MESSAGES.length - 1])
        // Brief pause at 100% then exit
        setTimeout(() => {
          setPhase('exit')
          setTimeout(() => onDone?.(), 650)
        }, 420)
      } else {
        const msgIdx = Math.min(Math.floor(p / (100 / (MESSAGES.length - 1))), MESSAGES.length - 2)
        setStatusMsg(MESSAGES[msgIdx])
      }
      setProgress(Math.min(p, 100))
    }, 180)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className={`rimlight-loader ${phase === 'exit' ? 'loader-exit' : ''}`} aria-live="polite">
      {/* Deep space star field */}
      <div className="loader-stars">
        {Array.from({ length: 60 }, (_, i) => (
          <span
            key={i}
            className="loader-star"
            style={{
              left: `${((i * 137.508 + 11) % 100).toFixed(2)}%`,
              top: `${((i * 97.3 + 7) % 100).toFixed(2)}%`,
              animationDelay: `${(i * 0.11) % 2.4}s`,
              width: i % 5 === 0 ? '2px' : '1px',
              height: i % 5 === 0 ? '2px' : '1px',
            }}
          />
        ))}
      </div>

      {/* Central loader card */}
      <div className="loader-card">
        {/* Animated lunar globe rings (Dribbble-style) */}
        <div className="loader-globe-wrap">
          {/* Outer orbit ring */}
          <div className="loader-ring loader-ring-outer" />
          {/* Mid orbit ring */}
          <div className="loader-ring loader-ring-mid" />
          {/* Inner orbit ring */}
          <div className="loader-ring loader-ring-inner" />

          {/* Moon body */}
          <div className="loader-moon">
            {/* Rimlight glow arc */}
            <div className="loader-moon-rimlight" />
            {/* Scanning sweep line */}
            <div className="loader-scan-sweep" />
          </div>

          {/* Orbiting dot (satellite) */}
          <div className="loader-satellite-orbit">
            <div className="loader-satellite-dot" />
          </div>

          {/* Sun dot orbiting opposite */}
          <div className="loader-sun-orbit">
            <div className="loader-sun-dot" />
          </div>
        </div>

        {/* Wordmark */}
        <div className="loader-wordmark">
          <span className="loader-brand">RIMLIGHT</span>
          <span className="loader-brand-sub mono">NASA SPACE APPS 2026</span>
        </div>

        {/* Status line */}
        <div className="loader-status mono">
          <span className="loader-status-dot" />
          <span className="loader-status-txt">{statusMsg}</span>
        </div>

        {/* Progress bar */}
        <div className="loader-progress-track">
          <div
            className="loader-progress-fill"
            style={{ width: `${progress}%` }}
          />
          <div
            className="loader-progress-glow"
            style={{ left: `${progress}%` }}
          />
        </div>
        <div className="loader-progress-pct mono">{Math.round(progress)}%</div>
      </div>
    </div>
  )
}
