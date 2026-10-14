import { db as defaultDb, type AutoSuiviDB } from './db'
import type { Tombstone } from './schema'

/**
 * Suppressions : toujours passer par ces fonctions. Elles enregistrent une « pierre tombale »
 * (tombstone) pour que la suppression soit transmise aux autres appareils à la prochaine synchronisation.
 */
function tomb(uid: string | undefined, kind: Tombstone['kind'], vehicleUid: string | null): Tombstone[] {
  return uid && vehicleUid ? [{ uid, kind, vehicleUid, deletedAt: Date.now() }] : []
}

export function makeMutations(db: AutoSuiviDB) {
const STORES = [db.vehicles, db.documents, db.entries, db.fuelLogs, db.reminderRules, db.tombstones, db.settings]

async function vehicleUidOf(vehicleId: number | undefined): Promise<string | null> {
  if (vehicleId == null) return null
  return (await db.vehicles.get(vehicleId))?.uid ?? null
}

function deleteEntry(id: number) {
  return db.transaction('rw', STORES, async () => {
    const e = await db.entries.get(id)
    if (!e) return
    const vUid = await vehicleUidOf(e.vehicleId)
    const t: Tombstone[] = tomb(e.uid, 'entry', vUid)
    if (e.documentId != null) {
      const d = await db.documents.get(e.documentId)
      t.push(...tomb(d?.uid, 'document', vUid))
      await db.documents.delete(e.documentId)
    }
    await db.entries.delete(id)
    await db.tombstones.bulkAdd(t)
  })
}

function deleteFuelLog(id: number) {
  return db.transaction('rw', STORES, async () => {
    const f = await db.fuelLogs.get(id)
    if (!f) return
    await db.fuelLogs.delete(id)
    await db.tombstones.bulkAdd(tomb(f.uid, 'fuel', await vehicleUidOf(f.vehicleId)))
  })
}

function deleteRule(id: number) {
  return db.transaction('rw', STORES, async () => {
    const r = await db.reminderRules.get(id)
    if (!r) return
    await db.reminderRules.delete(id)
    await db.tombstones.bulkAdd(tomb(r.uid, 'rule', await vehicleUidOf(r.vehicleId)))
  })
}

/** Supprime un véhicule et tout ce qui s'y rattache. */
function deleteVehicle(id: number) {
  return db.transaction('rw', STORES, async () => {
    const v = await db.vehicles.get(id)
    if (!v) return
    const entries = await db.entries.where('vehicleId').equals(id).toArray()
    const fuel = await db.fuelLogs.where('vehicleId').equals(id).toArray()
    const rules = await db.reminderRules.where('vehicleId').equals(id).toArray()
    const docIds = entries.map((e) => e.documentId).filter((x): x is number => x != null)
    const docs = (await db.documents.bulkGet(docIds)).filter((d) => d != null)
    const vUid = v.uid!
    const t: Tombstone[] = [
      ...entries.flatMap((e) => tomb(e.uid, 'entry', vUid)),
      ...docs.flatMap((d) => tomb(d!.uid, 'document', vUid)),
      ...fuel.flatMap((f) => tomb(f.uid, 'fuel', vUid)),
      ...rules.flatMap((r) => tomb(r.uid, 'rule', vUid)),
      ...tomb(vUid, 'vehicle', vUid),
    ]
    await db.documents.bulkDelete(docIds)
    await db.entries.where('vehicleId').equals(id).delete()
    await db.fuelLogs.where('vehicleId').equals(id).delete()
    await db.reminderRules.where('vehicleId').equals(id).delete()
    await db.vehicles.delete(id)
    await db.tombstones.bulkAdd(t)
  })
}

/** Tombstones pour tout ce qui existe localement (avant un remplacement complet des données). */
async function tombstonesForEverything(): Promise<Tombstone[]> {
  const [vs, ds, es, fs, rs] = await Promise.all([
    db.vehicles.toArray(), db.documents.toArray(), db.entries.toArray(), db.fuelLogs.toArray(), db.reminderRules.toArray(),
  ])
  const vUid = new Map(vs.map((v) => [v.id, v.uid]))
  const of = (id: number | undefined) => (id != null ? vUid.get(id) ?? null : null)
  return [
    ...es.flatMap((e) => tomb(e.uid, 'entry', of(e.vehicleId))),
    ...ds.flatMap((d) => tomb(d.uid, 'document', of(d.vehicleId))),
    ...fs.flatMap((f) => tomb(f.uid, 'fuel', of(f.vehicleId))),
    ...rs.flatMap((r) => tomb(r.uid, 'rule', of(r.vehicleId))),
    ...vs.flatMap((v) => tomb(v.uid, 'vehicle', v.uid ?? null)),
  ]
}

return { deleteEntry, deleteFuelLog, deleteRule, deleteVehicle, tombstonesForEverything }
}

export const { deleteEntry, deleteFuelLog, deleteRule, deleteVehicle, tombstonesForEverything } = makeMutations(defaultDb)
