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

const compactKm = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : String(n))

/**
 * Valeur courte pour le centre d'une jauge : le critère le plus pressant, en jours ou en km.
 * Ex. { value: '12', unit: 'j' } (dans 12 jours), { value: '−300', unit: 'km' } (dépassé de 300 km).
 */
export function dueShort(r: ReminderResult): { value: string; unit: string } | null {
  if (r.state === 'unknown') return null
  const byDays = r.daysLeft != null ? r.daysLeft : null
  const byKm = r.kmLeft != null ? r.kmLeft : null
  // Même échelle que le tri : ~40 km par jour
  const useDays = byDays != null && (byKm == null || byDays <= byKm / 40)
  if (useDays && byDays != null) return { value: `${byDays < 0 ? '−' : ''}${Math.abs(byDays)}`, unit: 'j' }
  if (byKm != null) return { value: `${byKm < 0 ? '−' : ''}${compactKm(Math.abs(byKm))}`, unit: 'km' }
  return null
}
