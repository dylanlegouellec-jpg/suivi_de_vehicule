import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { reminderProgress, type ReminderState } from '../lib/reminders/compute'
import { describeDue, dueShort } from '../lib/reminders/describe'
import type { ReminderItem } from '../lib/reminders/useReminders'
import { itemVariants } from '../ui/motion'
import Ring from '../ui/Ring'

export const STATE_COLOR: Record<ReminderState, string> = {
  overdue: 'rgb(var(--danger))',
  soon: 'rgb(var(--warn))',
  later: 'rgb(var(--ok))',
  unknown: 'rgb(var(--muted))',
}
const STATE_RING: Record<ReminderState, string> = {
  overdue: 'ring-danger/50 bg-danger/10',
  soon: 'ring-warn/50 bg-warn/10',
  later: 'ring-line',
  unknown: 'ring-line',
}

/** Centre de la jauge : valeur courte (jours ou km) ou point d'interrogation. */
export function RingCenter({ item }: { item: ReminderItem }) {
  const short = dueShort(item)
  return short ? (
    <>
      <span className="text-[15px] font-bold leading-none">{short.value}</span>
      <span className="text-[10px] font-medium leading-tight text-muted">{short.unit}</span>
    </>
  ) : <span className="text-lg text-muted">?</span>
}

/** Carte d'échéance : jauge circulaire à gauche, libellé et détail à droite. */
export default function ReminderCard({ item, showVehicle, onClick, index = 0 }: {
  item: ReminderItem
  showVehicle: boolean
  onClick?: () => void
  index?: number
}) {
  const lines = item.state === 'unknown' ? [item.reason ?? ''] : describeDue(item)
  const progress = reminderProgress(item)
  const body: ReactNode = (
    <>
      <Ring progress={progress ?? 0} size={64} stroke={7} color={STATE_COLOR[item.state]} pulse={item.state === 'overdue'} dashed={progress == null} delay={index * 0.08}>
        <RingCenter item={item} />
      </Ring>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {item.rule.label}
          {showVehicle && <span className="font-normal text-muted"> · {item.vehicle.name}</span>}
        </p>
        {lines.map((l) => <p key={l} className="text-sm text-muted">{l}</p>)}
      </div>
    </>
  )
  const cls = `flex w-full items-center gap-4 rounded-card p-4 text-left ring-1 ${STATE_RING[item.state]}`
  return (
    <motion.div variants={itemVariants} layout>
      {onClick ? (
        <motion.button className={`${cls} bg-surface`} onClick={onClick} whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} style={{ backdropFilter: 'blur(var(--blur))' }}>{body}</motion.button>
      ) : (
        <div className={`${cls} bg-surface`}>{body}</div>
      )}
    </motion.div>
  )
}
