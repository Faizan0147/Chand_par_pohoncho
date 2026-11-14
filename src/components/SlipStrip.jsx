/** One cell per slip day (0..30): green = requirements met if the landing slips that many days. */
export default function SlipStrip({ cells, slip, onPick }) {
  const ok = cells.filter(c => c === true).length
  return (
    <div className="slipstrip" role="img"
      aria-label={`Requirements are met for ${ok} of the ${cells.length} slip days shown`}>
      {cells.map((c, d) => (
        <button key={d} type="button" onClick={() => onPick && onPick(d)}
          className={`cell ${c === true ? 'ok' : c === false ? 'bad' : 'na'} ${d === slip ? 'now' : ''}`}
          title={`Slip ${d} d: ${c === true ? 'works' : c === false ? 'fails' : 'beyond data'}`} />
      ))}
    </div>
  )
}
