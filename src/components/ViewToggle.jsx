import './ViewToggle.css'

/** Cards / Map switch on the Sites page (M4). */
export default function ViewToggle({ value, onChange }) {
  return (
    <div className="viewtoggle" role="group" aria-label="Show sites as">
      {[['cards', 'Cards'], ['map', 'Map']].map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}
