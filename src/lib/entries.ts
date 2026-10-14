import type { Entry, EntryType } from '../db/schema'
import { ENTRY_TYPE_LABELS } from './entryTypes'

export interface EntryFilters {
  type: EntryType | ''
  from: string // ISO ou ''
  to: string
  text: string
}

export type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export const emptyFilters = (): EntryFilters => ({ type: '', from: '', to: '', text: '' })

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filterEntries(entries: Entry[], f: EntryFilters): Entry[] {
  const q = norm(f.text.trim())
  return entries.filter((e) => {
    if (f.type && e.type !== f.type) return false
    if (f.from && e.date < f.from) return false
    if (f.to && e.date > f.to) return false
    if (q) {
      const hay = norm(`${e.garage} ${e.notes} ${ENTRY_TYPE_LABELS[e.type]}`)
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function sortEntries(entries: Entry[], key: SortKey): Entry[] {
  const out = [...entries]
  const amt = (e: Entry) => e.amount ?? -Infinity
  switch (key) {
    case 'date_desc': out.sort((a, b) => b.date.localeCompare(a.date)); break
    case 'date_asc': out.sort((a, b) => a.date.localeCompare(b.date)); break
    case 'amount_desc': out.sort((a, b) => amt(b) - amt(a)); break
    case 'amount_asc': out.sort((a, b) => amt(a) - amt(b)); break
  }
  return out
}

/** Doublon : même véhicule, même date, même montant (montant renseigné). */
export function findDuplicate(
  existing: Entry[],
  candidate: Pick<Entry, 'vehicleId' | 'date' | 'amount'>,
  ignoreId?: number,
): Entry | undefined {
  const amount = candidate.amount
  if (amount == null) return undefined
  return existing.find(
    (e) =>
      e.id !== ignoreId &&
      e.vehicleId === candidate.vehicleId &&
      e.date === candidate.date &&
      e.amount != null &&
      Math.round(e.amount * 100) === Math.round(amount * 100),
  )
}
