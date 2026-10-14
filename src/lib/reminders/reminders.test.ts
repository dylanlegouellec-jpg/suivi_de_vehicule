import { describe, expect, it } from 'vitest'
import type { ReminderRule } from '../../db/schema'
import { computeReminder, groupReminders, SOON_DAYS, type ReminderContext } from './compute'
import { nextTechnicalInspection } from './ctRule'
import { addMonths, daysBetween } from './dates'

const rule = (o: Partial<ReminderRule>): ReminderRule => ({
  id: 1, vehicleId: 1, type: 'vidange', label: 'Vidange', everyMonths: 12, everyKm: 15000, ...o,
})
const ctx = (o: Partial<ReminderContext> = {}): ReminderContext => ({
  today: '2025-06-01',
  vehicle: { mileage: 50000, firstRegistration: '2020-03-15' },
  entries: [],
  ...o,
})

describe('dates', () => {
  it('addMonths gère les fins de mois et les années', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2025-11-15', 3)).toBe('2026-02-15')
    expect(addMonths('2025-03-12', 12)).toBe('2026-03-12')
    expect(addMonths('2020-03-15', 48)).toBe('2024-03-15')
  })
  it('daysBetween', () => {
    expect(daysBetween('2025-06-01', '2025-06-11')).toBe(10)
    expect(daysBetween('2025-06-11', '2025-06-01')).toBe(-10)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
  })
})

describe('règle du contrôle technique', () => {
  it('première échéance à 4 ans après la mise en circulation', () => {
    expect(nextTechnicalInspection('2020-03-15', null)).toBe('2024-03-15')
  })
  it('puis tous les 2 ans à partir du dernier contrôle', () => {
    expect(nextTechnicalInspection('2020-03-15', '2024-02-10')).toBe('2026-02-10')
  })
  it('sans aucune information : pas d’échéance', () => {
    expect(nextTechnicalInspection(null, null)).toBeNull()
  })
  it('computeReminder : CT jamais fait, véhicule de 2020 → en retard en 2025', () => {
    const r = computeReminder(rule({ type: 'controle_technique', everyMonths: 24, everyKm: null }), ctx())
    expect(r.dueDate).toBe('2024-03-15')
    expect(r.state).toBe('overdue')
  })
  it('computeReminder : le dernier CT enregistré prime et ignore everyMonths', () => {
    const r = computeReminder(
      rule({ type: 'controle_technique', everyMonths: 6, everyKm: null }),
      ctx({ entries: [{ type: 'controle_technique', date: '2024-09-15', km: 45000 }] }),
    )
    expect(r.dueDate).toBe('2026-09-15')
    expect(r.state).toBe('later')
  })
  it('computeReminder : CT sans date de mise en circulation ni historique → inconnu', () => {
    const r = computeReminder(
      rule({ type: 'controle_technique', everyKm: null }),
      ctx({ vehicle: { mileage: 1, firstRegistration: null } }),
    )
    expect(r.state).toBe('unknown')
    expect(r.reason).toBeTruthy()
  })
})

describe('calcul des échéances', () => {
  const vid = (date: string, km: number | null) => ({ type: 'vidange' as const, date, km })

  it('échéance par date et par km à partir du dernier entretien du même type', () => {
    const r = computeReminder(rule({}), ctx({ entries: [vid('2025-01-10', 40000), vid('2024-01-05', 25000)] }))
    expect(r.lastDate).toBe('2025-01-10')
    expect(r.dueDate).toBe('2026-01-10')
    expect(r.dueKm).toBe(55000)
    expect(r.daysLeft).toBe(223)
    expect(r.kmLeft).toBe(5000)
    expect(r.state).toBe('later')
  })
  it('ignore les entretiens d’un autre type', () => {
    const r = computeReminder(rule({}), ctx({ entries: [{ type: 'pneus', date: '2025-05-01', km: 49000 }] }))
    expect(r.state).toBe('unknown')
  })
  it('en retard par date', () => {
    const r = computeReminder(rule({ everyKm: null }), ctx({ entries: [vid('2024-01-10', null)] }))
    expect(r.state).toBe('overdue')
    expect(r.daysLeft).toBeLessThan(0)
  })
  it('en retard par km même si la date est lointaine', () => {
    const r = computeReminder(rule({}), ctx({ entries: [vid('2025-05-01', 30000)] }))
    expect(r.dueKm).toBe(45000)
    expect(r.kmLeft).toBe(-5000)
    expect(r.state).toBe('overdue')
  })
  it('bientôt : à 30 jours', () => {
    const r = computeReminder(rule({ everyKm: null }), ctx({ entries: [vid('2024-07-01', null)] }))
    expect(r.daysLeft).toBe(30)
    expect(SOON_DAYS).toBe(30)
    expect(r.state).toBe('soon')
  })
  it('plus tard : à 31 jours', () => {
    const r = computeReminder(rule({ everyKm: null }), ctx({ entries: [vid('2024-07-02', null)] }))
    expect(r.daysLeft).toBe(31)
    expect(r.state).toBe('later')
  })
  it('bientôt : à 1 000 km', () => {
    const r = computeReminder(rule({ everyMonths: null }), ctx({ entries: [vid('2025-01-01', 36000)] }))
    expect(r.kmLeft).toBe(1000)
    expect(r.state).toBe('soon')
  })
  it('le pire des deux critères l’emporte', () => {
    const r = computeReminder(rule({}), ctx({ entries: [vid('2025-05-20', 49500)] }))
    expect(r.state).toBe('later')
    const r2 = computeReminder(rule({}), ctx({ entries: [vid('2024-06-20', 49500)] }))
    expect(r2.state).toBe('soon') // date dans 19 jours, km loin
  })
  it('dernier entretien sans km : seule la date compte', () => {
    const r = computeReminder(rule({}), ctx({ entries: [vid('2025-01-10', null)] }))
    expect(r.dueKm).toBeNull()
    expect(r.state).toBe('later')
  })
  it('kilométrage du véhicule inconnu : seule la date compte', () => {
    const r = computeReminder(rule({}), ctx({ vehicle: { mileage: null, firstRegistration: null }, entries: [vid('2025-01-10', 40000)] }))
    expect(r.kmLeft).toBeNull()
    expect(r.state).toBe('later')
  })
  it('rappel personnalisé basé sur baseDate/baseKm', () => {
    const r = computeReminder(
      rule({ type: 'personnalise', label: 'Filtre à pollen', everyMonths: 6, everyKm: null, baseDate: '2024-10-01' }),
      ctx(),
    )
    expect(r.dueDate).toBe('2025-04-01')
    expect(r.state).toBe('overdue')
  })
  it('baseDate plus récente que l’historique : elle prime', () => {
    const r = computeReminder(rule({ baseDate: '2025-05-15', baseKm: 49000 }), ctx({ entries: [vid('2024-01-01', 20000)] }))
    expect(r.lastDate).toBe('2025-05-15')
    expect(r.dueKm).toBe(64000)
  })
  it('sans aucune périodicité : inconnu', () => {
    const r = computeReminder(rule({ everyMonths: null, everyKm: null }), ctx({ entries: [vid('2025-01-10', 40000)] }))
    expect(r.state).toBe('unknown')
  })
})

describe('groupReminders', () => {
  it('classe et trie par urgence', () => {
    const e = (date: string) => [{ type: 'vidange' as const, date, km: null }]
    const a = computeReminder(rule({ id: 1, everyKm: null }), ctx({ entries: e('2024-01-01') })) // en retard (long)
    const b = computeReminder(rule({ id: 2, everyKm: null }), ctx({ entries: e('2024-05-01') })) // en retard (court)
    const c = computeReminder(rule({ id: 3, everyKm: null }), ctx({ entries: e('2025-05-01') })) // plus tard
    const g = groupReminders([c, b, a])
    expect(g.overdue.map((x) => x.rule.id)).toEqual([1, 2])
    expect(g.later.map((x) => x.rule.id)).toEqual([3])
  })
})
