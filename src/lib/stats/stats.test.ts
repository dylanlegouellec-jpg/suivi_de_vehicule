import { describe, expect, it } from 'vitest'
import type { Entry, FuelLog } from '../../db/schema'
import { computeConsumption } from './fuel'
import { buildCostItems, costByCategory, costByMonth, costByYear, costPerKm, distanceKm, presetPeriod, totalCost } from './stats'

const log = (o: Partial<FuelLog>): FuelLog => ({ vehicleId: 1, date: '2025-01-01', liters: 40, total: 70, km: 1000, full: true, ...o })

describe('consommation L/100 km', () => {
  it('deux pleins complets consécutifs', () => {
    const r = computeConsumption([log({ date: '2025-01-01', km: 1000 }), log({ date: '2025-01-15', km: 1500, liters: 30 })])
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0].lPer100).toBeCloseTo(6, 5)
    expect(r.average).toBeCloseTo(6, 5)
  })
  it('un seul plein : pas de moyenne', () => {
    expect(computeConsumption([log({})]).average).toBeNull()
  })
  it('les pleins partiels intermédiaires sont additionnés', () => {
    const r = computeConsumption([
      log({ date: '2025-01-01', km: 1000 }),
      log({ date: '2025-01-05', km: 1200, liters: 20, full: false }),
      log({ date: '2025-01-10', km: 1500, liters: 10 }),
    ])
    expect(r.segments[0].liters).toBe(30)
    expect(r.segments[0].lPer100).toBeCloseTo(6, 5)
  })
  it('un plein partiel avant le premier plein complet est ignoré', () => {
    const r = computeConsumption([
      log({ date: '2024-12-20', km: 800, liters: 15, full: false }),
      log({ date: '2025-01-01', km: 1000 }),
      log({ date: '2025-01-15', km: 1500, liters: 30 }),
    ])
    expect(r.average).toBeCloseTo(6, 5)
  })
  it('moyenne pondérée sur plusieurs segments', () => {
    const r = computeConsumption([
      log({ date: '2025-01-01', km: 0 }),
      log({ date: '2025-01-10', km: 500, liters: 30 }), // 6
      log({ date: '2025-01-20', km: 1000, liters: 35 }), // 7
    ])
    expect(r.segments.map((s) => Number(s.lPer100.toFixed(1)))).toEqual([6, 7])
    expect(r.average).toBeCloseTo(6.5, 5)
  })
  it('kilométrage non croissant : segment ignoré avec avertissement', () => {
    const r = computeConsumption([log({ date: '2025-01-01', km: 2000 }), log({ date: '2025-01-10', km: 1900 })])
    expect(r.segments[0].valid).toBe(false)
    expect(r.average).toBeNull()
    expect(r.warnings.length).toBe(1)
  })
  it('plein complet sans km : la chaîne est rompue', () => {
    const r = computeConsumption([
      log({ date: '2025-01-01', km: 1000 }),
      log({ date: '2025-01-10', km: null }),
      log({ date: '2025-01-20', km: 1600, liters: 36 }),
    ])
    expect(r.segments).toHaveLength(0)
    expect(r.warnings.length).toBe(1)
  })
  it('valeur aberrante exclue de la moyenne', () => {
    const r = computeConsumption([
      log({ date: '2025-01-01', km: 1000 }),
      log({ date: '2025-01-10', km: 1050, liters: 60 }), // 120 L/100
      log({ date: '2025-01-20', km: 1550, liters: 30 }), // 6
    ])
    expect(r.segments[0].valid).toBe(false)
    expect(r.average).toBeCloseTo(6, 5)
  })
  it('trie par date quelle que soit la saisie', () => {
    const r = computeConsumption([log({ date: '2025-01-15', km: 1500, liters: 30 }), log({ date: '2025-01-01', km: 1000 })])
    expect(r.average).toBeCloseTo(6, 5)
  })
})

const entry = (o: Partial<Entry>): Entry => ({ vehicleId: 1, type: 'vidange', date: '2025-01-10', amount: 100, km: null, garage: '', notes: '', documentId: null, ...o })

describe('statistiques', () => {
  const entries = [
    entry({ amount: 100, type: 'vidange', date: '2025-01-10', km: 10000 }),
    entry({ amount: 400, type: 'reparation', date: '2025-03-05' }),
    entry({ amount: 600, type: 'assurance', date: '2025-03-20' }),
    entry({ amount: 80, type: 'controle_technique', date: '2024-12-01', km: 9000 }),
    entry({ amount: null, type: 'autre', date: '2025-02-01' }),
  ]
  const fuel = [log({ date: '2025-02-10', total: 70, km: 10500 }), log({ date: '2025-02-20', total: 0, km: null })]
  const items = buildCostItems(entries, fuel)

  it('ignore les montants vides et nuls, ajoute le carburant', () => {
    expect(items).toHaveLength(5)
    expect(totalCost(items)).toBe(1250)
  })
  it('coût par mois avec mois vides comblés', () => {
    const m = costByMonth(items)
    expect(m.map((x) => x.key)).toEqual(['2024-12', '2025-01', '2025-02', '2025-03'])
    expect(m.map((x) => x.total)).toEqual([80, 100, 70, 1000])
  })
  it('coût par année', () => {
    expect(costByYear(items)).toEqual([{ year: '2024', total: 80 }, { year: '2025', total: 1170 }])
  })
  it('répartition par catégorie', () => {
    const c = costByCategory(items)
    expect(c.find((x) => x.category === 'assurance')?.total).toBe(600)
    expect(c.find((x) => x.category === 'reparations')?.total).toBe(400)
    expect(c.find((x) => x.category === 'carburant')?.total).toBe(70)
    expect(c.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 5)
  })
  it('distance et coût au km', () => {
    const obs = [...entries, ...fuel.map((f) => ({ ...f }))].map((o) => ({ vehicleId: o.vehicleId, date: o.date, km: o.km }))
    const d = distanceKm(obs, { from: '', to: '' })
    expect(d).toBe(1500) // 9000 → 10500
    expect(costPerKm(1250, d)).toBeCloseTo(0.8333, 3)
    expect(distanceKm(obs, { from: '2025-02-01', to: '2025-12-31' })).toBe(0) // un seul relevé : ignoré
    expect(costPerKm(100, 0)).toBeNull()
  })
  it('périodes prédéfinies', () => {
    expect(presetPeriod('year', '2025-06-15', { from: '', to: '' })).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(presetPeriod('lastyear', '2025-06-15', { from: '', to: '' })).toEqual({ from: '2024-01-01', to: '2024-12-31' })
    expect(presetPeriod('12m', '2025-06-15', { from: '', to: '' })).toEqual({ from: '2024-06-16', to: '2025-06-15' })
    expect(presetPeriod('all', '2025-06-15', { from: '', to: '' })).toEqual({ from: '', to: '' })
  })
})
