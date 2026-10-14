import { KINDS, HttpError, type Ctx, type Kind, type Role } from './types'
import { chunk, json, readJson, UID_RE } from './util'
import { requireUser } from './auth'

export const MAX_CHANGES = 50
const PULL_LIMIT = 300
const MAX_DATA_BYTES = 32 * 1024

interface Change {
  kind: Kind
  uid: string
  vehicleUid: string
  updatedAt: number
  deleted: boolean
  data: Record<string, unknown>
}

interface Row { uid: string; kind: Kind; vehicle_uid: string; updated_at: number; deleted: number; data: string; seq: number }

const toWire = (r: Row) => ({
  kind: r.kind, uid: r.uid, vehicleUid: r.vehicle_uid, updatedAt: r.updated_at,
  deleted: r.deleted === 1, data: JSON.parse(r.data) as Record<string, unknown>,
})

function parseChange(raw: unknown): Change {
  if (typeof raw !== 'object' || raw === null) throw new HttpError(400, 'Modification invalide.')
  const c = raw as Record<string, unknown>
  if (!KINDS.includes(c.kind as Kind)) throw new HttpError(400, 'Type de donnée inconnu.')
  if (typeof c.uid !== 'string' || !UID_RE.test(c.uid) || typeof c.vehicleUid !== 'string' || !UID_RE.test(c.vehicleUid))
    throw new HttpError(400, 'Identifiant invalide.')
  if (typeof c.updatedAt !== 'number' || !Number.isFinite(c.updatedAt) || c.updatedAt < 0) throw new HttpError(400, 'Date de modification invalide.')
  if (typeof c.deleted !== 'boolean') throw new HttpError(400, 'Indicateur de suppression invalide.')
  if (typeof c.data !== 'object' || c.data === null || Array.isArray(c.data)) throw new HttpError(400, 'Données invalides.')
  if (JSON.stringify(c.data).length > MAX_DATA_BYTES) throw new HttpError(413, 'Enregistrement trop volumineux.')
  if (c.kind === 'vehicle' && c.uid !== c.vehicleUid) throw new HttpError(400, 'Véhicule incohérent.')
  return {
    kind: c.kind as Kind, uid: c.uid, vehicleUid: c.vehicleUid,
    // une horloge en avance ne doit pas gagner pour toujours
    updatedAt: Math.min(Math.floor(c.updatedAt), Date.now()),
    deleted: c.deleted, data: c.data as Record<string, unknown>,
  }
}

export async function sync(ctx: Ctx): Promise<Response> {
  const user = requireUser(ctx)
  const db = ctx.env.DB
  const body = await readJson(ctx.req, 4 * 1024 * 1024)
  const cursorIn = (body.cursor ?? {}) as { seq?: unknown; uid?: unknown }
  const cursor = {
    seq: typeof cursorIn.seq === 'number' && cursorIn.seq >= 0 ? Math.floor(cursorIn.seq) : 0,
    uid: typeof cursorIn.uid === 'string' ? cursorIn.uid : '',
  }
  const incoming = Array.isArray(body.changes) ? body.changes : []
  if (incoming.length > MAX_CHANGES) throw new HttpError(413, `Trop de modifications (maximum ${MAX_CHANGES}).`)
  const changes = incoming.map(parseChange)

  // ── Droits ──
  const mships = (await db.prepare(`SELECT vehicle_uid, role, removed FROM memberships WHERE user_id = ?`)
    .bind(user.id).all<{ vehicle_uid: string; role: Role; removed: number }>()).results ?? []
  const roleOf = new Map<string, { role: Role; removed: boolean }>(mships.map((m) => [m.vehicle_uid, { role: m.role, removed: m.removed === 1 }]))
  const active = (v: string) => { const m = roleOf.get(v); return m && !m.removed ? m.role : null }

  const rejected: { uid: string; reason: string }[] = []
  const creating = new Set<string>()
  const accepted: Change[] = []

  // Les véhicules d'abord, pour que leurs enfants du même lot soient acceptés.
  const ordered = [...changes.filter((c) => c.kind === 'vehicle'), ...changes.filter((c) => c.kind !== 'vehicle')]
  for (const c of ordered) {
    if (c.kind === 'vehicle') {
      const role = active(c.uid)
      if (role) {
        if (role === 'viewer') rejected.push({ uid: c.uid, reason: 'lecture seule' })
        else if (c.deleted && role !== 'owner') rejected.push({ uid: c.uid, reason: 'seul le propriétaire peut supprimer' })
        else accepted.push(c)
      } else if (roleOf.has(c.uid)) {
        rejected.push({ uid: c.uid, reason: 'accès retiré' })
      } else {
        const taken = await db.prepare(`SELECT 1 FROM records WHERE uid = ?`).bind(c.uid).first()
        if (taken) rejected.push({ uid: c.uid, reason: 'identifiant déjà utilisé' })
        else if (c.deleted) rejected.push({ uid: c.uid, reason: 'véhicule inconnu' })
        else { creating.add(c.uid); accepted.push(c) }
      }
    } else {
      const role = active(c.vehicleUid)
      if ((role && role !== 'viewer') || creating.has(c.vehicleUid)) accepted.push(c)
      else rejected.push({ uid: c.uid, reason: role === 'viewer' ? 'lecture seule' : 'accès refusé' })
    }
  }

  // ── Écriture atomique : le numéro de séquence est incrémenté dans la même transaction ──
  if (accepted.length) {
    const now = Date.now()
    const stmts = [db.prepare(`UPDATE meta SET seq = seq + 1 WHERE id = 1`)]
    for (const c of accepted) {
      stmts.push(
        db.prepare(
          `INSERT INTO records (uid, kind, vehicle_uid, updated_at, deleted, data, seq)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT seq FROM meta WHERE id = 1))
           ON CONFLICT(uid) DO UPDATE SET
             updated_at = excluded.updated_at, deleted = excluded.deleted, data = excluded.data, seq = excluded.seq
           WHERE excluded.updated_at >= records.updated_at
             AND records.vehicle_uid = excluded.vehicle_uid AND records.kind = excluded.kind`,
        ).bind(c.uid, c.kind, c.vehicleUid, c.updatedAt, c.deleted ? 1 : 0, JSON.stringify(c.data)),
      )
      if (creating.has(c.uid) && c.kind === 'vehicle') {
        stmts.push(
          db.prepare(
            `INSERT OR IGNORE INTO memberships (vehicle_uid, user_id, role, removed, seq, created_at)
             VALUES (?, ?, 'owner', 0, (SELECT seq FROM meta WHERE id = 1), ?)`,
          ).bind(c.uid, user.id, now),
        )
      }
    }
    await db.batch(stmts)

    // Pièces jointes des documents supprimés
    for (const c of accepted) {
      if (c.kind === 'document' && c.deleted) {
        await ctx.env.BLOBS.delete(`${c.vehicleUid}/${c.uid}`)
        await db.prepare(`DELETE FROM blobs WHERE uid = ? AND vehicle_uid = ?`).bind(c.uid, c.vehicleUid).run()
      }
    }
  }

  // ── Modifications perdues (le serveur a une version plus récente) : renvoyées au client ──
  const overrides: ReturnType<typeof toWire>[] = []
  const sent = new Map(accepted.map((c) => [c.uid, { updatedAt: c.updatedAt, vehicleUid: c.vehicleUid }]))
  for (const ids of chunk([...sent.keys()], 90)) {
    const rows = (await db.prepare(`SELECT uid, kind, vehicle_uid, updated_at, deleted, data, seq FROM records WHERE uid IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids).all<Row>()).results ?? []
    for (const r of rows) {
      const mine = sent.get(r.uid)
      // Jamais de donnée d'un autre véhicule : on ne renvoie que la version serveur du même véhicule.
      if (mine && r.vehicle_uid === mine.vehicleUid && r.updated_at > mine.updatedAt) overrides.push(toWire(r))
    }
  }

  // ── Lecture : tout ce qui est plus récent que le curseur, dans les véhicules accessibles ──
  const pulled = (await db.prepare(
    `SELECT r.uid, r.kind, r.vehicle_uid, r.updated_at, r.deleted, r.data, r.seq FROM records r
     WHERE r.vehicle_uid IN (SELECT vehicle_uid FROM memberships WHERE user_id = ?1 AND removed = 0)
       AND (r.seq > ?2 OR (r.seq = ?2 AND r.uid > ?3))
     ORDER BY r.seq, r.uid LIMIT ?4`,
  ).bind(user.id, cursor.seq, cursor.uid, PULL_LIMIT).all<Row>()).results ?? []

  const last = pulled[pulled.length - 1]
  const memberships = (await db.prepare(`SELECT vehicle_uid, role, removed, seq FROM memberships WHERE user_id = ? AND seq >= ?`)
    .bind(user.id, cursor.seq).all<{ vehicle_uid: string; role: Role; removed: number; seq: number }>()).results ?? []

  return json({
    cursor: last ? { seq: last.seq, uid: last.uid } : cursor,
    changes: pulled.map(toWire),
    more: pulled.length === PULL_LIMIT,
    overrides,
    rejected,
    memberships: memberships.map((m) => ({ vehicleUid: m.vehicle_uid, role: m.role, removed: m.removed === 1 })),
    serverTime: Date.now(),
  })
}
