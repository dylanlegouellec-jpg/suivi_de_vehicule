import type { FuelLog } from '../../db/schema'

export interface ConsumptionSegment {
  /** Date du plein complet qui clôt le segment. */
  date: string
  km: number // distance parcourue sur le segment
  liters: number // litres consommés (pleins intermédiaires inclus)
  lPer100: number
  valid: boolean
  /** Raison d'exclusion si invalide. */
  issue?: string
}

export interface ConsumptionResult {
  segments: ConsumptionSegment[]
  /** Moyenne pondérée (total litres / total km × 100) sur les segments valides. */
  average: number | null
  warnings: string[]
}

export const MIN_L100 = 1
export const MAX_L100 = 40

/**
 * Consommation sur pleins complets consécutifs.
 * Entre deux pleins complets A et B, on additionne les litres de tous les pleins après A jusqu'à B inclus
 * (les pleins partiels intermédiaires comptent) et on divise par (km_B − km_A).
 * Cas incohérents : km manquant sur un plein complet (chaîne rompue), km non croissant, valeur aberrante.
 */
export function computeConsumption(logs: FuelLog[]): ConsumptionResult {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date) || (a.km ?? 0) - (b.km ?? 0))
  const segments: ConsumptionSegment[] = []
  const warnings: string[] = []
  let ref: { km: number } | null = null
  let liters = 0

  for (const log of sorted) {
    if (!log.full) {
      if (ref) liters += log.liters
      continue
    }
    if (log.km == null) {
      if (ref) warnings.push(`Plein complet du ${log.date} sans kilométrage : calcul interrompu.`)
      ref = null
      liters = 0
      continue
    }
    if (ref) {
      const km = log.km - ref.km
      const total = liters + log.liters
      if (km <= 0) {
        warnings.push(`Kilométrage non croissant au plein du ${log.date} : segment ignoré.`)
        segments.push({ date: log.date, km, liters: total, lPer100: NaN, valid: false, issue: 'Kilométrage non croissant' })
      } else {
        const l100 = (total / km) * 100
        const ok = l100 >= MIN_L100 && l100 <= MAX_L100
        if (!ok) warnings.push(`Consommation aberrante (${l100.toFixed(1)} L/100 km) au plein du ${log.date} : ignorée.`)
        segments.push({
          date: log.date, km, liters: total, lPer100: l100, valid: ok,
          issue: ok ? undefined : 'Valeur aberrante',
        })
      }
    }
    ref = { km: log.km }
    liters = 0
  }

  const valid = segments.filter((s) => s.valid)
  const totalKm = valid.reduce((s, x) => s + x.km, 0)
  const totalL = valid.reduce((s, x) => s + x.liters, 0)
  return { segments, average: totalKm > 0 ? (totalL / totalKm) * 100 : null, warnings }
}

export const pricePerLiter = (log: Pick<FuelLog, 'total' | 'liters'>) => (log.liters > 0 ? log.total / log.liters : 0)
