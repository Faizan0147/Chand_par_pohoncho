import { useState } from 'react'
import { useData, useScenario } from '../lib/data.jsx'
import { MAX_SLIP_DAYS } from '../lib/metrics.js'

/** The one place where date, slip and requirements are set; it follows the user across every page. */
export default function ScenarioBar() {
  const data = useData()
  const [sc, set] = useScenario()
  // Phones only: the bar collapses to a one-line summary until tapped (desktop ignores this)
  const [open, setOpen] = useState(false)
  if (data.status !== 'ready') return null
  const { eph } = data
  const minDate = new Date(eph.t0Ms).toISOString().slice(0, 10)
  const maxDate = new Date(
    eph.t0Ms + (eph.n * eph.stepHours - 24 * (MAX_SLIP_DAYS + 31)) * 3600e3
  )
    .toISOString()
    .slice(0, 10)

  const applyPreset = (len, bat, earth, slip = 0) => {
    set({ len, bat, earth, slip })
  }

  return (
    <section className={`scenario${open ? ' scenario--open' : ''}`} aria-label="Mission scenario">
      <button
        type="button"
        className="scenario-summary"
        aria-expanded={open}
        aria-controls="scenario-body"
        onClick={() => setOpen(o => !o)}
      >
        <span className="scenario-summary-txt mono">
          {fmtDay(sc.d)} · {sc.len} d stay · slip {sc.slip} d
        </span>
        <span className="scenario-summary-cta">{open ? 'Done' : 'Edit'}</span>
      </button>

      <div className="scenario-body" id="scenario-body">
      <div className="scenario-main-row">
        <label>
          <span className="scenario-label-title">Planned landing (UTC)</span>
          <input
            type="date"
            className="mono"
            value={sc.d}
            min={minDate}
            max={maxDate}
            onChange={e => e.target.value && set({ d: e.target.value })}
          />
        </label>

        <label className="grow">
          <span className="scenario-label-title">
            Launch slip tolerance: <strong className="mono">{sc.slip} day{sc.slip === 1 ? '' : 's'}</strong>
          </span>
          <input
            type="range"
            min="0"
            max={MAX_SLIP_DAYS}
            value={sc.slip}
            onChange={e => set({ slip: e.target.value })}
          />
        </label>

        <label>
          <span className="scenario-label-title">Surface stay</span>
          <select value={sc.len} onChange={e => set({ len: e.target.value })} className="mono">
            {[3, 5, 7, 10, 14, 21, 29].map(v => (
              <option key={v} value={v}>
                {v} days
              </option>
            ))}
            {![3, 5, 7, 10, 14, 21, 29].includes(sc.len) && (
              <option value={sc.len}>{sc.len} days</option>
            )}
          </select>
        </label>

        <details className="req">
          <summary>Constraints</summary>
          <div className="req-dropdown">
            <label>
              <span>Max battery darkness</span>
              <div className="req-input-wrap">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={sc.bat}
                  onChange={e => set({ bat: e.target.value })}
                  className="mono"
                />
                <span className="req-unit">hours</span>
              </div>
            </label>
            <label>
              <span>Min Earth line-of-sight</span>
              <div className="req-input-wrap">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={sc.earth}
                  onChange={e => set({ earth: e.target.value })}
                  className="mono"
                />
                <span className="req-unit">%</span>
              </div>
            </label>
          </div>
        </details>
      </div>

      {/* Clean Mission Presets Pills */}
      <div className="scenario-presets">
        <span className="presets-label mono">PRESETS</span>
        <button
          type="button"
          className="preset-chip"
          onClick={() => applyPreset(7, 48, 80, 0)}
        >
          Artemis Sortie (7 d)
        </button>
        <button
          type="button"
          className="preset-chip"
          onClick={() => applyPreset(14, 72, 75, 0)}
        >
          VIPER Rover (14 d)
        </button>
        <button
          type="button"
          className="preset-chip"
          onClick={() => applyPreset(29, 96, 60, 0)}
        >
          Full Lunar Cycle (29 d)
        </button>
      </div>
      </div>
    </section>
  )
}

const fmtDay = d => {
  const t = new Date(`${d}T00:00:00Z`)
  return isNaN(t) ? d : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
