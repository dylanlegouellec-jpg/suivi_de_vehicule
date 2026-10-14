import type { DocumentRecord, Entry, FuelLog, ReminderRule, SettingRecord, Vehicle } from '../../db/schema'

export const BACKUP_VERSION = 1

export interface Snapshot {
  vehicles: Vehicle[]
  documents: DocumentRecord[]
  entries: Entry[]
  fuelLogs: FuelLog[]
  reminderRules: ReminderRule[]
  settings: SettingRecord[]
}

interface EncodedBlob { mime: string; data: string } // data = base64

export interface BackupFile {
  app: 'autosuivi'
  version: number
  exportedAt: string
  data: {
    vehicles: (Omit<Vehicle, 'photo'> & { photo: EncodedBlob | null })[]
    documents: (Omit<DocumentRecord, 'blob'> & { blob: EncodedBlob })[]
    entries: Entry[]
    fuelLogs: FuelLog[]
    reminderRules: ReminderRule[]
    settings: SettingRecord[]
  }
}

/** Réglages locaux à ne pas sauvegarder (dépendent de l'appareil). */
export const EPHEMERAL_SETTINGS = ['lastBackupAt']

export async function encodeBlob(b: Blob): Promise<EncodedBlob> {
  const bytes = new Uint8Array(await b.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return { mime: b.type, data: btoa(bin) }
}

export function decodeBlob(e: EncodedBlob): Blob {
  const bin = atob(e.data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: e.mime })
}

export async function snapshotToBackup(s: Snapshot, now = new Date()): Promise<BackupFile> {
  return {
    app: 'autosuivi',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      vehicles: await Promise.all(s.vehicles.map(async (v) => ({ ...v, photo: v.photo ? await encodeBlob(v.photo) : null }))),
      documents: await Promise.all(s.documents.map(async (d) => ({ ...d, blob: await encodeBlob(d.blob) }))),
      entries: s.entries,
      fuelLogs: s.fuelLogs,
      reminderRules: s.reminderRules,
      settings: s.settings.filter((x) => !EPHEMERAL_SETTINGS.includes(x.key)),
    },
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isBlobObj = (x: unknown) => isObj(x) && typeof x.data === 'string' && typeof x.mime === 'string'

export class BackupError extends Error {}

/** Valide un fichier de sauvegarde (texte JSON) et le convertit en Snapshot. Lève BackupError avec un message clair. */
export function parseBackup(text: string): Snapshot {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError("Ce fichier n'est pas un JSON valide.")
  }
  if (!isObj(raw) || raw.app !== 'autosuivi' || !isObj(raw.data))
    throw new BackupError("Ce fichier n'est pas une sauvegarde AutoSuivi.")
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION)
    throw new BackupError(`Sauvegarde créée par une version plus récente d'AutoSuivi (v${String(raw.version)}). Mettez l'application à jour.`)

  const d = raw.data
  const arr = (k: string): unknown[] => {
    const v = d[k]
    if (v === undefined) return []
    if (!Array.isArray(v)) throw new BackupError(`Sauvegarde corrompue : « ${k} » est invalide.`)
    return v
  }
  const rows = (k: string, required: string[]) =>
    arr(k).map((r, i) => {
      if (!isObj(r) || required.some((f) => r[f] === undefined || r[f] === null))
        throw new BackupError(`Sauvegarde corrompue : ligne ${i + 1} de « ${k} » incomplète.`)
      return r
    })

  try {
    const vehicles = rows('vehicles', ['id', 'name']).map((v) => {
      if (v.photo != null && !isBlobObj(v.photo)) throw new BackupError('Sauvegarde corrompue : photo de véhicule invalide.')
      return { ...v, photo: v.photo ? decodeBlob(v.photo as EncodedBlob) : null } as unknown as Vehicle
    })
    const documents = rows('documents', ['id', 'blob']).map((x) => {
      if (!isBlobObj(x.blob)) throw new BackupError('Sauvegarde corrompue : document invalide.')
      return { ...x, blob: decodeBlob(x.blob as EncodedBlob) } as unknown as DocumentRecord
    })
    return {
      vehicles,
      documents,
      entries: rows('entries', ['id', 'vehicleId', 'type', 'date']) as unknown as Entry[],
      fuelLogs: rows('fuelLogs', ['id', 'vehicleId', 'date', 'liters', 'total']) as unknown as FuelLog[],
      reminderRules: rows('reminderRules', ['id', 'vehicleId', 'type']) as unknown as ReminderRule[],
      settings: rows('settings', ['key']) as unknown as SettingRecord[],
    }
  } catch (e) {
    if (e instanceof BackupError) throw e
    throw new BackupError('Sauvegarde corrompue : données illisibles.')
  }
}

// ───────────────────────── Fusion ─────────────────────────

export interface MergeResult {
  add: Snapshot
  summary: { vehicles: number; entries: number; fuelLogs: number; reminderRules: number; skipped: number }
}

const norm = (s: string) => (s ?? '').trim().toLowerCase()
const maxId = (xs: { id?: number }[]) => xs.reduce((m, x) => Math.max(m, x.id ?? 0), 0)

/**
 * Fusionne une sauvegarde dans les données existantes, sans rien écraser :
 * véhicule identique (nom + plaque) réutilisé, doublons d'entrées/pleins/rappels ignorés,
 * identifiants réattribués après les identifiants existants. Fonction pure.
 */
export function mergeSnapshots(existing: Snapshot, incoming: Snapshot): MergeResult {
  const add: Snapshot = { vehicles: [], documents: [], entries: [], fuelLogs: [], reminderRules: [], settings: [] }
  let skipped = 0

  let nextVehicle = maxId(existing.vehicles) + 1
  const vmap = new Map<number, number>()
  for (const v of incoming.vehicles) {
    const same = existing.vehicles.find((e) => norm(e.name) === norm(v.name) && norm(e.plate) === norm(v.plate))
    if (same) vmap.set(v.id!, same.id!)
    else {
      const id = nextVehicle++
      vmap.set(v.id!, id)
      add.vehicles.push({ ...v, id })
    }
  }

  const entryKey = (e: Pick<Entry, 'vehicleId' | 'date' | 'type' | 'amount' | 'km' | 'garage'>) =>
    [e.vehicleId, e.date, e.type, e.amount ?? '', e.km ?? '', norm(e.garage)].join('|')
  const seenEntries = new Set(existing.entries.map(entryKey))
  let nextEntry = maxId(existing.entries) + 1
  let nextDoc = maxId(existing.documents) + 1
  const docs = new Map(incoming.documents.map((d) => [d.id!, d]))
  for (const e of incoming.entries) {
    const vehicleId = vmap.get(e.vehicleId)
    if (vehicleId == null) { skipped++; continue }
    const cand = { ...e, vehicleId }
    if (seenEntries.has(entryKey(cand))) { skipped++; continue }
    seenEntries.add(entryKey(cand))
    let documentId: number | null = null
    const doc = e.documentId != null ? docs.get(e.documentId) : undefined
    if (doc) { documentId = nextDoc++; add.documents.push({ ...doc, id: documentId }) }
    add.entries.push({ ...cand, id: nextEntry++, documentId })
  }

  const fuelKey = (f: FuelLog) => [f.vehicleId, f.date, f.liters, f.total, f.km ?? ''].join('|')
  const seenFuel = new Set(existing.fuelLogs.map(fuelKey))
  let nextFuel = maxId(existing.fuelLogs) + 1
  for (const f of incoming.fuelLogs) {
    const vehicleId = vmap.get(f.vehicleId)
    if (vehicleId == null) { skipped++; continue }
    const cand = { ...f, vehicleId }
    if (seenFuel.has(fuelKey(cand))) { skipped++; continue }
    seenFuel.add(fuelKey(cand))
    add.fuelLogs.push({ ...cand, id: nextFuel++ })
  }

  const ruleKey = (r: ReminderRule) => [r.vehicleId, r.type, norm(r.label)].join('|')
  const seenRules = new Set(existing.reminderRules.map(ruleKey))
  let nextRule = maxId(existing.reminderRules) + 1
  for (const r of incoming.reminderRules) {
    const vehicleId = vmap.get(r.vehicleId)
    if (vehicleId == null) { skipped++; continue }
    const cand = { ...r, vehicleId }
    if (seenRules.has(ruleKey(cand))) { skipped++; continue }
    seenRules.add(ruleKey(cand))
    add.reminderRules.push({ ...cand, id: nextRule++ })
  }

  return {
    add,
    summary: {
      vehicles: add.vehicles.length, entries: add.entries.length,
      fuelLogs: add.fuelLogs.length, reminderRules: add.reminderRules.length, skipped,
    },
  }
}

// ───────────────────────── Rappel de sauvegarde ─────────────────────────

export const BACKUP_REMINDER_DAYS = 30

/**
 * Sauvegarde due si des données existent et que la dernière sauvegarde (ou, à défaut,
 * la création des premières données) remonte à plus de 30 jours.
 */
export function backupDue(opts: { lastBackupAt: number | null; firstDataAt: number | null; now: number }): boolean {
  const ref = opts.lastBackupAt ?? opts.firstDataAt
  if (ref == null) return false
  return opts.now - ref > BACKUP_REMINDER_DAYS * 86_400_000
}
