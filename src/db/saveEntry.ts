import { db } from './db'
import type { DocumentRecord, Entry } from './schema'

/**
 * Enregistre une entrée (création ou mise à jour) de façon atomique :
 * document joint éventuel, entrée, et mise à jour du kilométrage du véhicule si plus élevé.
 */
export async function saveEntry(
  data: Omit<Entry, 'id'>,
  opts: { id?: number; document?: Omit<DocumentRecord, 'id'> } = {},
): Promise<number> {
  return db.transaction('rw', db.entries, db.vehicles, db.documents, async () => {
    const payload = { ...data }
    if (opts.document) payload.documentId = await db.documents.add(opts.document as DocumentRecord)
    let id = opts.id
    if (id != null) await db.entries.update(id, payload)
    else id = await db.entries.add(payload)
    const v = await db.vehicles.get(data.vehicleId)
    if (v && data.km != null && (v.mileage == null || data.km > v.mileage)) {
      await db.vehicles.update(data.vehicleId, { mileage: data.km })
    }
    return id
  })
}
