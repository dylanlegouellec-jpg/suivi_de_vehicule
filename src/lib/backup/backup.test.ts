import { describe, expect, it } from 'vitest'
import type { Entry, FuelLog, Vehicle } from '../../db/schema'
import { buildCarnet } from '../export/carnet'
import { csvCell, entriesToCsv, fuelToCsv } from '../export/csv'
import {
  BackupError, backupDue, decodeBlob, encodeBlob, mergeSnapshots, parseBackup, snapshotToBackup, type Snapshot,
} from './format'

const veh = (o: Partial<Vehicle> = {}): Vehicle => ({
  id: 1, name: 'Clio', brand: 'Renault', model: 'Clio', year: 2019, plate: 'AB-123-CD', fuel: 'essence',
  firstRegistration: '2019-03-15', mileage: 50000, photo: null, createdAt: 1, ...o,
})
const ent = (o: Partial<Entry> = {}): Entry => ({
  id: 1, vehicleId: 1, type: 'vidange', date: '2025-03-12', amount: 147, km: 85000, garage: 'Garage Dupont', notes: '', documentId: null, ...o,
})
const empty = (): Snapshot => ({ vehicles: [], documents: [], entries: [], fuelLogs: [], reminderRules: [], settings: [] })

describe('sauvegarde JSON', () => {
  it('blob → base64 → blob (aller-retour)', async () => {
    const bytes = new Uint8Array(70000).map((_, i) => i % 256) // > 1 chunk
    const enc = await encodeBlob(new Blob([bytes], { type: 'application/pdf' }))
    const back = decodeBlob(enc)
    expect(back.type).toBe('application/pdf')
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes)
  })

  it('export puis import restituent les données (pièces jointes comprises)', async () => {
    const snap: Snapshot = {
      ...empty(),
      vehicles: [veh({ photo: new Blob(['photo'], { type: 'image/jpeg' }) })],
      documents: [{ id: 5, name: 'facture.pdf', mime: 'application/pdf', blob: new Blob(['%PDF-1'], { type: 'application/pdf' }), createdAt: 9 }],
      entries: [ent({ documentId: 5 })],
      fuelLogs: [{ id: 1, vehicleId: 1, date: '2025-01-01', liters: 40, total: 70, km: 1000, full: true }],
      reminderRules: [{ id: 1, vehicleId: 1, type: 'vidange', label: 'Vidange', everyMonths: 12, everyKm: 15000 }],
      settings: [{ key: 'activeVehicleId', value: 1 }, { key: 'lastBackupAt', value: 123 }],
    }
    const file = await snapshotToBackup(snap)
    const back = parseBackup(JSON.stringify(file))
    expect(back.entries).toEqual(snap.entries)
    expect(back.fuelLogs).toEqual(snap.fuelLogs)
    expect(back.reminderRules).toEqual(snap.reminderRules)
    expect(await back.documents[0].blob!.text()).toBe('%PDF-1')
    expect(await back.vehicles[0].photo!.text()).toBe('photo')
    expect(back.settings.map((s) => s.key)).toEqual(['activeVehicleId']) // lastBackupAt non sauvegardé
  })

  it('refuse les fichiers invalides avec un message clair', () => {
    expect(() => parseBackup('pas du json')).toThrow(BackupError)
    expect(() => parseBackup('{"a":1}')).toThrow(/pas une sauvegarde AutoSuivi/)
    expect(() => parseBackup(JSON.stringify({ app: 'autosuivi', version: 99, data: {} }))).toThrow(/plus récente/)
    expect(() => parseBackup(JSON.stringify({ app: 'autosuivi', version: 1, data: { entries: [{ id: 1 }] } }))).toThrow(/incomplète/)
    expect(() => parseBackup(JSON.stringify({ app: 'autosuivi', version: 1, data: { entries: 'x' } }))).toThrow(/invalide/)
  })

  it('accepte une sauvegarde sans certaines tables', () => {
    const s = parseBackup(JSON.stringify({ app: 'autosuivi', version: 1, data: { vehicles: [{ id: 1, name: 'A' }] } }))
    expect(s.vehicles).toHaveLength(1)
    expect(s.entries).toEqual([])
  })
})

describe('fusion', () => {
  const existing: Snapshot = { ...empty(), vehicles: [veh()], entries: [ent()] }

  it('réutilise le véhicule identique et ignore les doublons', () => {
    const incoming: Snapshot = { ...empty(), vehicles: [veh({ id: 7 })], entries: [ent({ id: 3, vehicleId: 7 })] }
    const r = mergeSnapshots(existing, incoming)
    expect(r.add.vehicles).toHaveLength(0)
    expect(r.add.entries).toHaveLength(0)
    expect(r.summary.skipped).toBe(1)
  })

  it('ajoute les nouveautés avec des identifiants réattribués et remappe véhicule et document', () => {
    const incoming: Snapshot = {
      ...empty(),
      vehicles: [veh({ id: 1 }), veh({ id: 2, name: 'Moto', plate: 'ZZ-999-ZZ' })],
      documents: [{ id: 4, name: 'f.pdf', mime: 'application/pdf', blob: new Blob(['x']), createdAt: 1 }],
      entries: [ent({ id: 10, vehicleId: 2, date: '2024-01-01', documentId: 4 }), ent({ id: 11, vehicleId: 1, date: '2025-06-01' })],
      fuelLogs: [{ id: 1, vehicleId: 2, date: '2025-01-01', liters: 10, total: 20, km: 5, full: true }],
      reminderRules: [{ id: 1, vehicleId: 2, type: 'vidange', label: 'Vidange', everyMonths: 12, everyKm: null }],
    }
    const r = mergeSnapshots(existing, incoming)
    expect(r.add.vehicles.map((v) => [v.id, v.name])).toEqual([[2, 'Moto']])
    expect(r.add.entries.map((e) => [e.id, e.vehicleId, e.documentId])).toEqual([[2, 2, 1], [3, 1, null]])
    expect(r.add.documents.map((d) => [d.id, d.vehicleId])).toEqual([[1, 2]])
    expect(r.add.fuelLogs[0].vehicleId).toBe(2)
    expect(r.add.reminderRules[0].vehicleId).toBe(2)
    expect(r.summary).toMatchObject({ vehicles: 1, entries: 2, fuelLogs: 1, reminderRules: 1, skipped: 0 })
  })

  it('une entrée orpheline (véhicule absent) est ignorée', () => {
    const r = mergeSnapshots(empty(), { ...empty(), entries: [ent({ vehicleId: 99 })] })
    expect(r.add.entries).toHaveLength(0)
    expect(r.summary.skipped).toBe(1)
  })

  it('la fusion est idempotente', () => {
    const incoming: Snapshot = { ...empty(), vehicles: [veh({ id: 5, name: 'Moto', plate: 'X' })], entries: [ent({ id: 5, vehicleId: 5 })] }
    const first = mergeSnapshots(existing, incoming)
    const merged: Snapshot = { ...existing, vehicles: [...existing.vehicles, ...first.add.vehicles], entries: [...existing.entries, ...first.add.entries] }
    const second = mergeSnapshots(merged, incoming)
    expect(second.summary.entries + second.summary.vehicles).toBe(0)
  })
})

describe('rappel de sauvegarde', () => {
  const DAY = 86_400_000
  const now = 100 * DAY
  it('due après plus de 30 jours', () => {
    expect(backupDue({ lastBackupAt: now - 31 * DAY, firstDataAt: null, now })).toBe(true)
    expect(backupDue({ lastBackupAt: now - 30 * DAY, firstDataAt: null, now })).toBe(false)
    expect(backupDue({ lastBackupAt: now - 2 * DAY, firstDataAt: now - 90 * DAY, now })).toBe(false)
  })
  it('sans sauvegarde : se base sur la création des premières données', () => {
    expect(backupDue({ lastBackupAt: null, firstDataAt: now - 40 * DAY, now })).toBe(true)
    expect(backupDue({ lastBackupAt: null, firstDataAt: now - 5 * DAY, now })).toBe(false)
  })
  it('jamais due sans données', () => {
    expect(backupDue({ lastBackupAt: null, firstDataAt: null, now })).toBe(false)
  })
})

describe('export CSV', () => {
  it('échappe guillemets, point-virgule et sauts de ligne', () => {
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('dit "ok"')).toBe('"dit ""ok"""')
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"')
  })
  it('neutralise les formules mais garde les nombres', () => {
    expect(csvCell('=SOMME(A1)')).toBe("'=SOMME(A1)")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('-5')).toBe('-5')
  })
  it('historique : BOM, séparateur « ; », décimales françaises', () => {
    const csv = entriesToCsv([ent({ amount: 147.5, notes: 'RAS; ok' })], [veh()])
    expect(csv.startsWith('﻿Date;Véhicule;Type')).toBe(true)
    expect(csv).toContain('2025-03-12;Clio;Vidange;147,5;;;85000;Garage Dupont;"RAS; ok";Non')
  })
  it('carburant', () => {
    const csv = fuelToCsv([{ id: 1, vehicleId: 1, date: '2025-01-01', liters: 40, total: 72, km: 1000, full: true }], [veh()])
    expect(csv).toContain('2025-01-01;Clio;40;72;1,8;1000;Oui')
  })
})

describe('carnet d’entretien', () => {
  it('trie, totalise et ventile par catégorie', () => {
    const c = buildCarnet(
      veh(),
      [ent({ id: 1, amount: 100, date: '2025-05-01' }), ent({ id: 2, amount: 400, type: 'reparation', date: '2024-02-01' }), ent({ id: 3, vehicleId: 2, amount: 999 }), ent({ id: 4, amount: null, type: 'autre' })],
      [{ id: 1, vehicleId: 1, date: '2025-01-01', liters: 40, total: 72, km: null, full: true }] as FuelLog[],
    )
    expect(c.rows[0].date).toBe('2024-02-01')
    expect(c.total).toBe(500)
    expect(c.byCategory).toEqual([{ label: 'Réparations', total: 400 }, { label: 'Entretien', total: 100 }])
    expect(c.fuelTotal).toBe(72)
  })
})
