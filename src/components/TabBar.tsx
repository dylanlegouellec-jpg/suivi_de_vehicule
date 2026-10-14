export type Tab = 'home' | 'history' | 'add' | 'stats' | 'settings'

const ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Accueil', icon: '🏠' },
  { id: 'history', label: 'Historique', icon: '🧾' },
  { id: 'add', label: 'Ajouter', icon: '＋' },
  { id: 'stats', label: 'Stats', icon: '📊' },
  { id: 'settings', label: 'Réglages', icon: '⚙️' },
]

export default function TabBar({ current, onChange, badges = {} }: { current: Tab; onChange: (t: Tab) => void; badges?: Partial<Record<Tab, number>> }) {
  return (
    <nav
      aria-label="Navigation principale"
      className="relative z-20 grid grid-cols-5 overflow-visible border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {ITEMS.map((it) => {
        const isCenter = it.id === 'add'
        const isActive = current === it.id
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            aria-current={isActive ? 'page' : undefined}
            className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            {isCenter ? (
              <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-2xl text-white shadow-lg">
                {it.icon}
              </span>
            ) : (
              <span aria-hidden className="relative text-xl">
                {it.icon}
                {!!badges[it.id] && (
                  <span className="absolute -right-3 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                    {badges[it.id]}
                  </span>
                )}
              </span>
            )}
            <span className={isActive ? 'font-semibold text-brand' : 'text-slate-600 dark:text-slate-400'}>
              {it.label}{badges[it.id] ? <span className="sr-only">, {badges[it.id]} à faire</span> : null}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
