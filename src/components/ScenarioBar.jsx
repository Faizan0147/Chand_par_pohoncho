import { useData, useScenario } from '../lib/data.jsx'
import { MAX_SLIP_DAYS } from '../lib/metrics.js'

/** The one place where date, slip and requirements are set; it follows the user across every page. */
export default function ScenarioBar() {
  const data = useData()
  const [sc, set] = useScenario()
  if (data.status !== 'ready') return null
  const { eph } = data
  const minDate = new Date(eph.t0Ms).toISOString().slice(0, 10)
  const maxDate = new Date(eph.t0Ms + (eph.n * eph.stepHours - 24 * (MAX_SLIP_DAYS + 31)) * 3600e3).toISOString().slice(0, 10)
  return (
    <section className="scenario" aria-label="Mission scenario">
      <label>Planned landing (UTC)
        <input type="date" value={sc.d} min={minDate} max={maxDate} onChange={e => e.target.value && set({ d: e.target.value })} />
      </label>
      <label className="grow">Launch slips by <strong>{sc.slip} day{sc.slip === 1 ? '' : 's'}</strong>
        <input type="range" min="0" max={MAX_SLIP_DAYS} value={sc.slip} onChange={e => set({ slip: e.target.value })} />
      </label>
      <label>Stay on surface
        <select value={sc.len} onChange={e => set({ len: e.target.value })}>
          {[3, 5, 7, 10, 14, 21, 29].map(v => <option key={v} value={v}>{v} days</option>)}
          {![3, 5, 7, 10, 14, 21, 29].includes(sc.len) && <option value={sc.len}>{sc.len} days</option>}
        </select>
      </label>
      <details className="req">
        <summary>Requirements</summary>
        <label>Battery rides through <input type="number" min="1" max="500" value={sc.bat} onChange={e => set({ bat: e.target.value })} /> h of darkness</label>
        <label>Earth in view at least <input type="number" min="0" max="100" value={sc.earth} onChange={e => set({ earth: e.target.value })} /> % of the time</label>
      </details>
    </section>
  )
}
