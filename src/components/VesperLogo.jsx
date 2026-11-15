/* ── Vesper Logo — a crater ridge drawn as a V, with the Sun resting on the lit peak ── */
export default function VesperLogo({ size = 32, className = 'brand-logo-svg' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className}>
      {/* Mission-badge tile */}
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0d0f16" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>

      {/* Sun on the right-hand peak — rises a little on hover */}
      <circle className="logo-sun" cx="19" cy="9.6" r="2.3" fill="var(--sun-flare)"/>

      {/* Ridge silhouette: plain → peak → crater floor (the V) → peak → plain */}
      <path d="M5 22 L10 22 L13 13 L16 20 L19 13 L22 22 L27 22" stroke="var(--sun)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>

      {/* Local horizon */}
      <line x1="5" y1="25.5" x2="27" y2="25.5" stroke="var(--muted-dim)" strokeWidth="1" strokeDasharray="2 2"/>
    </svg>
  )
}
