import { requireUser } from './auth'
import { HttpError, type Ctx } from './types'
import { UID_RE } from './util'

// Pièces jointes stockées dans D1, en morceaux de 700 Ko (≈ 933 Ko en base64, sous la limite de 2 Mo par ligne).
// Le serveur ne décode jamais les octets (le client encode/décode) : très peu de CPU, compatible avec le plan gratuit.
export const CHUNK_BYTES = 700 * 1024
const MAX_CHUNK_CHARS = 960 * 1024
export const MAX_BLOB = 8 * 1024 * 1024
const MAX_CHUNKS = Math.ceil(MAX_BLOB / CHUNK_BYTES)
const USER_QUOTA = 150 * 1024 * 1024
const SAFE_MIME = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/

async function role(ctx: Ctx, vehicleUid: string): Promise<string | null> {
  const user = requireUser(ctx)
  const row = await ctx.env.DB.prepare(`SELECT role FROM memberships WHERE vehicle_uid = ? AND user_id = ? AND removed = 0`)
    .bind(vehicleUid, user.id).first<{ role: string }>()
  return row?.role ?? null
}

function ids(match: RegExpMatchArray) {
  const [, vehicleUid, uid] = match
  if (!UID_RE.test(vehicleUid) || !UID_RE.test(uid)) throw new HttpError(400, 'Identifiant invalide.')
  return { vehicleUid, uid }
}

const intParam = (v: string | null, name: string, min: number, max: number) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Paramètre « ${name} » invalide.`)
  return n
}

/** PUT /api/blobs/:vehicle/:uid/:index?chunks=N&size=S&mime=… — corps : un morceau en base64 (texte). */
export async function putBlobChunk(ctx: Ctx, match: RegExpMatchArray): Promise<Response> {
  const user = requireUser(ctx)
  const { vehicleUid, uid } = ids(match)
  const idx = intParam(match[3], 'index', 0, MAX_CHUNKS - 1)
  const chunks = intParam(ctx.url.searchParams.get('chunks'), 'chunks', 1, MAX_CHUNKS)
  const size = intParam(ctx.url.searchParams.get('size'), 'size', 1, MAX_BLOB)
  if (idx >= chunks) throw new HttpError(400, 'Index hors limites.')
  const r = await role(ctx, vehicleUid)
  if (!r || r === 'viewer') throw new HttpError(403, 'Accès refusé.')

  const declaredMime = (ctx.url.searchParams.get('mime') ?? '').toLowerCase()
  const mime = SAFE_MIME.test(declaredMime) ? declaredMime : 'application/octet-stream'

  const declaredLen = Number(ctx.req.headers.get('content-length') ?? 0)
  if (declaredLen > MAX_CHUNK_CHARS) throw new HttpError(413, 'Morceau trop volumineux.')
  const data = await ctx.req.text()
  if (data.length === 0 || data.length > MAX_CHUNK_CHARS) throw new HttpError(413, 'Morceau vide ou trop volumineux.')
  // Base64 uniquement (vérification sur un échantillon : le contenu n'est jamais interprété par le serveur).
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data.slice(0, 256)) || !/^[A-Za-z0-9+/=]*$/.test(data.slice(-256))) throw new HttpError(400, 'Données invalides.')

  const db = ctx.env.DB
  if (idx === 0) {
    const existing = await db.prepare(`SELECT vehicle_uid FROM blobs WHERE uid = ?`).bind(uid).first<{ vehicle_uid: string }>()
    if (existing && existing.vehicle_uid !== vehicleUid) throw new HttpError(403, 'Accès refusé.')
    const used = await db.prepare(`SELECT COALESCE(SUM(size), 0) AS s FROM blobs WHERE user_id = ? AND uid != ?`).bind(user.id, uid).first<{ s: number }>()
    if ((used?.s ?? 0) + size > USER_QUOTA) throw new HttpError(413, 'Quota de stockage dépassé (150 Mo).')
    // Nouvel envoi : on repart de zéro (remplace une éventuelle version précédente).
    await db.batch([
      db.prepare(`DELETE FROM blob_chunks WHERE uid = ?`).bind(uid),
      db.prepare(
        `INSERT INTO blobs (uid, vehicle_uid, user_id, size, mime, chunks, complete, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)
         ON CONFLICT(uid) DO UPDATE SET size = excluded.size, mime = excluded.mime, chunks = excluded.chunks, complete = 0, user_id = excluded.user_id
         WHERE blobs.vehicle_uid = excluded.vehicle_uid`,
      ).bind(uid, vehicleUid, user.id, size, mime, chunks, Date.now()),
    ])
  } else {
    const meta = await db.prepare(`SELECT chunks, user_id FROM blobs WHERE uid = ? AND vehicle_uid = ?`).bind(uid, vehicleUid).first<{ chunks: number; user_id: string }>()
    if (!meta || meta.chunks !== chunks || meta.user_id !== user.id) throw new HttpError(409, 'Envoi à reprendre depuis le début.')
  }

  await db.prepare(`INSERT OR REPLACE INTO blob_chunks (uid, idx, data) VALUES (?, ?, ?)`).bind(uid, idx, data).run()
  if (idx === chunks - 1) {
    const have = await db.prepare(`SELECT COUNT(*) AS n FROM blob_chunks WHERE uid = ?`).bind(uid).first<{ n: number }>()
    if ((have?.n ?? 0) !== chunks) throw new HttpError(409, 'Morceaux manquants : envoi à reprendre depuis le début.')
    await db.prepare(`UPDATE blobs SET complete = 1 WHERE uid = ? AND vehicle_uid = ?`).bind(uid, vehicleUid).run()
  }
  return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

/** GET /api/blobs/:vehicle/:uid — métadonnées (taille, type, nombre de morceaux) d'une pièce jointe complète. */
export async function getBlobMeta(ctx: Ctx, match: RegExpMatchArray): Promise<Response> {
  requireUser(ctx)
  const { vehicleUid, uid } = ids(match)
  if (!(await role(ctx, vehicleUid))) throw new HttpError(403, 'Accès refusé.')
  const meta = await ctx.env.DB.prepare(`SELECT size, mime, chunks FROM blobs WHERE uid = ? AND vehicle_uid = ? AND complete = 1`)
    .bind(uid, vehicleUid).first<{ size: number; mime: string; chunks: number }>()
  if (!meta) throw new HttpError(404, 'Pièce jointe introuvable.')
  return new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

/** GET /api/blobs/:vehicle/:uid/:index — un morceau en base64 (texte brut, jamais interprété comme HTML). */
export async function getBlobChunk(ctx: Ctx, match: RegExpMatchArray): Promise<Response> {
  requireUser(ctx)
  const { vehicleUid, uid } = ids(match)
  const idx = intParam(match[3], 'index', 0, MAX_CHUNKS - 1)
  if (!(await role(ctx, vehicleUid))) throw new HttpError(403, 'Accès refusé.')
  const row = await ctx.env.DB.prepare(
    `SELECT c.data FROM blob_chunks c JOIN blobs b ON b.uid = c.uid
     WHERE c.uid = ? AND c.idx = ? AND b.vehicle_uid = ? AND b.complete = 1`,
  ).bind(uid, idx, vehicleUid).first<{ data: string }>()
  if (!row) throw new HttpError(404, 'Morceau introuvable.')
  return new Response(row.data, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  })
}

/** Supprime une pièce jointe (utilisé par la synchronisation et la suppression de compte). */
export function deleteBlobStatements(db: D1Database, where: { uid: string; vehicleUid: string }) {
  return [
    db.prepare(`DELETE FROM blob_chunks WHERE uid IN (SELECT uid FROM blobs WHERE uid = ? AND vehicle_uid = ?)`).bind(where.uid, where.vehicleUid),
    db.prepare(`DELETE FROM blobs WHERE uid = ? AND vehicle_uid = ?`).bind(where.uid, where.vehicleUid),
  ]
}
