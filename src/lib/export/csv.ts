import type { Entry, FuelLog, Vehicle } from '../../db/schema'
import { ENTRY_TYPE_LABELS } from '../entryTypes'

const dec = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

/** Échappe un champ CSV (séparateur « ; ») et neutralise l'injection de formules dans Excel/Numbers. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const toCsv = (rows: (string | number | null | undefined)[][]) =>
  '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'

export function entriesToCsv(entries: Entry[], vehicles: Vehicle[]): string {
  const name = (id: number) => vehicles.find((v) => v.id === id)?.name ?? ''
  const rows: (string | number | null)[][] = [
    ['Date', 'Véhicule', 'Type', 'Montant TTC (€)', 'Montant HT (€)', 'TVA (€)', 'Kilométrage', 'Garage', 'Notes', 'Pièce jointe'],
  ]
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date)))
    rows.push([e.date, name(e.vehicleId), ENTRY_TYPE_LABELS[e.type], dec(e.amount), dec(e.amountHT), dec(e.vat), e.km ?? '', e.garage, e.notes, e.documentId != null ? 'Oui' : 'Non'])
  return toCsv(rows)
}

export function fuelToCsv(logs: FuelLog[], vehicles: Vehicle[]): string {
  const name = (id: number) => vehicles.find((v) => v.id === id)?.name ?? ''
  const rows: (string | number | null)[][] = [['Date', 'Véhicule', 'Litres', 'Total (€)', 'Prix au litre (€)', 'Kilométrage', 'Plein complet']]
  for (const f of [...logs].sort((a, b) => a.date.localeCompare(b.date)))
    rows.push([f.date, name(f.vehicleId), dec(f.liters), dec(f.total), dec(f.liters > 0 ? Math.round((f.total / f.liters) * 1000) / 1000 : null), f.km ?? '', f.full ? 'Oui' : 'Non'])
  return toCsv(rows)
}
