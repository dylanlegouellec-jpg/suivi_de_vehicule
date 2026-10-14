import type { Entry, FuelLog } from '../../db/schema'
import { categoryOf, type Category } from '../entryTypes'

export interface CostItem {
  vehicleId: number
  date: string
  amount: number
  category: Category
}

export interface Period { from: string; to: string } // '' = illimité

export type MonthCost = { key: string; total: number }
export type YearCost = { year: string; total: number }
export type CategoryCost = { category: Category; total: number; share: number }

/** Dépenses unifiées : entrées (par catégorie) + pleins de carburant. Une entrée de type « carburant » compte aussi. */
export function buildCostItems(entries: Entry[], fuelLogs: FuelLog[]): CostItem[] {
  const items: CostItem[] = []
  for (const e of entries) {
    if (e.amount != null && e.amount > 0)
      items.push({ vehicleId: e.vehicleId, date: e.date, amount: e.amount, category: categoryOf(e.type) })
  }
  for (const f of fuelLogs) {
    if (f.total > 0) items.push({ vehicleId: f.vehicleId, date: f.date, amount: f.total, category: 'carburant' })
  }
  return items
}

export const inPeriod = (date: string, p: Period) => (!p.from || date >= p.from) && (!p.to || date <= p.to)

export const totalCost = (items: CostItem[]) => Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100

/**
 * Distance parcourue sur la période = somme, par véhicule, de (km max − km min) observés
 * (entrées + pleins) dans la période. Moins de 2 relevés pour un véhicule : il est ignoré.
 */
export function distanceKm(
  observations: { vehicleId: number; date: string; km: number | null }[],
  p: Period,
): number {
  const byVehicle = new Map<number, number[]>()
  for (const o of observations) {
    if (o.km == null || !inPeriod(o.date, p)) continue
    byVehicle.set(o.vehicleId, [...(byVehicle.get(o.vehicleId) ?? []), o.km])
  }
  let total = 0
  for (const kms of byVehicle.values()) if (kms.length >= 2) total += Math.max(...kms) - Math.min(...kms)
  return total
}

/** Coût au km ; null si la distance est inconnue. */
export function costPerKm(total: number, distance: number): number | null {
  return distance > 0 ? total / distance : null
}

/** Coût par mois, mois vides inclus entre le premier et le dernier mois. */
export function costByMonth(items: CostItem[]): MonthCost[] {
  if (!items.length) return []
  const sums = new Map<string, number>()
  for (const i of items) {
    const k = i.date.slice(0, 7)
    sums.set(k, (sums.get(k) ?? 0) + i.amount)
  }
  const keys = [...sums.keys()].sort()
  const out: MonthCost[] = []
  let [y, m] = keys[0].split('-').map(Number)
  const [ly, lm] = keys[keys.length - 1].split('-').map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    out.push({ key: k, total: Math.round((sums.get(k) ?? 0) * 100) / 100 })
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

export function costByYear(items: CostItem[]): YearCost[] {
  const sums = new Map<string, number>()
  for (const i of items) sums.set(i.date.slice(0, 4), (sums.get(i.date.slice(0, 4)) ?? 0) + i.amount)
  return [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, t]) => ({ year, total: Math.round(t * 100) / 100 }))
}

export const CATEGORY_ORDER: Category[] = ['carburant', 'entretien', 'reparations', 'assurance', 'controle_technique', 'autre']

export function costByCategory(items: CostItem[]): CategoryCost[] {
  const total = items.reduce((s, i) => s + i.amount, 0)
  return CATEGORY_ORDER.map((category) => {
    const t = items.filter((i) => i.category === category).reduce((s, i) => s + i.amount, 0)
    return { category, total: Math.round(t * 100) / 100, share: total > 0 ? t / total : 0 }
  }).filter((c) => c.total > 0)
}

export type PeriodPreset = '12m' | 'year' | 'lastyear' | 'all' | 'custom'

export function presetPeriod(preset: PeriodPreset, today: string, custom: Period): Period {
  const y = Number(today.slice(0, 4))
  switch (preset) {
    case '12m': {
      const d = new Date(`${today}T00:00:00Z`)
      d.setUTCFullYear(d.getUTCFullYear() - 1)
      d.setUTCDate(d.getUTCDate() + 1)
      return { from: d.toISOString().slice(0, 10), to: today }
    }
    case 'year': return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'lastyear': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case 'all': return { from: '', to: '' }
    case 'custom': return custom
  }
}
