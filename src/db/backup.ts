import { db, getSetting, setSetting } from './db'
import { mergeSnapshots, snapshotToBackup, type MergeResult, type Snapshot } from '../lib/backup/format'

export async function readSnapshot(): Promise<Snapshot> {
  const [vehicles, documents, entries, fuelLogs, reminderRules, settings] = await Promise.all([
    db.vehicles.toArray(), db.documents.toArray(), db.entries.toArray(),
    db.fuelLogs.toArray(), db.reminderRules.toArray(), db.settings.toArray(),
  ])
  return { vehicles, documents, entries, fuelLogs, reminderRules, settings }
}

/** Construit le fichier de sauvegarde complet (JSON, pièces jointes encodées en base64). */
export async function exportBackupBlob(): Promise<{ blob: Blob; name: string }> {
  const file = await snapshotToBackup(await readSnapshot())
  const stamp = new Date().toISOString().slice(0, 10)
  return { blob: new Blob([JSON.stringify(file)], { type: 'application/json' }), name: `autosuivi-sauvegarde-${stamp}.json` }
}

export const markBackupDone = () => setSetting('lastBackupAt', Date.now())
export const getLastBackupAt = () => getSetting<number | null>('lastBackupAt', null)

const ALL = [db.vehicles, db.documents, db.entries, db.fuelLogs, db.reminderRules, db.settings] as const

/** Remplace toutes les données par la sauvegarde (atomique : tout ou rien). */
export async function replaceAll(s: Snapshot): Promise<void> {
  await db.transaction('rw', ALL, async () => {
    await Promise.all(ALL.map((t) => t.clear()))
    await db.vehicles.bulkAdd(s.vehicles)
    await db.documents.bulkAdd(s.documents)
    await db.entries.bulkAdd(s.entries)
    await db.fuelLogs.bulkAdd(s.fuelLogs)
    await db.reminderRules.bulkAdd(s.reminderRules)
    await db.settings.bulkAdd(s.settings)
  })
}

/** Fusionne la sauvegarde dans les données existantes (atomique). */
export async function mergeInto(s: Snapshot): Promise<MergeResult['summary']> {
  return db.transaction('rw', ALL, async () => {
    const result = mergeSnapshots(await readSnapshot(), s)
    await db.vehicles.bulkAdd(result.add.vehicles)
    await db.documents.bulkAdd(result.add.documents)
    await db.entries.bulkAdd(result.add.entries)
    await db.fuelLogs.bulkAdd(result.add.fuelLogs)
    await db.reminderRules.bulkAdd(result.add.reminderRules)
    return result.summary
  })
}
