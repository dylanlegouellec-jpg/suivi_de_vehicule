import type { ReactNode } from 'react'

export default function EmptyState({ icon, title, text, children }: {
  icon: string; title: string; text?: string; children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div aria-hidden className="text-5xl">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {text && <p className="max-w-xs text-slate-600 dark:text-slate-400">{text}</p>}
      {children}
    </div>
  )
}
