import { motion } from 'framer-motion'
import { setMotionPref, setTheme, THEMES, useThemeState, type MotionPref, type ThemeId } from '../ui/theme'
import { spring } from '../ui/motion'

/** Aperçus miniatures : couleurs fixes propres à chaque thème (indépendantes du thème actif). */
const PREVIEW: Record<ThemeId, { bg: string; card: string; accent: string; fg: string }> = {
  cockpit: { bg: 'linear-gradient(160deg,#14171c,#0a0b0e)', card: '#1b1f26', accent: '#ffb020', fg: '#e8eaee' },
  aurora: { bg: 'radial-gradient(circle at 20% 20%,#5b3df5 0,transparent 55%),radial-gradient(circle at 80% 80%,#0fb5c8 0,transparent 55%),#070b1a', card: 'rgba(255,255,255,.14)', accent: '#7cf0ff', fg: '#fff' },
  fluide: { bg: 'linear-gradient(160deg,#f4f1ff,#ffe9f3)', card: '#ffffff', accent: '#7c4dff', fg: '#241b4b' },
}

const MOTIONS: { id: MotionPref; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'full', label: 'Complètes' },
  { id: 'reduced', label: 'Réduites' },
]

export default function AppearanceSection() {
  const { theme, motion: pref } = useThemeState()
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Apparence</h2>
      <div role="radiogroup" aria-label="Thème" className="grid grid-cols-3 gap-2">
        {THEMES.map((t) => {
          const p = PREVIEW[t.id]
          const on = theme === t.id
          return (
            <button
              key={t.id} role="radio" aria-checked={on} aria-label={`${t.label} : ${t.description}`}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTheme(t.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 }) }}
              className="relative rounded-2xl p-1.5 text-center"
            >
              {on && <motion.span layoutId="theme-ring" transition={spring} className="absolute inset-0 rounded-2xl ring-2 ring-accent" />}
              <span className="relative block h-20 overflow-hidden rounded-xl p-2 text-left" style={{ background: p.bg }}>
                <span className="block h-1.5 w-8 rounded-full" style={{ background: p.accent }} />
                <span className="mt-2 block h-6 rounded-lg" style={{ background: p.card }} />
                <span className="mt-1.5 block h-1.5 w-12 rounded-full opacity-60" style={{ background: p.fg }} />
              </span>
              <span className="relative mt-1 block text-sm font-semibold">{t.label}</span>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted">{THEMES.find((t) => t.id === theme)?.description}</p>
      <div>
        <p className="label">Animations</p>
        <div role="radiogroup" aria-label="Animations" className="grid grid-cols-3 gap-1 rounded-xl bg-surface2 p-1">
          {MOTIONS.map((m) => (
            <button key={m.id} role="radio" aria-checked={pref === m.id} onClick={() => setMotionPref(m.id)}
              className={`min-h-[40px] rounded-lg text-sm font-medium ${pref === m.id ? 'bg-accent text-accent-fg' : 'text-muted'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">« Auto » suit le réglage « Réduire les animations » de votre appareil.</p>
      </div>
    </section>
  )
}
