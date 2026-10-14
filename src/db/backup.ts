import { db, getSetting, setSetting } from './db'
import { isEphemeralSetting, mergeSnapshots, snapshotToBackup, type MergeResult, type Snapshot } from '../lib/backup/format'
import { tombstonesForEverything } from './mutations'

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

const ALL = [db.vehicles, db.documents, db.entries, db.fuelLogs, db.reminderRules, db.settings, db.tombstones] as const

/** Retire les champs de synchronisation d'un enregistrement importé : de nouveaux identifiants seront attribués. */
const fresh = <T extends object>(r: T): T => {
  const { uid, dirty, rw, updatedAt, pendingDocumentUid, blobSynced, photoSyncedVersion, registrationSyncedVersion, ...rest } = r as T & Record<string, unknown>
  void uid; void dirty; void rw; void updatedAt; void pendingDocumentUid; void blobSynced; void photoSyncedVersion; void registrationSyncedVersion
  return rest as T
}

/**
 * Remplace toutes les données par la sauvegarde (atomique : tout ou rien).
 * L'état de synchronisation (compte, curseur) est conservé ; les anciens enregistrements sont
 * supprimés côté serveur à la synchronisation suivante, les restaurés y sont renvoyés.
 */
export async function replaceAll(s: Snapshot): Promise<void> {
  const tombs = await tombstonesForEverything()
  await db.transaction('rw', ALL, async () => {
    const keep = (await db.settings.toArray()).filter((x) => isEphemeralSetting(x.key))
    await Promise.all([db.vehicles, db.documents, db.entries, db.fuelLogs, db.reminderRules, db.settings].map((t) => t.clear()))
    // Les uid de la sauvegarde sont conservés (cohérence avec le compte) ; tout est marqué à envoyer.
    const redirty = <T extends object>(r: T): T => ({ ...r, dirty: undefined, updatedAt: undefined, rw: undefined }) as T
    await db.vehicles.bulkAdd(s.vehicles.map((r) => redirty({ ...r, photoSyncedVersion: null, registrationSyncedVersion: null })))
    await db.documents.bulkAdd(s.documents.map((r) => redirty({ ...r, blobSynced: false })))
    await db.entries.bulkAdd(s.entries.map(redirty))
    await db.fuelLogs.bulkAdd(s.fuelLogs.map(redirty))
    await db.reminderRules.bulkAdd(s.reminderRules.map(redirty))
    await db.settings.bulkAdd([...s.settings.filter((x) => !isEphemeralSetting(x.key)), ...keep])
    await db.tombstones.bulkAdd(tombs.map((t) => ({ ...t, id: undefined })))
  })
}

/** Fusionne la sauvegarde dans les données existantes (atomique). */
export async function mergeInto(s: Snapshot): Promise<MergeResult['summary']> {
  return db.transaction('rw', ALL, async () => {
    const result = mergeSnapshots(await readSnapshot(), s)
    await db.vehicles.bulkAdd(result.add.vehicles.map(fresh))
    await db.documents.bulkAdd(result.add.documents.map(fresh))
    await db.entries.bulkAdd(result.add.entries.map(fresh))
    await db.fuelLogs.bulkAdd(result.add.fuelLogs.map(fresh))
    await db.reminderRules.bulkAdd(result.add.reminderRules.map(fresh))
    return result.summary
  })
}
