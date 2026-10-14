import Dexie, { type Table } from 'dexie'
import type {
  DocumentRecord, Entry, FuelLog, ReminderRule, SettingRecord, Tombstone, Vehicle,
} from './schema'

export const newUid = () => crypto.randomUUID()

let onLocalChange: () => void = () => {}
/** La synchronisation s'abonne ici pour être prévenue de chaque modification locale. */
export function setLocalChangeListener(fn: () => void) {
  onLocalChange = fn
}

export class AutoSuiviDB extends Dexie {
  vehicles!: Table<Vehicle, number>
  documents!: Table<DocumentRecord, number>
  entries!: Table<Entry, number>
  fuelLogs!: Table<FuelLog, number>
  reminderRules!: Table<ReminderRule, number>
  settings!: Table<SettingRecord, string>
  tombstones!: Table<Tombstone, number>

  constructor(name = 'autosuivi') {
    super(name)
    // Versionnage : ajouter un nouveau bloc `this.version(n+1)` (avec .upgrade si besoin)
    // pour toute migration future ; ne jamais modifier une version déjà publiée.
    this.version(1).stores({
      vehicles: '++id, name, plate',
      documents: '++id, createdAt',
      entries: '++id, vehicleId, type, date, documentId, [vehicleId+date]',
      fuelLogs: '++id, vehicleId, date, [vehicleId+date]',
      reminderRules: '++id, vehicleId, type',
      settings: 'key',
    })
    // v2 : identifiants globaux (uid), marqueur de modification (dirty) et suppressions à synchroniser.
    this.version(2)
      .stores({
        vehicles: '++id, name, plate, &uid, dirty',
        documents: '++id, createdAt, &uid, dirty',
        entries: '++id, vehicleId, type, date, documentId, [vehicleId+date], &uid, dirty',
        fuelLogs: '++id, vehicleId, date, [vehicleId+date], &uid, dirty',
        reminderRules: '++id, vehicleId, type, &uid, dirty',
        settings: 'key',
        tombstones: '++id, uid',
      })
      .upgrade(async (tx) => {
        const now = Date.now()
        for (const t of ['vehicles', 'documents', 'entries', 'fuelLogs', 'reminderRules']) {
          await tx.table(t).toCollection().modify((r: Record<string, unknown>) => {
            r.uid ??= newUid()
            r.updatedAt ??= now
            r.dirty = 1
          })
        }
        // Les documents existants se rattachent au véhicule de leur entrée.
        for (const e of await tx.table('entries').toArray()) {
          if (e.documentId != null) await tx.table('documents').update(e.documentId, { vehicleId: e.vehicleId })
        }
      })

    // Hooks : toute écriture « utilisateur » reçoit un uid, une date de modification et dirty = 1.
    // Les écritures de la synchronisation portent un jeton `rw` (toujours différent, donc toujours visible
    // dans les modifications transmises au hook) et ne sont pas retouchées.
    for (const table of [this.vehicles, this.documents, this.entries, this.fuelLogs, this.reminderRules] as Table<
      { uid?: string; updatedAt?: number; dirty?: 0 | 1; rw?: number },
      number
    >[]) {
      table.hook('creating', (_pk, obj) => {
        obj.uid ??= newUid()
        if (obj.rw !== undefined) {
          obj.updatedAt ??= Date.now()
          obj.dirty ??= 0
        } else {
          obj.updatedAt = obj.updatedAt ?? Date.now()
          obj.dirty = 1
          onLocalChange()
        }
      })
      table.hook('updating', (mods) => {
        if ('rw' in (mods as object)) return undefined
        onLocalChange()
        return { updatedAt: Date.now(), dirty: 1 }
      })
    }
  }
}

export const db = new AutoSuiviDB()

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rec = await db.settings.get(key)
  return rec ? (rec.value as T) : fallback
}

export function setSetting(key: string, value: unknown) {
  return db.settings.put({ key, value })
}
