/** Voiture du logo AutoSuivi (glyphe blanc, pour l'en-tête bleu). */
export function CarGlyph({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="70 150 372 250" className={className} aria-hidden>
      <path d="M96 318 v-44 q0-22 22-30 l60-20 38-52 q10-14 28-14 h86 q20 0 32 14 l44 54 q40 6 40 44 v48 q0 14-14 14 H110 q-14 0-14-14z" fill="#fff" />
      <path d="M214 178 h82 q8 0 13 6 l34 44 H182 l22-44 q3-6 10-6z" fill="#2563eb" opacity=".9" />
      <circle cx="176" cy="332" r="44" fill="#1e3a8a" /><circle cx="176" cy="332" r="22" fill="#fff" />
      <circle cx="352" cy="332" r="44" fill="#1e3a8a" /><circle cx="352" cy="332" r="22" fill="#fff" />
    </svg>
  )
}

/** Logotype « Auto » (gras) + « Suivi » (léger). */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-lg leading-none tracking-tight">
      <CarGlyph />
      <span><span className="font-extrabold">Auto</span><span className="font-light">Suivi</span></span>
    </span>
  )
}
