import { NAV_ITEMS, type Tab } from './TabBar'

/**
 * Menu latéral : compact (icône + libellé) sur tablette et téléphone en paysage,
 * étendu (icône et libellé côte à côte) sur grand écran.
 */
export default function SideNav({ current, onChange, badges = {} }: {
  current: Tab
  onChange: (t: Tab) => void
  badges?: Partial<Record<Tab, number>>
}) {
  return (
    <nav
      aria-label="Navigation principale"
      className="hidden shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-white p-2 rail:flex desktop:w-56 desktop:gap-1.5 desktop:p-3 dark:border-slate-800 dark:bg-slate-900"
      style={{ paddingLeft: 'calc(0.5rem + env(safe-area-inset-left))' }}
    >
      {NAV_ITEMS.map((it) => {
        const active = current === it.id
        const isAdd = it.id === 'add'
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[56px] w-[68px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand desktop:w-full desktop:flex-row desktop:justify-start desktop:gap-3 desktop:px-3 desktop:text-base
              ${isAdd ? 'bg-brand text-white active:opacity-80' : active ? 'bg-blue-50 font-semibold text-brand dark:bg-slate-800' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
          >
            <span aria-hidden className="relative text-xl">
              {it.icon}
              {!!badges[it.id] && (
                <span className="absolute -right-3 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                  {badges[it.id]}
                </span>
              )}
            </span>
            <span>{it.label}{badges[it.id] ? <span className="sr-only">, {badges[it.id]} à faire</span> : null}</span>
          </button>
        )
      })}
    </nav>
  )
}
