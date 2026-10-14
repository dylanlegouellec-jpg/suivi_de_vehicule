import type { Entry, FuelLog, Vehicle } from '../../db/schema'
import { CATEGORY_LABELS, ENTRY_TYPE_LABELS, categoryOf, type Category } from '../entryTypes'

export interface CarnetRow { date: string; type: string; km: number | null; garage: string; amount: number | null; notes: string }

export interface CarnetData {
  vehicle: Vehicle
  rows: CarnetRow[]
  total: number
  byCategory: { label: string; total: number }[]
  fuelTotal: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Données du carnet d'entretien d'un véhicule (interventions triées par date, totaux de coûts). */
export function buildCarnet(vehicle: Vehicle, entries: Entry[], fuelLogs: FuelLog[]): CarnetData {
  const mine = entries.filter((e) => e.vehicleId === vehicle.id).sort((a, b) => a.date.localeCompare(b.date))
  const rows = mine.map((e) => ({
    date: e.date, type: ENTRY_TYPE_LABELS[e.type], km: e.km, garage: e.garage, amount: e.amount, notes: e.notes,
  }))
  const sums = new Map<Category, number>()
  for (const e of mine) if (e.amount) sums.set(categoryOf(e.type), (sums.get(categoryOf(e.type)) ?? 0) + e.amount)
  const fuelTotal = r2(fuelLogs.filter((f) => f.vehicleId === vehicle.id).reduce((s, f) => s + f.total, 0))
  return {
    vehicle,
    rows,
    total: r2(mine.reduce((s, e) => s + (e.amount ?? 0), 0)),
    byCategory: [...sums.entries()].map(([c, t]) => ({ label: CATEGORY_LABELS[c], total: r2(t) })).sort((a, b) => b.total - a.total),
    fuelTotal,
  }
}
