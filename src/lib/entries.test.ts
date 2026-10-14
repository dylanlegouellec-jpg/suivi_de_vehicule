import { describe, expect, it } from 'vitest'
import type { Entry } from '../db/schema'
import { emptyFilters, filterEntries, findDuplicate, sortEntries } from './entries'

const mk = (o: Partial<Entry>): Entry => ({
  id: 1, vehicleId: 1, type: 'vidange', date: '2025-03-12', amount: 100, km: null,
  garage: 'Garage Dupont', notes: '', documentId: null, ...o,
})

describe('filterEntries', () => {
  const list = [
    mk({ id: 1 }),
    mk({ id: 2, type: 'pneus', date: '2024-01-05', garage: 'Éuro Pneus' }),
    mk({ id: 3, type: 'freins', date: '2025-06-01', notes: 'plaquettes avant' }),
  ]
  it('filtre par type', () => expect(filterEntries(list, { ...emptyFilters(), type: 'pneus' }).map((e) => e.id)).toEqual([2]))
  it('filtre par période', () =>
    expect(filterEntries(list, { ...emptyFilters(), from: '2025-01-01', to: '2025-04-01' }).map((e) => e.id)).toEqual([1]))
  it('recherche insensible aux accents et à la casse', () =>
    expect(filterEntries(list, { ...emptyFilters(), text: 'euro' }).map((e) => e.id)).toEqual([2]))
  it('cherche dans les notes', () =>
    expect(filterEntries(list, { ...emptyFilters(), text: 'PLAQUETTES' }).map((e) => e.id)).toEqual([3]))
})

describe('sortEntries', () => {
  const list = [mk({ id: 1, amount: 50 }), mk({ id: 2, date: '2025-05-01', amount: null }), mk({ id: 3, date: '2024-01-01', amount: 200 })]
  it('date décroissante', () => expect(sortEntries(list, 'date_desc').map((e) => e.id)).toEqual([2, 1, 3]))
  it('montant décroissant, sans montant en dernier', () =>
    expect(sortEntries(list, 'amount_desc').map((e) => e.id)).toEqual([3, 1, 2]))
})

describe('findDuplicate', () => {
  const list = [mk({ id: 1 })]
  it('détecte même date + montant + véhicule', () =>
    expect(findDuplicate(list, { vehicleId: 1, date: '2025-03-12', amount: 100 })?.id).toBe(1))
  it('ignore un autre véhicule', () =>
    expect(findDuplicate(list, { vehicleId: 2, date: '2025-03-12', amount: 100 })).toBeUndefined())
  it("s'ignore soi-même en édition", () =>
    expect(findDuplicate(list, { vehicleId: 1, date: '2025-03-12', amount: 100 }, 1)).toBeUndefined())
  it('pas de doublon sans montant', () =>
    expect(findDuplicate(list, { vehicleId: 1, date: '2025-03-12', amount: null })).toBeUndefined())
})
