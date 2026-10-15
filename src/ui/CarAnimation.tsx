/**
 * La voiture du logo, de profil : roues qui tournent, légère suspension et route qui défile.
 * `driving=false` fige l'animation (écrans calmes).
 */
export default function CarAnimation({ size = 180, driving = true, className = '' }: { size?: number; driving?: boolean; className?: string }) {
  const still = driving ? '' : '[animation:none]'
  return (
    <svg viewBox="60 150 400 260" width={size} height={(size * 260) / 400} className={className} aria-hidden>
      <defs>
        <clipPath id="road-clip"><rect x="60" y="382" width="400" height="14" /></clipPath>
      </defs>
      <g clipPath="url(#road-clip)" opacity=".55">
        <g className={`car-road ${still}`}>
          {Array.from({ length: 12 }, (_, i) => <rect key={i} x={20 + i * 48} y="386" width="26" height="5" rx="2.5" fill="rgb(var(--muted))" />)}
        </g>
      </g>
      <g className={`car-body ${still}`}>
        <path d="M96 318 v-44 q0-22 22-30 l60-20 38-52 q10-14 28-14 h86 q20 0 32 14 l44 54 q40 6 40 44 v48 q0 14-14 14 H110 q-14 0-14-14z" fill="rgb(var(--fg))" />
        <path d="M214 178 h82 q8 0 13 6 l34 44 H182 l22-44 q3-6 10-6z" fill="rgb(var(--accent))" opacity=".92" />
        {[176, 352].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="332" r="44" fill="rgb(var(--bg))" stroke="rgb(var(--surface2))" strokeWidth="6" />
            <g className={`car-wheel ${still}`}>
              <circle cx={cx} cy="332" r="24" fill="rgb(var(--fg))" />
              <g stroke="rgb(var(--bg))" strokeWidth="7" strokeLinecap="round">
                <line x1={cx - 16} y1="332" x2={cx + 16} y2="332" /><line x1={cx} y1="316" x2={cx} y2="348" />
              </g>
            </g>
          </g>
        ))}
      </g>
    </svg>
  )
}
