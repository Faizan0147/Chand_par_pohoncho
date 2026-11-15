import { scaleLinear } from 'd3-scale'

import { useWidth } from '../lib/useWidth.js'

const ROW = 20, GAP = 6, R = 10, TOP = 6

function runs(flags, i0, i1, pick) {
  const out = []
  let start = null
  for (let i = i0; i < i1; i++) {
    const on = pick(i)
    if (on && start === null) start = i
    if (!on && start !== null) { out.push([start, i]); start = null }
  }
  if (start !== null) out.push([start, i1])
  return out
}

/** Light/contact timeline over the mission window. Click or drag to move the time cursor. */
export default function Timeline({ series, i0, i1, i, onPick, t0Ms }) {
  // Drawn 1:1 in CSS pixels so the labels stay readable on a phone.
  const [ref, boxW] = useWidth(920)
  const W = Math.max(280, boxW - 32)
  const small = W < 560
  const L = small ? 50 : 78
  const x = scaleLinear().domain([i0, i1]).range([L, W - R])
  const rows = [
    { name: small ? 'Sun' : 'Sunlight', color: 'var(--sun)', on: k => series.sunLit[k] === 1 },
    { name: small ? 'Earth' : 'Earth in view', color: 'var(--earth)', on: k => series.earthVis[k] === 1 },
    { name: 'Both', color: 'var(--ok)', on: k => series.sunLit[k] === 1 && series.earthVis[k] === 1 },
  ]
  const H = TOP + rows.length * (ROW + GAP) + 26
  const days = (i1 - i0) * series.stepHours / 24
  const pxPerDay = (W - L - R) / Math.max(1, days)
  const every = [1, 2, 5, 10].find(e => e * pxPerDay >= 56) || 10
  const ticks = []
  for (let d = 0; d <= days; d += every) ticks.push(d)
  const pick = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    onPick(Math.round(Math.min(i1 - 1, Math.max(i0, x.invert(px)))))
  }
  return (
    <div className="panel" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="timeline" onPointerDown={pick}
        onPointerMove={e => e.buttons === 1 && pick(e)} role="img"
        aria-label="Timeline of sunlight and Earth visibility across the mission window">
        {rows.map((r, k) => {
          const y = TOP + k * (ROW + GAP)
          return (
            <g key={r.name}>
              <text x={L - 8} y={y + 14} textAnchor="end" className="tick strong">{r.name}</text>
              <rect x={L} y={y} width={W - L - R} height={ROW} fill="#141b29" rx="3" />
              {runs(null, i0, i1, r.on).map(([a, b]) => (
                <rect key={a} x={x(a)} y={y} width={Math.max(1, x(b) - x(a))} height={ROW} fill={r.color} />
              ))}
            </g>
          )
        })}
        {ticks.map(d => {
          const px = x(i0 + d * 24 / series.stepHours)
          const label = new Date(t0Ms + (i0 + d * 24 / series.stepHours) * series.stepHours * 3600e3)
            .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
          return (
            <g key={d}>
              <line x1={px} x2={px} y1={TOP} y2={H - 22} stroke="#2b354a" strokeDasharray="2 3" />
              <text x={px} y={H - 8} textAnchor={px > W - R - 14 ? 'end' : d === 0 ? 'start' : 'middle'} className="tick">{label}</text>
            </g>
          )
        })}
        <line x1={x(i)} x2={x(i)} y1={0} y2={H - 22} stroke="#fff" strokeWidth="2" />
      </svg>
    </div>
  )
}
