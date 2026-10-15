import type { ReactNode } from 'react'

/** Infobulle : la valeur en gras, le libellé en second. */
export default function ChartTooltip({ title, rows }: { title: string; rows: { value: string; label: string; color: string }[] }): ReactNode {
  return (
    <div className="rounded-xl bg-surface px-3 py-2 text-sm shadow-lg ring-1 ring-line">
      <p className="text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-0.5 w-3" style={{ background: r.color }} />
          <strong>{r.value}</strong>
          <span className="text-muted">{r.label}</span>
        </p>
      ))}
    </div>
  )
}
