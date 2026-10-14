import { formatDate, formatNumber } from '../format'
import type { ReminderResult } from './compute'

const plural = (n: number, w: string) => `${formatNumber(n)} ${w}${n > 1 ? 's' : ''}`

/** Phrase lisible décrivant l'échéance (date et/ou km). */
export function describeDue(r: ReminderResult): string[] {
  const parts: string[] = []
  if (r.dueDate != null && r.daysLeft != null) {
    const when = formatDate(r.dueDate)
    if (r.daysLeft < 0) parts.push(`Échéance dépassée de ${plural(-r.daysLeft, 'jour')} (${when})`)
    else if (r.daysLeft === 0) parts.push(`Échéance aujourd'hui (${when})`)
    else parts.push(`Échéance le ${when} (dans ${plural(r.daysLeft, 'jour')})`)
  }
  if (r.dueKm != null) {
    const at = `${formatNumber(r.dueKm)} km`
    if (r.kmLeft == null) parts.push(`À ${at}`)
    else if (r.kmLeft < 0) parts.push(`Dépassé de ${plural(-r.kmLeft, 'km').replace(/kms$/, 'km')} (à ${at})`)
    else parts.push(`À ${at} (dans ${formatNumber(r.kmLeft)} km)`)
  }
  return parts
}
