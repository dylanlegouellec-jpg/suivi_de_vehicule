import type { ReminderItem } from '../lib/reminders/useReminders'
import type { ReminderState } from '../lib/reminders/compute'
import { describeDue } from '../lib/reminders/describe'

const STYLE: Record<ReminderState, string> = {
  overdue: 'ring-red-400 bg-red-50 dark:bg-red-950/40',
  soon: 'ring-amber-400 bg-amber-50 dark:bg-amber-950/40',
  later: 'ring-slate-200 dark:ring-slate-800',
  unknown: 'ring-slate-200 dark:ring-slate-800',
}

export default function ReminderCard({ item, showVehicle, onClick }: {
  item: ReminderItem
  showVehicle: boolean
  onClick?: () => void
}) {
  const lines = item.state === 'unknown' ? [item.reason ?? ''] : describeDue(item)
  const body = (
    <>
      <p className="font-semibold">
        {item.rule.label}
        {showVehicle && <span className="font-normal text-slate-600 dark:text-slate-400"> · {item.vehicle.name}</span>}
      </p>
      {lines.map((l) => <p key={l} className="text-sm text-slate-700 dark:text-slate-300">{l}</p>)}
    </>
  )
  const cls = `block w-full rounded-2xl p-4 text-left shadow-sm ring-1 ${STYLE[item.state]}`
  return onClick
    ? <button className={`${cls} active:opacity-80`} onClick={onClick}>{body}</button>
    : <div className={cls}>{body}</div>
}
