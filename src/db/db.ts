import Dexie, { type Table } from 'dexie'
import type {
  DocumentRecord, Entry, FuelLog, ReminderRule, SettingRecord, Vehicle,
} from './schema'

export class AutoSuiviDB extends Dexie {
  vehicles!: Table<Vehicle, number>
  documents!: Table<DocumentRecord, number>
  entries!: Table<Entry, number>
  fuelLogs!: Table<FuelLog, number>
  reminderRules!: Table<ReminderRule, number>
  settings!: Table<SettingRecord, string>

  constructor() {
    super('autosuivi')
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
