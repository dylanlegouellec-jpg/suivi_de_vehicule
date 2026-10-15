import { motion } from 'framer-motion'
import { springBouncy } from '../ui/motion'
import { NAV_ITEMS, type Tab } from './TabBar'

/**
 * Menu latéral : compact (icône + libellé) sur tablette et téléphone en paysage,
 * étendu (icône et libellé côte à côte) sur grand écran. La pastille glisse entre les entrées.
 */
export default function SideNav({ current, onChange, badges = {} }: {
  current: Tab
  onChange: (t: Tab) => void
  badges?: Partial<Record<Tab, number>>
}) {
  return (
    <nav
      aria-label="Navigation principale"
      className="relative z-20 hidden shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-2 rail:flex desktop:w-56 desktop:gap-1.5 desktop:p-3"
      style={{ paddingLeft: 'calc(0.5rem + env(safe-area-inset-left))', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      {NAV_ITEMS.map((it) => {
        const active = current === it.id
        const isAdd = it.id === 'add'
        return (
          <motion.button
            key={it.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(it.id)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-[56px] w-[68px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent desktop:w-full desktop:flex-row desktop:justify-start desktop:gap-3 desktop:px-3 desktop:text-base
              ${isAdd ? 'font-semibold text-accent-fg' : active ? 'font-semibold text-accent' : 'text-muted hover:bg-surface2'}`}
            style={isAdd ? { background: 'var(--btn-bg)', boxShadow: 'var(--glow)' } : undefined}
          >
            {active && !isAdd && <motion.span layoutId="side-pill" transition={springBouncy} className="absolute inset-0 rounded-xl bg-accent/15" />}
            <span aria-hidden className="relative z-10 text-xl">
              {it.icon}
              {!!badges[it.id] && (
                <span className="absolute -right-3 -top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-[18px] text-white">{badges[it.id]}</span>
              )}
            </span>
            <span className="relative z-10">{it.label}{badges[it.id] ? <span className="sr-only">, {badges[it.id]} à faire</span> : null}</span>
          </motion.button>
        )
      })}
    </nav>
  )
}
