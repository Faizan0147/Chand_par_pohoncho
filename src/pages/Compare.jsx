import { Link, useSearchParams } from 'react-router-dom'
import SlipStrip from '../components/SlipStrip.jsx'
import { useData, useKeepSearch, useScenario } from '../lib/data.jsx'
import { fmtHours, missionWindow, slipProfile, windowStats, works } from '../lib/metrics.js'

export default function Compare() {
  const data = useData()
  const link = useKeepSearch()
  const [sc, setScenario] = useScenario()
  const [sp, setSp] = useSearchParams()
  if (data.status !== 'ready') return null

  const ids = (sp.get('sites') || '').split(',').filter(Boolean)
  const chosen = (ids.length ? ids : data.sites.slice(0, 3).map(s => s.id)).map(id => data.getSite(id)).filter(Boolean).slice(0, 3)
  const setIds = list => { const n = new URLSearchParams(sp); n.set('sites', list.join(',')); setSp(n, { replace: true }) }
  const available = data.sites.filter(s => !chosen.some(c => c.id === s.id))

  const [a, b] = missionWindow(data.eph, sc)
  const cols = chosen.map(site => {
    const series = data.getSeries(site)
    const st = windowStats(series, a, b)
    return { site, st, prof: slipProfile(data.eph, series, sc), ok: works(st, sc) }
  })
  const rank = c => (c.prof.status === 'fails-now' ? -1 : c.prof.status === 'never-fails' ? 99 : c.prof.tolerance)
  const best = Math.max(...cols.map(rank))
  const tol = p => (p.status === 'fails-now' ? 'fails now' : p.status === 'never-fails' ? '30+ days' : `${p.tolerance} d`)

  const rows = [
    ['Works at this date?', c => (c.ok ? 'Yes' : 'No'), c => (c.ok ? 'good' : 'bad')],
    ['Sunlight', c => `${Math.round(c.st.sunlitPct)}%`],
    ['Longest night', c => fmtHours(c.st.longestDarkH), c => (c.st.longestDarkH > sc.bat ? 'bad' : '')],
    ['Earth in view', c => `${Math.round(c.st.earthPct)}%`, c => (c.st.earthPct < sc.earth ? 'bad' : '')],
    ['Longest comms gap', c => fmtHours(c.st.longestGapH)],
    ['Power + Earth together', c => `${Math.round(c.st.bothPct)}%`],
    ['Slip tolerance', c => tol(c.prof), c => (rank(c) === best && cols.length > 1 && rank(c) >= 0 ? 'good' : c.prof.status === 'fails-now' ? 'bad' : '')],
  ]

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Compare sites</h1>
          <p className="muted">Same date, stay and requirements for every column. Move the slip slider above to see which sites hold up.</p>
        </div>
      </div>
      {cols.length === 0 ? <p>Pick sites on the <Link to={link('/')}>site list</Link> first.</p> : (
        <div className="panel scroll">
          <table className="cmp">
            <thead>
              <tr>
                <th />
                {cols.map(c => (
                  <th key={c.site.id}>
                    <Link to={link(`/site/${c.site.id}`)}>{c.site.name}</Link>
                    <div className="muted small">{c.site.kind}{c.site.terrain === 'synthetic-demo' ? ' · demo terrain' : ''}</div>
                    <button type="button" className="linkbtn" onClick={() => setIds(cols.map(x => x.site.id).filter(i => i !== c.site.id))}>remove</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, f, tone]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {cols.map(c => <td key={c.site.id} className={tone ? tone(c) : ''}>{c.st ? f(c) : 'no data'}</td>)}
                </tr>
              ))}
              <tr>
                <th scope="row">Slip radar<div className="muted small">0 → 30 days late</div></th>
                {cols.map(c => <td key={c.site.id}><SlipStrip cells={c.prof.cells} slip={sc.slip} onPick={d => setScenario({ slip: d })} /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {cols.length < 3 && available.length > 0 && (
        <p>
          <label>Add a site{' '}
            <select value="" onChange={e => e.target.value && setIds([...cols.map(c => c.site.id), e.target.value])}>
              <option value="">Choose…</option>
              {available.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </p>
      )}
      {cols.length > 1 && best >= 0 && cols.some(c => rank(c) < best) && (
        <p className="plain-one">Most forgiving here: <strong>{cols.filter(c => rank(c) === best).map(c => c.site.name).join(' / ')}</strong> (slip tolerance {tol(cols.find(c => rank(c) === best).prof)}).</p>
      )}
    </>
  )
}
