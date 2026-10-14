import { requireUser } from './auth'
import { HttpError, type Ctx } from './types'
import { UID_RE } from './util'

const MAX_BLOB = 15 * 1024 * 1024
const USER_QUOTA = 300 * 1024 * 1024
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

export async function putBlob(ctx: Ctx, match: RegExpMatchArray): Promise<Response> {
  const user = requireUser(ctx)
  const { vehicleUid, uid } = ids(match)
  const r = await role(ctx, vehicleUid)
  if (!r || r === 'viewer') throw new HttpError(403, 'Accès refusé.')
  const declared = Number(ctx.req.headers.get('content-length') ?? 0)
  if (declared > MAX_BLOB) throw new HttpError(413, 'Fichier trop volumineux (15 Mo maximum).')
  const body = await ctx.req.arrayBuffer()
  if (body.byteLength === 0 || body.byteLength > MAX_BLOB) throw new HttpError(413, 'Fichier vide ou trop volumineux (15 Mo maximum).')

  const used = await ctx.env.DB.prepare(`SELECT COALESCE(SUM(size), 0) AS s FROM blobs WHERE user_id = ? AND uid != ?`).bind(user.id, uid).first<{ s: number }>()
  if ((used?.s ?? 0) + body.byteLength > USER_QUOTA) throw new HttpError(413, 'Quota de stockage dépassé (300 Mo).')

  const declaredMime = (ctx.req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const mime = SAFE_MIME.test(declaredMime) ? declaredMime : 'application/octet-stream'
  await ctx.env.BLOBS.put(`${vehicleUid}/${uid}`, body, { httpMetadata: { contentType: mime } })
  await ctx.env.DB.prepare(
    `INSERT INTO blobs (uid, vehicle_uid, user_id, size, mime, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(uid) DO UPDATE SET size = excluded.size, mime = excluded.mime WHERE blobs.vehicle_uid = excluded.vehicle_uid`,
  ).bind(uid, vehicleUid, user.id, body.byteLength, mime, Date.now()).run()
  return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

export async function getBlob(ctx: Ctx, match: RegExpMatchArray): Promise<Response> {
  requireUser(ctx)
  const { vehicleUid, uid } = ids(match)
  if (!(await role(ctx, vehicleUid))) throw new HttpError(403, 'Accès refusé.')
  const obj = await ctx.env.BLOBS.get(`${vehicleUid}/${uid}`)
  if (!obj) throw new HttpError(404, 'Pièce jointe introuvable.')
  const type = obj.httpMetadata?.contentType
  return new Response(obj.body, {
    headers: {
      'content-type': type && SAFE_MIME.test(type) ? type : 'application/octet-stream',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'",
      'content-disposition': 'attachment',
    },
  })
}
