import { db, getSetting, setLocalChangeListener, setSetting } from '../db/db'
import { ApiError, createApi, NetworkError } from './api'
import { SyncEngine } from './engine'

export interface AuthUser { id: string; email: string; name: string }

// ───────────────────────── Petit store observable (useSyncExternalStore) ─────────────────────────
class Store<T> {
  private listeners = new Set<() => void>()
  constructor(private value: T) {}
  get = () => this.value
  set(next: Partial<T>) {
    this.value = { ...this.value, ...next }
    this.listeners.forEach((l) => l())
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }
}

export const authStore = new Store<{ user: AuthUser | null; ready: boolean; notice: string | null }>({ user: null, ready: false, notice: null })
export const syncStore = new Store<{ state: 'idle' | 'syncing' | 'error' | 'offline'; lastSyncAt: number | null; error: string | null; pending: number; rejected: number }>({
  state: 'idle', lastSyncAt: null, error: null, pending: 0, rejected: 0,
})

export const api = createApi(undefined, '', () => {
  // Session expirée côté serveur : on repasse en mode local (les données restent sur l'appareil).
  if (authStore.get().user) {
    void setSetting('auth.user', null)
    authStore.set({ user: null, notice: 'Votre session a expiré. Reconnectez-vous pour reprendre la synchronisation.' })
  }
})
export const engine = new SyncEngine(db, api)

// ───────────────────────── Synchronisation ─────────────────────────
let running: Promise<void> | null = null
let rerun = false
let timer: ReturnType<typeof setTimeout> | null = null

export function triggerSync(delayMs = 0) {
  if (!authStore.get().user) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void syncNow() }, delayMs)
}

/** Une seule synchronisation à la fois ; si des modifications arrivent pendant l'exécution, une seconde passe suit. */
export function syncNow(): Promise<void> {
  if (!authStore.get().user) return Promise.resolve()
  if (running) { rerun = true; return running }
  running = (async () => {
    do {
      rerun = false
      if (!navigator.onLine) { syncStore.set({ state: 'offline', pending: await engine.pendingCount() }); break }
      syncStore.set({ state: 'syncing', error: null })
      try {
        const r = await engine.run()
        syncStore.set({ state: 'idle', lastSyncAt: Date.now(), error: null, pending: await engine.pendingCount(), rejected: r.rejected })
      } catch (e) {
        const pending = await engine.pendingCount()
        if (e instanceof NetworkError) syncStore.set({ state: 'offline', pending })
        else if (e instanceof ApiError && e.status === 401) syncStore.set({ state: 'idle', pending })
        else syncStore.set({ state: 'error', error: e instanceof Error ? e.message : 'Échec de la synchronisation.', pending })
        break
      }
    } while (rerun)
  })().finally(() => { running = null })
  return running
}

let started = false
export function startSyncTriggers() {
  if (started) return
  started = true
  setLocalChangeListener(() => triggerSync(3000))
  window.addEventListener('online', () => triggerSync(500))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') triggerSync(500) })
  setInterval(() => { if (document.visibilityState === 'visible') triggerSync(0) }, 120_000)
}

// ───────────────────────── Compte ─────────────────────────
const wipeKeys = ['sync.cursor', 'sync.lastSyncAt', 'sync.roles', 'sync.orphans', 'sync.userId']

/** Efface toutes les données de l'appareil (données, suppressions en attente, état de synchro). */
export async function wipeLocalData() {
  await db.transaction('rw', [db.vehicles, db.documents, db.entries, db.fuelLogs, db.reminderRules, db.tombstones, db.settings], async () => {
    await Promise.all([db.vehicles, db.documents, db.entries, db.fuelLogs, db.reminderRules, db.tombstones, db.settings].map((t) => t.clear()))
  })
}

async function clearSyncState() {
  await db.settings.bulkDelete(wipeKeys)
}

export async function initAuth() {
  const cached = await getSetting<AuthUser | null>('auth.user', null)
  authStore.set({ user: cached, ready: true })
  startSyncTriggers()
  if (!cached) return
  triggerSync(0)
  try {
    const r = await api.json<{ user: AuthUser | null }>('GET', '/api/auth/me')
    if (!r.user) {
      await setSetting('auth.user', null)
      authStore.set({ user: null, notice: 'Votre session a expiré. Reconnectez-vous pour reprendre la synchronisation.' })
    }
  } catch { /* hors ligne : on garde le compte en cache */ }
}

/**
 * Vérifie que les données locales appartiennent bien à ce compte.
 * - jamais synchronisées : elles seront ajoutées au compte ;
 * - synchronisées avec un autre compte : conflit (l'utilisateur doit choisir d'effacer l'appareil).
 */
async function checkOwnership(user: AuthUser): Promise<'ok' | 'conflict'> {
  const owner = await getSetting<string | null>('sync.userId', null)
  if (owner && owner !== user.id && (await db.vehicles.count()) > 0) return 'conflict'
  if (owner && owner !== user.id) await clearSyncState()
  return 'ok'
}

export async function confirmAccount(user: AuthUser) {
  await setSetting('sync.userId', user.id)
  await setSetting('auth.user', user)
  authStore.set({ user, notice: null })
  triggerSync(0)
}

export type AuthResult = { status: 'ok'; recoveryCode?: string; user: AuthUser } | { status: 'conflict'; user: AuthUser }

/** Dernière étape de la connexion : vérifie à qui appartiennent les données de l'appareil, puis active la synchro. */
export async function completeAuth(user: AuthUser): Promise<AuthResult> {
  if ((await checkOwnership(user)) === 'conflict') return { status: 'conflict', user }
  await confirmAccount(user)
  return { status: 'ok', user }
}

async function finishAuth(user: AuthUser, recoveryCode?: string): Promise<AuthResult> {
  // Le code de récupération doit être montré avant d'entrer dans l'app : on termine après.
  if (recoveryCode) return { status: 'ok', user, recoveryCode }
  return completeAuth(user)
}

export async function register(email: string, password: string, name: string): Promise<AuthResult> {
  const r = await api.json<{ user: AuthUser; recoveryCode: string }>('POST', '/api/auth/register', { email, password, name })
  return finishAuth(r.user, r.recoveryCode)
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const r = await api.json<{ user: AuthUser }>('POST', '/api/auth/login', { email, password })
  return finishAuth(r.user)
}

export async function resetPassword(email: string, recoveryCode: string, newPassword: string): Promise<{ recoveryCode: string; user: AuthUser | null }> {
  const r = await api.json<{ recoveryCode: string }>('POST', '/api/auth/reset-password', { email, recoveryCode, newPassword })
  const me = await api.json<{ user: AuthUser | null }>('GET', '/api/auth/me')
  return { recoveryCode: r.recoveryCode, user: me.user }
}

export async function logout(opts: { wipe: boolean }) {
  try { if (navigator.onLine) await syncNow() } catch { /* on se déconnecte quand même */ }
  try { await api.json('POST', '/api/auth/logout') } catch { /* idem */ }
  await setSetting('auth.user', null)
  if (opts.wipe) await wipeLocalData()
  authStore.set({ user: null, notice: null })
  syncStore.set({ state: 'idle', error: null, pending: 0 })
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await api.json('POST', '/api/auth/change-password', { currentPassword, newPassword })
}

/** Supprime le compte et ses données côté serveur ; les données de l'appareil sont conservées en local (ou effacées). */
export async function deleteAccount(password: string, opts: { wipe: boolean }) {
  await api.json('POST', '/api/account/delete', { password })
  await setSetting('auth.user', null)
  if (opts.wipe) await wipeLocalData()
  else {
    // Les données locales redeviennent « à envoyer » : elles pourront être ajoutées à un futur compte.
    await db.tombstones.clear()
    await clearSyncState()
    for (const t of [db.vehicles, db.documents, db.entries, db.fuelLogs, db.reminderRules] as unknown as { toCollection(): { modify(c: object): Promise<number> } }[]) await t.toCollection().modify({ dirty: 1 })
  }
  authStore.set({ user: null, notice: null })
}

/** Rejoint un véhicule partagé grâce à un code d'invitation. */
export async function acceptInvite(code: string) {
  const r = await api.json<{ vehicleUid: string; role: string }>('POST', '/api/invites/accept', { code })
  await syncNow()
  return r
}
