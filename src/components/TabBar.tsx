import { motion } from 'framer-motion'
import { springBouncy } from '../ui/motion'

export type Tab = 'home' | 'history' | 'add' | 'stats' | 'settings'

export const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Accueil', icon: '🏠' },
  { id: 'history', label: 'Historique', icon: '🧾' },
  { id: 'add', label: 'Ajouter', icon: '＋' },
  { id: 'stats', label: 'Stats', icon: '📊' },
  { id: 'settings', label: 'Réglages', icon: '⚙️' },
]

/** Barre d'onglets du bas (téléphone en portrait) : la pastille glisse d'un onglet à l'autre. */
export default function TabBar({ current, onChange, badges = {} }: { current: Tab; onChange: (t: Tab) => void; badges?: Partial<Record<Tab, number>> }) {
  return (
    <nav
      aria-label="Navigation principale"
      className="relative z-20 grid grid-cols-5 overflow-visible border-t border-line bg-surface rail:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      {NAV_ITEMS.map((it) => {
        const isCenter = it.id === 'add'
        const isActive = current === it.id
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            aria-current={isActive ? 'page' : undefined}
            className="relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {isActive && !isCenter && (
              <motion.span layoutId="tab-pill" transition={springBouncy} className="absolute inset-x-2 inset-y-1.5 rounded-2xl bg-accent/15" />
            )}
            {isCenter ? (
              <motion.span
                whileTap={{ scale: 0.82, rotate: 90 }} transition={springBouncy}
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full text-3xl font-light text-accent-fg"
                style={{ background: 'var(--btn-bg)', boxShadow: 'var(--glow)' }}
              >
                <motion.span animate={{ rotate: isActive ? 135 : 0 }} transition={springBouncy}>{it.icon}</motion.span>
              </motion.span>
            ) : (
              <span aria-hidden className="relative z-10 text-xl">
                <motion.span className="inline-block" animate={{ scale: isActive ? 1.18 : 1, y: isActive ? -1 : 0 }} transition={springBouncy}>{it.icon}</motion.span>
                {!!badges[it.id] && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springBouncy}
                    className="absolute -right-3 -top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-[18px] text-white"
                  >{badges[it.id]}</motion.span>
                )}
              </span>
            )}
            <span className={`relative z-10 ${isActive ? 'font-semibold text-accent' : 'text-muted'}`}>
              {it.label}{badges[it.id] ? <span className="sr-only">, {badges[it.id]} à faire</span> : null}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
