import { hashPassword, normalizeCode, randomCode, randomToken, sha256Hex, verifyPassword } from './crypto'
import { rateLimited } from './db'
import { HttpError, type Ctx, type User } from './types'
import { json, readJson, str } from './util'

const SESSION_DAYS = 90
const COOKIE = 'session'
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

// Hachage factice pour égaliser le temps de réponse quand l'e-mail est inconnu.
// (calculé à la demande : Workers interdit l'aléa et les E/S au chargement du module)
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'))

const sessionCookie = (token: string, maxAge: number) =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

export async function currentUser(ctx: Pick<Ctx, 'env' | 'req'>): Promise<User | null> {
  const token = readCookie(ctx.req, COOKIE)
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null
  const row = await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256Hex(token), Date.now()).first<User>()
  return row ?? null
}

export function requireUser(ctx: Ctx): User {
  if (!ctx.user) throw new HttpError(401, 'Connexion requise.')
  return ctx.user
}

async function createSession(ctx: Ctx, userId: string) {
  const token = randomToken()
  const now = Date.now()
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND expires_at < ?`).bind(userId, now),
    ctx.env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
      .bind(await sha256Hex(token), userId, now, now + SESSION_DAYS * 86_400_000),
  ])
  return sessionCookie(token, SESSION_DAYS * 86_400)
}

function credentials(body: Record<string, unknown>) {
  const email = str(body.email, 254, 'e-mail').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Adresse e-mail invalide.')
  return email
}

function checkPassword(pw: unknown, name = 'mot de passe') {
  const p = str(pw, 200, name, 1)
  if (p.length < 10) throw new HttpError(400, 'Le mot de passe doit contenir au moins 10 caractères.')
  return p
}

export async function register(ctx: Ctx): Promise<Response> {
  if (await rateLimited(ctx.env, `register:${ctx.ip}`, 10, 3600)) throw new HttpError(429, 'Trop de créations de compte. Réessayez plus tard.')
  const body = await readJson(ctx.req)
  const email = credentials(body)
  const password = checkPassword(body.password)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''

  const exists = await ctx.env.DB.prepare(`SELECT 1 FROM users WHERE email = ?`).bind(email).first()
  if (exists) throw new HttpError(409, 'Un compte existe déjà avec cet e-mail.')

  const id = crypto.randomUUID()
  const recovery = randomCode(5)
  try {
    await ctx.env.DB.prepare(
      `INSERT INTO users (id, email, name, pw_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, email, name, await hashPassword(password), await sha256Hex(normalizeCode(recovery)), Date.now()).run()
  } catch {
    throw new HttpError(409, 'Un compte existe déjà avec cet e-mail.')
  }
  const cookie = await createSession(ctx, id)
  return json({ user: { id, email, name }, recoveryCode: recovery }, 201, { 'set-cookie': cookie })
}

export async function login(ctx: Ctx): Promise<Response> {
  const body = await readJson(ctx.req)
  const email = credentials(body)
  const password = str(body.password, 200, 'mot de passe')
  if (
    (await rateLimited(ctx.env, `login:${email}:${ctx.ip}`, 8, 900)) ||
    (await rateLimited(ctx.env, `login-ip:${ctx.ip}`, 40, 900))
  ) throw new HttpError(429, 'Trop de tentatives. Réessayez dans 15 minutes.')

  const row = await ctx.env.DB.prepare(`SELECT id, email, name, pw_hash FROM users WHERE email = ?`).bind(email).first<User & { pw_hash: string }>()
  const ok = await verifyPassword(password, row?.pw_hash ?? (await getDummyHash()))
  if (!row || !ok) throw new HttpError(401, 'E-mail ou mot de passe incorrect.')
  const cookie = await createSession(ctx, row.id)
  return json({ user: { id: row.id, email: row.email, name: row.name } }, 200, { 'set-cookie': cookie })
}

export async function logout(ctx: Ctx): Promise<Response> {
  const token = readCookie(ctx.req, COOKIE)
  if (token) await ctx.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256Hex(token)).run()
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) })
}

export const me = (ctx: Ctx) => json({ user: ctx.user })

/** Réinitialisation par code de récupération (aucun e-mail n'est envoyé). */
export async function resetPassword(ctx: Ctx): Promise<Response> {
  const body = await readJson(ctx.req)
  const email = credentials(body)
  const code = normalizeCode(str(body.recoveryCode, 64, 'code de récupération'))
  const password = checkPassword(body.newPassword, 'nouveau mot de passe')
  if (
    (await rateLimited(ctx.env, `reset:${email}`, 5, 3600)) ||
    (await rateLimited(ctx.env, `reset-ip:${ctx.ip}`, 20, 3600))
  ) throw new HttpError(429, 'Trop de tentatives. Réessayez plus tard.')

  const row = await ctx.env.DB.prepare(`SELECT id, recovery_hash FROM users WHERE email = ?`).bind(email).first<{ id: string; recovery_hash: string }>()
  const valid = row != null && (await sha256Hex(code)) === row.recovery_hash
  if (!row || !valid) throw new HttpError(401, 'E-mail ou code de récupération incorrect.')

  const newRecovery = randomCode(5)
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`UPDATE users SET pw_hash = ?, recovery_hash = ? WHERE id = ?`)
      .bind(await hashPassword(password), await sha256Hex(normalizeCode(newRecovery)), row.id),
    ctx.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(row.id),
  ])
  const cookie = await createSession(ctx, row.id)
  return json({ ok: true, recoveryCode: newRecovery }, 200, { 'set-cookie': cookie })
}

export async function changePassword(ctx: Ctx): Promise<Response> {
  const user = requireUser(ctx)
  const body = await readJson(ctx.req)
  const current = str(body.currentPassword, 200, 'mot de passe actuel')
  const next = checkPassword(body.newPassword, 'nouveau mot de passe')
  if (await rateLimited(ctx.env, `chpw:${user.id}`, 8, 900)) throw new HttpError(429, 'Trop de tentatives.')
  const row = await ctx.env.DB.prepare(`SELECT pw_hash FROM users WHERE id = ?`).bind(user.id).first<{ pw_hash: string }>()
  if (!row || !(await verifyPassword(current, row.pw_hash))) throw new HttpError(401, 'Mot de passe actuel incorrect.')
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`UPDATE users SET pw_hash = ? WHERE id = ?`).bind(await hashPassword(next), user.id),
    ctx.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(user.id),
  ])
  const cookie = await createSession(ctx, user.id)
  return json({ ok: true }, 200, { 'set-cookie': cookie })
}

/**
 * Suppression du compte (RGPD). Véhicules dont l'utilisateur est propriétaire :
 * transférés au plus ancien autre membre actif s'il y en a un, sinon supprimés avec leurs données.
 */
export async function deleteAccount(ctx: Ctx): Promise<Response> {
  const user = requireUser(ctx)
  const body = await readJson(ctx.req)
  const password = str(body.password, 200, 'mot de passe')
  if (await rateLimited(ctx.env, `delacc:${user.id}`, 5, 900)) throw new HttpError(429, 'Trop de tentatives.')
  const row = await ctx.env.DB.prepare(`SELECT pw_hash FROM users WHERE id = ?`).bind(user.id).first<{ pw_hash: string }>()
  if (!row || !(await verifyPassword(password, row.pw_hash))) throw new HttpError(401, 'Mot de passe incorrect.')

  const owned = (await ctx.env.DB.prepare(`SELECT vehicle_uid FROM memberships WHERE user_id = ? AND role = 'owner' AND removed = 0`)
    .bind(user.id).all<{ vehicle_uid: string }>()).results ?? []
  const toPurge: string[] = []
  const stmts: D1PreparedStatement[] = [ctx.env.DB.prepare(`UPDATE meta SET seq = seq + 1 WHERE id = 1`)]
  for (const { vehicle_uid } of owned) {
    const heir = await ctx.env.DB.prepare(
      `SELECT user_id FROM memberships WHERE vehicle_uid = ? AND user_id != ? AND removed = 0
       ORDER BY CASE role WHEN 'editor' THEN 0 ELSE 1 END, created_at LIMIT 1`,
    ).bind(vehicle_uid, user.id).first<{ user_id: string }>()
    if (heir) {
      stmts.push(ctx.env.DB.prepare(`UPDATE memberships SET role = 'owner', seq = (SELECT seq FROM meta WHERE id = 1) WHERE vehicle_uid = ? AND user_id = ?`).bind(vehicle_uid, heir.user_id))
    } else {
      toPurge.push(vehicle_uid)
      stmts.push(ctx.env.DB.prepare(`DELETE FROM records WHERE vehicle_uid = ?`).bind(vehicle_uid))
      stmts.push(ctx.env.DB.prepare(`DELETE FROM memberships WHERE vehicle_uid = ?`).bind(vehicle_uid))
      stmts.push(ctx.env.DB.prepare(`DELETE FROM invites WHERE vehicle_uid = ?`).bind(vehicle_uid))
    }
  }
  // Les pièces jointes de l'utilisateur dans les véhicules conservés restent à leurs membres.
  for (const v of toPurge) {
    const keys = (await ctx.env.DB.prepare(`SELECT uid FROM blobs WHERE vehicle_uid = ?`).bind(v).all<{ uid: string }>()).results ?? []
    if (keys.length) await ctx.env.BLOBS.delete(keys.map((k) => `${v}/${k.uid}`))
    stmts.push(ctx.env.DB.prepare(`DELETE FROM blobs WHERE vehicle_uid = ?`).bind(v))
  }
  stmts.push(
    ctx.env.DB.prepare(`DELETE FROM memberships WHERE user_id = ?`).bind(user.id),
    ctx.env.DB.prepare(`DELETE FROM invites WHERE created_by = ?`).bind(user.id),
    ctx.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(user.id),
    ctx.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(user.id),
  )
  await ctx.env.DB.batch(stmts)
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) })
}
