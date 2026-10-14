import type { AutoSuiviDB } from '../db/db'
import type { Tombstone } from '../db/schema'
import { ApiError, type Api } from './api'

export const MAX_CHANGES = 50

type Kind = 'vehicle' | 'entry' | 'fuel' | 'rule' | 'document'
type Role = 'owner' | 'editor' | 'viewer'

export interface WireChange {
  kind: Kind
  uid: string
  vehicleUid: string
  updatedAt: number
  deleted: boolean
  data: Record<string, unknown>
}

interface Cursor { seq: number; uid: string }

interface SyncResponse {
  cursor: Cursor
  changes: WireChange[]
  overrides: WireChange[]
  rejected: { uid: string; reason: string }[]
  memberships: { vehicleUid: string; role: Role; removed: boolean }[]
  more: boolean
}

export interface SyncReport {
  pushed: number
  pulled: number
  rejected: number
  blobsUp: number
  blobsDown: number
}

type Sent = { kind: Kind; uid: string; updatedAt: number; tombstoneId?: number }

const KIND_ORDER: Record<Kind, number> = { vehicle: 0, document: 1, entry: 2, fuel: 2, rule: 2 }
/** Écriture issue de la synchronisation : propre (rien à renvoyer) et ignorée par les hooks. */
const clean = () => ({ dirty: 0 as const, rw: Math.random() })
const pick = <T extends object>(o: T, keys: string[]) => Object.fromEntries(keys.filter((k) => (o as Record<string, unknown>)[k] !== undefined).map((k) => [k, (o as Record<string, unknown>)[k]]))

/**
 * Synchronisation d'une base locale (Dexie) avec le serveur.
 * Principe : chaque enregistrement a un uid global et une date de modification ; la plus récente gagne.
 * Les suppressions voyagent sous forme de « tombstones ». Le serveur est la référence de l'ordre (curseur).
 */
export class SyncEngine {
  constructor(private db: AutoSuiviDB, private api: Api) {}

  // ───── réglages de synchro ─────
  private async get<T>(key: string, fallback: T): Promise<T> {
    const r = await this.db.settings.get(key)
    return r ? (r.value as T) : fallback
  }
  private set(key: string, value: unknown) {
    return this.db.settings.put({ key, value })
  }

  async run(): Promise<SyncReport> {
    const report: SyncReport = { pushed: 0, pulled: 0, rejected: 0, blobsUp: 0, blobsDown: 0 }
    let cursor = await this.get<Cursor>('sync.cursor', { seq: 0, uid: '' })

    for (let guard = 0; guard < 500; guard++) {
      const { changes, sent } = await this.collect(MAX_CHANGES)
      const res = await this.api.json<SyncResponse>('POST', '/api/sync', { cursor, changes })

      const rejected = new Set(res.rejected.map((r) => r.uid))
      await this.acknowledge(sent)
      report.pushed += sent.length - rejected.size
      report.rejected += rejected.size

      await this.applyMemberships(res.memberships)
      const incoming = [...res.overrides, ...res.changes]
      await this.applyAll(incoming)
      report.pulled += res.changes.length

      cursor = res.cursor
      await this.set('sync.cursor', cursor)
      if (!res.more && changes.length < MAX_CHANGES) break
    }

    await this.syncBlobs(report)
    await this.set('sync.lastSyncAt', Date.now())
    return report
  }

  // ───── envoi ─────
  private async vehicleUidMap(): Promise<Map<number, string>> {
    return new Map((await this.db.vehicles.toArray()).filter((v) => v.uid).map((v) => [v.id!, v.uid!]))
  }

  private async collect(max: number): Promise<{ changes: WireChange[]; sent: Sent[] }> {
    const db = this.db
    const vmap = await this.vehicleUidMap()
    const docUid = new Map((await db.documents.toArray()).map((d) => [d.id!, d.uid!]))
    const changes: WireChange[] = []
    const sent: Sent[] = []
    const room = () => max - changes.length
    const add = (c: WireChange, s: Sent) => { changes.push(c); sent.push(s) }

    for (const v of (await db.vehicles.where('dirty').equals(1).toArray()).slice(0, room())) {
      add({
        kind: 'vehicle', uid: v.uid!, vehicleUid: v.uid!, updatedAt: v.updatedAt!, deleted: false,
        data: {
          ...pick(v, ['name', 'brand', 'model', 'year', 'plate', 'fuel', 'firstRegistration', 'mileage', 'createdAt', 'vin']),
          hasPhoto: !!v.photo || v.photoVersion != null, photoVersion: v.photoVersion ?? null,
          hasRegistration: !!v.registrationPhoto || v.registrationVersion != null, registrationVersion: v.registrationVersion ?? null,
        },
      }, { kind: 'vehicle', uid: v.uid!, updatedAt: v.updatedAt! })
    }
    for (const d of room() > 0 ? await db.documents.where('dirty').equals(1).toArray() : []) {
      const vUid = d.vehicleId != null ? vmap.get(d.vehicleId) : undefined
      if (!vUid || room() <= 0) continue
      add({
        kind: 'document', uid: d.uid!, vehicleUid: vUid, updatedAt: d.updatedAt!, deleted: false,
        data: { ...pick(d, ['name', 'mime', 'createdAt']), hasBlob: !!d.blob || !!d.blobSynced },
      }, { kind: 'document', uid: d.uid!, updatedAt: d.updatedAt! })
    }
    for (const e of room() > 0 ? await db.entries.where('dirty').equals(1).toArray() : []) {
      const vUid = vmap.get(e.vehicleId)
      if (!vUid || room() <= 0) continue
      add({
        kind: 'entry', uid: e.uid!, vehicleUid: vUid, updatedAt: e.updatedAt!, deleted: false,
        data: { ...pick(e, ['type', 'date', 'amount', 'amountHT', 'vat', 'km', 'garage', 'notes']), documentUid: e.documentId != null ? docUid.get(e.documentId) ?? null : e.pendingDocumentUid ?? null },
      }, { kind: 'entry', uid: e.uid!, updatedAt: e.updatedAt! })
    }
    for (const f of room() > 0 ? await db.fuelLogs.where('dirty').equals(1).toArray() : []) {
      const vUid = vmap.get(f.vehicleId)
      if (!vUid || room() <= 0) continue
      add({ kind: 'fuel', uid: f.uid!, vehicleUid: vUid, updatedAt: f.updatedAt!, deleted: false, data: pick(f, ['date', 'liters', 'total', 'km', 'full']) },
        { kind: 'fuel', uid: f.uid!, updatedAt: f.updatedAt! })
    }
    for (const r of room() > 0 ? await db.reminderRules.where('dirty').equals(1).toArray() : []) {
      const vUid = vmap.get(r.vehicleId)
      if (!vUid || room() <= 0) continue
      add({ kind: 'rule', uid: r.uid!, vehicleUid: vUid, updatedAt: r.updatedAt!, deleted: false, data: pick(r, ['type', 'label', 'everyMonths', 'everyKm', 'baseDate', 'baseKm']) },
        { kind: 'rule', uid: r.uid!, updatedAt: r.updatedAt! })
    }
    if (room() > 0) {
      for (const t of (await db.tombstones.toArray()).slice(0, room())) {
        add({ kind: t.kind, uid: t.uid, vehicleUid: t.vehicleUid, updatedAt: t.deletedAt, deleted: true, data: {} },
          { kind: t.kind, uid: t.uid, updatedAt: t.deletedAt, tombstoneId: t.id })
      }
    }
    return { changes, sent }
  }

  /** Marque comme envoyé (ou refusé) : le serveur a répondu pour chacune de ces modifications. */
  private async acknowledge(sent: Sent[]) {
    const tables = { vehicle: this.db.vehicles, document: this.db.documents, entry: this.db.entries, fuel: this.db.fuelLogs, rule: this.db.reminderRules } as const
    for (const s of sent) {
      if (s.tombstoneId != null) { await this.db.tombstones.delete(s.tombstoneId); continue }
      const t = tables[s.kind] as typeof this.db.entries
      const cur = await t.where('uid').equals(s.uid).first()
      // Si l'enregistrement a encore été modifié depuis l'envoi, il reste « à envoyer ».
      if (cur && cur.updatedAt === s.updatedAt) await t.update(cur.id!, clean())
    }
  }

  // ───── réception ─────
  private async applyAll(incoming: WireChange[]) {
    const stored = await this.get<WireChange[]>('sync.orphans', [])
    const all = [...stored, ...incoming].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    const orphans: WireChange[] = []
    for (const c of all) {
      if (!(await this.applyOne(c))) orphans.push(c)
    }
    // On garde les orphelins (enregistrement reçu avant son véhicule) pour réessayer ; borne de sécurité.
    await this.set('sync.orphans', orphans.slice(-200))
  }

  /** Renvoie false si la modification doit être retentée plus tard (véhicule pas encore reçu). */
  private async applyOne(c: WireChange): Promise<boolean> {
    const db = this.db
    const tomb = await db.tombstones.where('uid').equals(c.uid).first()
    if (tomb) {
      // Une suppression locale plus récente que la version reçue l'emporte ; sinon l'enregistrement est ressuscité.
      if (tomb.deletedAt >= c.updatedAt) return true
      await db.tombstones.delete(tomb.id!)
    }

    if (c.kind === 'vehicle') {
      const local = await db.vehicles.where('uid').equals(c.uid).first()
      if (c.deleted) { if (local) await this.purgeVehicle(local.id!); return true }
      const d = c.data as Record<string, unknown>
      const fields = {
        ...pick(d, ['name', 'brand', 'model', 'year', 'plate', 'fuel', 'firstRegistration', 'mileage', 'createdAt', 'vin']),
      } as Record<string, unknown>
      const remote = {
        photo: (d.hasPhoto ? (d.photoVersion as number | null) ?? 0 : null) as number | null,
        registration: (d.hasRegistration ? (d.registrationVersion as number | null) ?? 0 : null) as number | null,
      }
      if (!local) {
        await db.vehicles.add({
          name: '', brand: '', model: '', year: null, plate: '', fuel: 'essence', firstRegistration: null, mileage: null, createdAt: c.updatedAt,
          ...fields, uid: c.uid, updatedAt: c.updatedAt, ...clean(),
          photo: null, photoVersion: remote.photo, photoSyncedVersion: null,
          registrationPhoto: null, registrationVersion: remote.registration, registrationSyncedVersion: null,
        } as never)
      } else if (c.updatedAt >= (local.updatedAt ?? 0)) {
        // Une image qui change ou disparaît côté serveur : on efface la copie locale, elle sera retéléchargée.
        const imageChanges: Record<string, unknown> = {}
        if ((local.photoVersion ?? null) !== remote.photo) Object.assign(imageChanges, { photoVersion: remote.photo, photo: null, photoSyncedVersion: null })
        if ((local.registrationVersion ?? null) !== remote.registration) Object.assign(imageChanges, { registrationVersion: remote.registration, registrationPhoto: null, registrationSyncedVersion: null })
        await db.vehicles.update(local.id!, { ...fields, updatedAt: c.updatedAt, ...clean(), ...imageChanges } as never)
      }
      return true
    }

    const vehicle = await db.vehicles.where('uid').equals(c.vehicleUid).first()
    if (!vehicle) return c.deleted // suppression d'un enfant dont le véhicule n'existe plus : rien à faire
    const d = c.data as Record<string, unknown>

    switch (c.kind) {
      case 'document': {
        const local = await db.documents.where('uid').equals(c.uid).first()
        if (c.deleted) {
          if (local) {
            await db.entries.where('documentId').equals(local.id!).modify({ documentId: null, ...clean() } as never)
            await db.documents.delete(local.id!)
          }
          return true
        }
        const fields = { ...pick(d, ['name', 'mime', 'createdAt']), vehicleId: vehicle.id!, updatedAt: c.updatedAt, ...clean() }
        if (!local) {
          const id = await db.documents.add({ ...fields, blob: null, blobSynced: !!d.hasBlob, uid: c.uid } as never)
          // Entrées qui attendaient ce document
          const waiting = (await db.entries.toArray()).filter((e) => e.pendingDocumentUid === c.uid)
          for (const e of waiting) await db.entries.update(e.id!, { documentId: id, pendingDocumentUid: null, dirty: e.dirty ?? 0, rw: Math.random() } as never)
        } else if (c.updatedAt >= (local.updatedAt ?? 0)) {
          await db.documents.update(local.id!, { ...fields, ...(d.hasBlob && !local.blob ? { blobSynced: true } : {}) } as never)
        }
        return true
      }
      case 'entry': {
        const local = await db.entries.where('uid').equals(c.uid).first()
        if (c.deleted) { if (local) await db.entries.delete(local.id!); return true }
        const docUid = (d.documentUid as string | null | undefined) ?? null
        const doc = docUid ? await db.documents.where('uid').equals(docUid).first() : null
        const fields = {
          ...pick(d, ['type', 'date', 'amount', 'amountHT', 'vat', 'km', 'garage', 'notes']),
          vehicleId: vehicle.id!, documentId: doc?.id ?? null, pendingDocumentUid: docUid && !doc ? docUid : null,
          updatedAt: c.updatedAt, ...clean(),
        }
        if (!local) await db.entries.add({ garage: '', notes: '', amount: null, km: null, ...fields, uid: c.uid } as never)
        else if (c.updatedAt >= (local.updatedAt ?? 0)) await db.entries.update(local.id!, fields as never)
        return true
      }
      case 'fuel': {
        const local = await db.fuelLogs.where('uid').equals(c.uid).first()
        if (c.deleted) { if (local) await db.fuelLogs.delete(local.id!); return true }
        const fields = { ...pick(d, ['date', 'liters', 'total', 'km', 'full']), vehicleId: vehicle.id!, updatedAt: c.updatedAt, ...clean() }
        if (!local) await db.fuelLogs.add({ km: null, ...fields, uid: c.uid } as never)
        else if (c.updatedAt >= (local.updatedAt ?? 0)) await db.fuelLogs.update(local.id!, fields as never)
        return true
      }
      case 'rule': {
        const local = await db.reminderRules.where('uid').equals(c.uid).first()
        if (c.deleted) { if (local) await db.reminderRules.delete(local.id!); return true }
        const fields = { ...pick(d, ['type', 'label', 'everyMonths', 'everyKm', 'baseDate', 'baseKm']), vehicleId: vehicle.id!, updatedAt: c.updatedAt, ...clean() }
        if (!local) await db.reminderRules.add({ everyMonths: null, everyKm: null, ...fields, uid: c.uid } as never)
        else if (c.updatedAt >= (local.updatedAt ?? 0)) await db.reminderRules.update(local.id!, fields as never)
        return true
      }
    }
    return true
  }

  /** Supprime un véhicule et ses données localement, sans créer de tombstones (la suppression vient du serveur). */
  async purgeVehicle(vehicleId: number) {
    const db = this.db
    await db.transaction('rw', [db.vehicles, db.documents, db.entries, db.fuelLogs, db.reminderRules, db.tombstones], async () => {
      const v = await db.vehicles.get(vehicleId)
      const docIds = (await db.entries.where('vehicleId').equals(vehicleId).toArray()).map((e) => e.documentId).filter((x): x is number => x != null)
      const extraDocs = (await db.documents.toArray()).filter((d) => d.vehicleId === vehicleId).map((d) => d.id!)
      await db.documents.bulkDelete([...new Set([...docIds, ...extraDocs])])
      await db.entries.where('vehicleId').equals(vehicleId).delete()
      await db.fuelLogs.where('vehicleId').equals(vehicleId).delete()
      await db.reminderRules.where('vehicleId').equals(vehicleId).delete()
      await db.vehicles.delete(vehicleId)
      if (v?.uid) await db.tombstones.filter((t) => t.vehicleUid === v.uid).delete()
    })
  }

  private async applyMemberships(ms: SyncResponse['memberships']) {
    if (!ms.length) return
    const roles = await this.get<Record<string, Role>>('sync.roles', {})
    for (const m of ms) {
      if (m.removed) {
        delete roles[m.vehicleUid]
        const v = await this.db.vehicles.where('uid').equals(m.vehicleUid).first()
        if (v) await this.purgeVehicle(v.id!)
      } else roles[m.vehicleUid] = m.role
    }
    await this.set('sync.roles', roles)
  }

  // ───── pièces jointes (fichiers) ─────
  private async roleOf(vehicleUid: string): Promise<Role> {
    const roles = await this.get<Record<string, Role>>('sync.roles', {})
    return roles[vehicleUid] ?? 'owner'
  }

  /** Met à jour sans repasser l'enregistrement en « à envoyer » (sauf s'il l'était déjà). */
  private async quiet(table: 'documents' | 'vehicles', id: number, changes: Record<string, unknown>) {
    const cur = await (this.db[table] as typeof this.db.documents).get(id)
    await (this.db[table] as typeof this.db.documents).update(id, { ...changes, dirty: cur?.dirty ?? 0, rw: Math.random() } as never)
  }

  private async syncBlobs(report: SyncReport) {
    const db = this.db
    const vmap = await this.vehicleUidMap()
    const tryDo = async (fn: () => Promise<void>) => {
      try { await fn() } catch (e) {
        // Un fichier qui échoue (quota, droits, réseau) ne doit pas bloquer le reste.
        if (e instanceof ApiError && (e.status === 403 || e.status === 413)) return
        if (!(e instanceof ApiError)) throw e
      }
    }

    // Téléchargements limités par synchronisation (le reste à la demande ou à la suivante)
    let budget = 10
    // Envois
    for (const d of await db.documents.filter((x) => !!x.blob && !x.blobSynced).toArray()) {
      const vUid = d.vehicleId != null ? vmap.get(d.vehicleId) : undefined
      if (!vUid || (await this.roleOf(vUid)) === 'viewer') continue
      await tryDo(async () => {
        await this.api.putBlob(`/api/blobs/${vUid}/${d.uid}`, d.blob!)
        await this.quiet('documents', d.id!, { blobSynced: true })
        report.blobsUp++
      })
    }
    // Images du véhicule : photo (tous les membres) et carte grise (propriétaire uniquement).
    const SLOTS = [
      { blob: 'photo', version: 'photoVersion', synced: 'photoSyncedVersion', suffix: 'photo', ownerOnly: false },
      { blob: 'registrationPhoto', version: 'registrationVersion', synced: 'registrationSyncedVersion', suffix: 'carte', ownerOnly: true },
    ] as const
    for (const slot of SLOTS) {
      for (const v of await db.vehicles.toArray()) {
        const rec = v as unknown as Record<string, unknown>
        const version = rec[slot.version] as number | null | undefined
        const image = rec[slot.blob] as Blob | null | undefined
        const role = await this.roleOf(v.uid!)
        if (version == null || (slot.ownerOnly ? role !== 'owner' : role === 'viewer' && !!image)) continue
        const path = `/api/blobs/${v.uid}/${v.uid}-${slot.suffix}`
        if (image && version !== rec[slot.synced]) {
          await tryDo(async () => {
            await this.api.putBlob(path, image)
            await this.quiet('vehicles', v.id!, { [slot.synced]: version })
            report.blobsUp++
          })
        } else if (!image && budget-- > 0) {
          await tryDo(async () => {
            const blob = await this.api.getBlob(path)
            if (blob) { await this.quiet('vehicles', v.id!, { [slot.blob]: blob, [slot.synced]: version }); report.blobsDown++ }
          })
        }
      }
    }
    for (const d of await db.documents.filter((x) => !x.blob && !!x.blobSynced).toArray()) {
      if (budget-- <= 0) break
      await this.downloadDocument(d.id!, vmap, report)
    }
  }

  async downloadDocument(docId: number, vmap?: Map<number, string>, report?: SyncReport): Promise<Blob | null> {
    const d = await this.db.documents.get(docId)
    if (!d) return null
    if (d.blob) return d.blob
    const vUid = (vmap ?? (await this.vehicleUidMap())).get(d.vehicleId ?? -1)
    if (!vUid) return null
    try {
      const blob = await this.api.getBlob(`/api/blobs/${vUid}/${d.uid}`)
      if (blob) {
        await this.quiet('documents', docId, { blob })
        if (report) report.blobsDown++
      }
      return blob
    } catch (e) {
      if (e instanceof ApiError) return null
      throw e
    }
  }

  // ───── état local utile à l'interface ─────
  async roles(): Promise<Record<string, Role>> {
    return this.get('sync.roles', {})
  }
  async pendingCount(): Promise<number> {
    const db = this.db
    const counts = await Promise.all([db.vehicles, db.documents, db.entries, db.fuelLogs, db.reminderRules].map((t) => (t as typeof db.entries).where('dirty').equals(1).count()))
    return counts.reduce((a, b) => a + b, 0) + (await db.tombstones.count())
  }
}

export type { Tombstone }
