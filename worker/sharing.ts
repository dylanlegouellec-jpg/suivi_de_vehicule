import { requireUser } from './auth'
import { normalizeCode, randomCode, sha256Hex } from './crypto'
import { rateLimited } from './db'
import { HttpError, type Ctx, type Role } from './types'
import { json, readJson, str, UID_RE } from './util'

const INVITE_DAYS = 7

async function roleIn(ctx: Ctx, vehicleUid: string): Promise<Role | null> {
  const user = requireUser(ctx)
  const row = await ctx.env.DB.prepare(`SELECT role FROM memberships WHERE vehicle_uid = ? AND user_id = ? AND removed = 0`)
    .bind(vehicleUid, user.id).first<{ role: Role }>()
  return row?.role ?? null
}

const checkUid = (v: string) => { if (!UID_RE.test(v)) throw new HttpError(400, 'Identifiant invalide.'); return v }

export async function listMembers(ctx: Ctx, match: RegExpMatchArray): Promise<Response> {
  const vehicleUid = checkUid(match[1])
  if (!(await roleIn(ctx, vehicleUid))) throw new HttpError(403, 'Accès refusé.')
  const rows = (await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.vehicle_uid = ? AND m.removed = 0 ORDER BY m.created_at`,
  ).bind(vehicleUid).all<{ id: string; email: string; name: string; role: Role }>()).results ?? []
  return json({ members: rows })
}

/** Crée un code d'invitation à usage unique (7 jours) ; seul le propriétaire peut inviter. */
export async function createInvite(ctx: Ctx, match: RegExpMatchArray): Promise<Response> {
  const user = requireUser(ctx)
  const vehicleUid = checkUid(match[1])
  if ((await roleIn(ctx, vehicleUid)) !== 'owner') throw new HttpError(403, 'Seul le propriétaire peut inviter.')
  if (await rateLimited(ctx.env, `invite:${user.id}`, 20, 3600)) throw new HttpError(429, 'Trop d\'invitations. Réessayez plus tard.')
  const body = await readJson(ctx.req)
  const role = str(body.role, 10, 'rôle')
  if (role !== 'editor' && role !== 'viewer') throw new HttpError(400, 'Rôle invalide.')
  const code = randomCode(3)
  const expiresAt = Date.now() + INVITE_DAYS * 86_400_000
  await ctx.env.DB.prepare(`INSERT INTO invites (code_hash, vehicle_uid, role, created_by, expires_at, used) VALUES (?, ?, ?, ?, ?, 0)`)
    .bind(await sha256Hex(normalizeCode(code)), vehicleUid, role, user.id, expiresAt).run()
  return json({ code, role, expiresAt }, 201)
}

export async function acceptInvite(ctx: Ctx): Promise<Response> {
  const user = requireUser(ctx)
  if (await rateLimited(ctx.env, `accept:${user.id}`, 10, 3600)) throw new HttpError(429, 'Trop de tentatives. Réessayez plus tard.')
  const body = await readJson(ctx.req)
  const code = normalizeCode(str(body.code, 64, 'code'))
  const hash = await sha256Hex(code)
  const inv = await ctx.env.DB.prepare(`SELECT vehicle_uid, role, expires_at, used FROM invites WHERE code_hash = ?`)
    .bind(hash).first<{ vehicle_uid: string; role: Role; expires_at: number; used: number }>()
  if (!inv || inv.used === 1 || inv.expires_at < Date.now()) throw new HttpError(400, 'Code invalide ou expiré.')
  const exists = await ctx.env.DB.prepare(`SELECT 1 FROM records WHERE uid = ? AND kind = 'vehicle' AND deleted = 0`).bind(inv.vehicle_uid).first()
  if (!exists) throw new HttpError(400, 'Ce véhicule n\'existe plus.')

  const current = await roleIn(ctx, inv.vehicle_uid)
  if (current === 'owner') throw new HttpError(400, 'Vous êtes déjà propriétaire de ce véhicule.')

  // Un invité ne peut jamais devenir propriétaire ; il garde le rôle le plus élevé entre l'existant et l'invitation.
  const role: Role = current === 'editor' || inv.role === 'editor' ? 'editor' : 'viewer'
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`UPDATE meta SET seq = seq + 1 WHERE id = 1`),
    ctx.env.DB.prepare(
      `INSERT INTO memberships (vehicle_uid, user_id, role, removed, seq, created_at)
       VALUES (?1, ?2, ?3, 0, (SELECT seq FROM meta WHERE id = 1), ?4)
       ON CONFLICT(vehicle_uid, user_id) DO UPDATE SET role = excluded.role, removed = 0, seq = excluded.seq`,
    ).bind(inv.vehicle_uid, user.id, role, Date.now()),
    // Les données existantes passent à la nouvelle séquence : le nouveau membre les reçoit à sa prochaine synchro.
    ctx.env.DB.prepare(`UPDATE records SET seq = (SELECT seq FROM meta WHERE id = 1) WHERE vehicle_uid = ?`).bind(inv.vehicle_uid),
    ctx.env.DB.prepare(`UPDATE invites SET used = 1 WHERE code_hash = ?`).bind(hash),
  ])
  return json({ ok: true, vehicleUid: inv.vehicle_uid, role })
}

/** Le propriétaire retire un membre ; tout membre peut se retirer lui-même (sauf le propriétaire). */
export async function removeMember(ctx: Ctx, match: RegExpMatchArray): Promise<Response> {
  const user = requireUser(ctx)
  const vehicleUid = checkUid(match[1])
  const targetId = match[2]
  const mine = await roleIn(ctx, vehicleUid)
  if (!mine) throw new HttpError(403, 'Accès refusé.')
  const target = await ctx.env.DB.prepare(`SELECT role FROM memberships WHERE vehicle_uid = ? AND user_id = ? AND removed = 0`)
    .bind(vehicleUid, targetId).first<{ role: Role }>()
  if (!target) throw new HttpError(404, 'Membre introuvable.')
  if (target.role === 'owner') throw new HttpError(400, 'Le propriétaire ne peut pas être retiré.')
  if (targetId !== user.id && mine !== 'owner') throw new HttpError(403, 'Seul le propriétaire peut retirer un membre.')
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`UPDATE meta SET seq = seq + 1 WHERE id = 1`),
    ctx.env.DB.prepare(`UPDATE memberships SET removed = 1, seq = (SELECT seq FROM meta WHERE id = 1) WHERE vehicle_uid = ? AND user_id = ?`)
      .bind(vehicleUid, targetId),
  ])
  return json({ ok: true })
}
