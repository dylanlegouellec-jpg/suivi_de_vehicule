import type { Env } from './types'

/**
 * Migrations versionnées, appliquées automatiquement au premier appel (une fois par isolat).
 * Ne jamais modifier une migration déjà publiée : en ajouter une nouvelle.
 */
const MIGRATIONS: { id: number; statements: string[] }[] = [
  {
    id: 1,
    statements: [
      `CREATE TABLE users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
        pw_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
      `CREATE INDEX idx_sessions_user ON sessions(user_id)`,
      `CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL)`,
      `INSERT INTO meta (id, seq) VALUES (1, 0)`,
      `CREATE TABLE records (
        uid TEXT PRIMARY KEY, kind TEXT NOT NULL, vehicle_uid TEXT NOT NULL, updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, seq INTEGER NOT NULL)`,
      `CREATE INDEX idx_records_vehicle_seq ON records(vehicle_uid, seq, uid)`,
      `CREATE TABLE memberships (
        vehicle_uid TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, removed INTEGER NOT NULL DEFAULT 0,
        seq INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (vehicle_uid, user_id))`,
      `CREATE INDEX idx_memberships_user ON memberships(user_id, seq)`,
      `CREATE TABLE invites (
        code_hash TEXT PRIMARY KEY, vehicle_uid TEXT NOT NULL, role TEXT NOT NULL, created_by TEXT NOT NULL,
        expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
      // Pièces jointes : découpées en morceaux (base64) car une ligne D1 est limitée à 2 Mo.
      `CREATE TABLE blobs (
        uid TEXT PRIMARY KEY, vehicle_uid TEXT NOT NULL, user_id TEXT NOT NULL, size INTEGER NOT NULL,
        mime TEXT NOT NULL, chunks INTEGER NOT NULL, complete INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
      `CREATE INDEX idx_blobs_user ON blobs(user_id)`,
      `CREATE INDEX idx_blobs_vehicle ON blobs(vehicle_uid)`,
      `CREATE TABLE blob_chunks (uid TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (uid, idx))`,
      `CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)`,
    ],
  },
]

let ready: Promise<void> | null = null

export function ensureSchema(env: Env): Promise<void> {
  ready ??= (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`).run()
    const done = new Set(((await env.DB.prepare(`SELECT id FROM _migrations`).all<{ id: number }>()).results ?? []).map((r) => r.id))
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue
      await env.DB.batch([
        ...m.statements.map((s) => env.DB.prepare(s)),
        env.DB.prepare(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`).bind(m.id, Date.now()),
      ])
    }
  })().catch((e) => {
    ready = null
    throw e
  })
  return ready
}

/** Limiteur simple en base : renvoie true si la limite est dépassée. */
export async function rateLimited(env: Env, key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  const cutoff = now - windowSec
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start < ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start < ?3 THEN ?2 ELSE window_start END
     RETURNING count`,
  ).bind(key, now, cutoff).first<{ count: number }>()
  return (row?.count ?? 0) > max
}
