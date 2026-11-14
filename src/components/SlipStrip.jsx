/**
 * One cell per slip day (0..30): green = requirements met if the landing slips that many days.
 * `compact` keeps all 31 cells on a single row (used inside the Compare table); otherwise the
 * strip wraps into numbered, finger-sized boxes on phones (see mobile.css).
 */
export default function SlipStrip({ cells, slip, onPick, compact = false }) {
  const ok = cells.filter(c => c === true).length
  const readOnly = !onPick   // e.g. the site cards: a summary, not controls
  if (readOnly) {
    return (
      <div className="slipstrip compact" role="img"
        aria-label={`Requirements are met for ${ok} of the ${cells.length} slip days shown`}>
        {cells.map((c, d) => <span key={d} className={`cell ${c === true ? 'ok' : c === false ? 'bad' : 'na'} ${d === slip ? 'now' : ''}`} title={`Slip ${d} d: ${c === true ? 'works' : c === false ? 'fails' : 'beyond data'}`} />)}
      </div>
    )
  }
  return (
    <div className={`slipstrip${compact ? ' compact' : ''}`} role="group"
      aria-label={`Slip days 0 to ${cells.length - 1}: requirements are met for ${ok} of ${cells.length}`}>
      {cells.map((c, d) => {
        const state = c === true ? 'works' : c === false ? 'fails' : 'beyond data'
        return (
          <button key={d} type="button" onClick={() => onPick(d)}
            className={`cell ${c === true ? 'ok' : c === false ? 'bad' : 'na'} ${d === slip ? 'now' : ''}`}
            aria-pressed={d === slip}
            aria-label={`Slip ${d} day${d === 1 ? '' : 's'}: ${state}`}
            title={`Slip ${d} d: ${state}`}>
            <span aria-hidden="true">{d}</span>
          </button>
        )
      })}
    </div>
  )
}
