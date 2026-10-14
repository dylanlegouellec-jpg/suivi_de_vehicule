// Tests d'intégration : nécessitent un Worker en marche (npm run dev:api) et API_URL.
//   API_URL=http://localhost:8787 npx vitest run worker/api.integration.test.ts
import { describe, expect, it } from 'vitest'

const BASE = process.env.API_URL
const d = BASE ? describe : describe.skip

class Client {
  cookie = ''
  constructor(public ip = '10.0.0.' + Math.floor(Math.random() * 250)) {}
  async req(method: string, path: string, body?: unknown, extra: { origin?: string | null; raw?: BodyInit; type?: string } = {}) {
    const headers: Record<string, string> = { 'cf-connecting-ip': this.ip }
    if (extra.origin !== null) headers.origin = extra.origin ?? BASE!
    if (this.cookie) headers.cookie = this.cookie
    let payload: BodyInit | undefined
    if (extra.raw !== undefined) { payload = extra.raw; headers['content-type'] = extra.type ?? 'application/octet-stream' }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json' }
    const res = await fetch(BASE + path, { method, headers, body: payload })
    const set = res.headers.get('set-cookie')
    if (set) this.cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0]
    const text = await res.text()
    let data: any = text
    try { data = JSON.parse(text) } catch { /* binaire */ }
    return { status: res.status, data, headers: res.headers }
  }
}

const uniq = () => Math.random().toString(36).slice(2, 10)
const PW = 'mot-de-passe-solide'
async function signup(name = 'Test') {
  const c = new Client()
  const email = `${name.toLowerCase()}-${uniq()}@example.com`
  const r = await c.req('POST', '/api/auth/register', { email, password: PW, name })
  expect(r.status).toBe(201)
  return { c, email, id: r.data.user.id as string, recovery: r.data.recoveryCode as string }
}
const U = () => crypto.randomUUID()
const rec = (kind: string, uid: string, vehicleUid: string, data: object = {}, updatedAt = Date.now(), deleted = false) =>
  ({ kind, uid, vehicleUid, updatedAt, deleted, data })
const syncAll = async (c: Client, changes: unknown[] = [], cursor = { seq: 0, uid: '' }) => {
  const r = await c.req('POST', '/api/sync', { cursor, changes })
  expect(r.status).toBe(200)
  return r.data as { cursor: typeof cursor; changes: any[]; overrides: any[]; rejected: any[]; memberships: any[]; more: boolean }
}

d('API – comptes', () => {
  it('inscription, doublon, mot de passe faible, session', async () => {
    const { c, email } = await signup('Alice')
    expect((await c.req('GET', '/api/auth/me')).data.user.email).toBe(email)
    expect((await new Client().req('POST', '/api/auth/register', { email, password: PW })).status).toBe(409)
    expect((await new Client().req('POST', '/api/auth/register', { email: 'x@example.com', password: 'court' })).status).toBe(400)
    expect((await new Client().req('POST', '/api/auth/register', { email: 'pas-un-email', password: PW })).status).toBe(400)
  })

  it('connexion, mauvaise connexion, déconnexion', async () => {
    const { email } = await signup('Bob')
    const c = new Client()
    expect((await c.req('POST', '/api/auth/login', { email, password: 'mauvais-mot-de-passe' })).status).toBe(401)
    expect((await c.req('POST', '/api/auth/login', { email: 'inconnu@example.com', password: PW })).status).toBe(401)
    expect((await c.req('POST', '/api/auth/login', { email: email.toUpperCase(), password: PW })).status).toBe(200)
    expect((await c.req('GET', '/api/auth/me')).data.user.email).toBe(email)
    await c.req('POST', '/api/auth/logout')
    expect((await c.req('GET', '/api/auth/me')).data.user).toBeNull()
  })

  it('limite les tentatives de connexion', async () => {
    const { email } = await signup('Rate')
    const c = new Client('203.0.113.77')
    let last = 0
    for (let i = 0; i < 10; i++) last = (await c.req('POST', '/api/auth/login', { email, password: 'faux-faux-faux-faux' })).status
    expect(last).toBe(429)
  })

  it('réinitialisation par code de récupération (usage unique)', async () => {
    const { email, recovery } = await signup('Reset')
    const c = new Client()
    expect((await c.req('POST', '/api/auth/reset-password', { email, recoveryCode: 'AAAA-BBBB-CCCC-DDDD-EEEE', newPassword: 'nouveau-mot-de-passe' })).status).toBe(401)
    const ok = await c.req('POST', '/api/auth/reset-password', { email: email, recoveryCode: recovery.toLowerCase(), newPassword: 'nouveau-mot-de-passe' })
    expect(ok.status).toBe(200)
    expect(ok.data.recoveryCode).not.toBe(recovery)
    expect((await new Client().req('POST', '/api/auth/login', { email, password: PW })).status).toBe(401)
    expect((await new Client().req('POST', '/api/auth/login', { email, password: 'nouveau-mot-de-passe' })).status).toBe(200)
    expect((await new Client().req('POST', '/api/auth/reset-password', { email, recoveryCode: recovery, newPassword: 'encore-un-autre-mdp' })).status).toBe(401)
  })

  it('refuse les requêtes modifiantes sans origine valide (CSRF)', async () => {
    const { c } = await signup('Csrf')
    expect((await c.req('POST', '/api/sync', { cursor: { seq: 0, uid: '' }, changes: [] }, { origin: null })).status).toBe(403)
    expect((await c.req('POST', '/api/sync', { cursor: { seq: 0, uid: '' }, changes: [] }, { origin: 'https://evil.example' })).status).toBe(403)
  })

  it('changement de mot de passe', async () => {
    const { c, email } = await signup('Chg')
    expect((await c.req('POST', '/api/auth/change-password', { currentPassword: 'faux-faux-faux', newPassword: 'un-autre-mot-de-passe' })).status).toBe(401)
    expect((await c.req('POST', '/api/auth/change-password', { currentPassword: PW, newPassword: 'un-autre-mot-de-passe' })).status).toBe(200)
    expect((await c.req('GET', '/api/auth/me')).data.user.email).toBe(email)
    expect((await new Client().req('POST', '/api/auth/login', { email, password: 'un-autre-mot-de-passe' })).status).toBe(200)
  })
})

d('API – synchronisation', () => {
  it('exige une connexion', async () => {
    expect((await new Client().req('POST', '/api/sync', { cursor: { seq: 0, uid: '' }, changes: [] })).status).toBe(401)
  })

  it('un appareil pousse, un second appareil du même compte reçoit', async () => {
    const { c, email } = await signup('Sync')
    const V = U(), E = U()
    const r1 = await syncAll(c, [rec('vehicle', V, V, { name: 'Clio' }), rec('entry', E, V, { type: 'vidange', amount: 100 })])
    expect(r1.rejected).toEqual([])
    const c2 = new Client()
    await c2.req('POST', '/api/auth/login', { email, password: PW })
    const r2 = await syncAll(c2)
    expect(r2.changes.map((x) => x.uid).sort()).toEqual([V, E].sort())
    expect(r2.changes.find((x) => x.uid === E).data.amount).toBe(100)
    // reprise avec le curseur : plus rien de nouveau
    const r3 = await syncAll(c2, [], r2.cursor)
    expect(r3.changes).toEqual([])
  })

  it('dernière modification gagnante ; une modification plus ancienne est renvoyée corrigée', async () => {
    const { c } = await signup('Lww')
    const V = U(), E = U()
    const t = Date.now() - 10_000
    await syncAll(c, [rec('vehicle', V, V, {}, t), rec('entry', E, V, { amount: 1 }, t)])
    await syncAll(c, [rec('entry', E, V, { amount: 3 }, t + 2000)])
    const old = await syncAll(c, [rec('entry', E, V, { amount: 2 }, t + 1000)])
    expect(old.overrides).toHaveLength(1)
    expect(old.overrides[0].data.amount).toBe(3)
  })

  it('suppression propagée (tombstone)', async () => {
    const { c } = await signup('Del')
    const V = U(), E = U()
    const t = Date.now() - 5000
    await syncAll(c, [rec('vehicle', V, V, {}, t), rec('entry', E, V, { a: 1 }, t)])
    await syncAll(c, [rec('entry', E, V, {}, t + 1000, true)])
    const all = await syncAll(c)
    expect(all.changes.find((x) => x.uid === E).deleted).toBe(true)
  })

  it('isolation : un autre compte ne voit rien et ne peut rien écrire ni détourner', async () => {
    const a = await signup('Owner'), b = await signup('Intrus')
    const V = U(), E = U()
    await syncAll(a.c, [rec('vehicle', V, V, { name: 'Secret' }), rec('entry', E, V, { amount: 'SECRET-424242' })])
    expect((await syncAll(b.c)).changes).toEqual([])
    // écriture dans le véhicule d'autrui
    const w = await syncAll(b.c, [rec('entry', U(), V, { x: 1 })])
    expect(w.rejected).toHaveLength(1)
    // prise de contrôle d'un véhicule existant
    const t = await syncAll(b.c, [rec('vehicle', V, V, { name: 'Pirate' })])
    expect(t.rejected[0].reason).toMatch(/déjà utilisé/)
    // détournement d'un enregistrement via son propre véhicule : rien n'est modifié ni renvoyé
    const V2 = U()
    const h = await syncAll(b.c, [rec('vehicle', V2, V2, {}), rec('entry', E, V2, { amount: 1 }, Date.now() - 100000)])
    expect(h.overrides).toEqual([])
    expect(JSON.stringify(h)).not.toContain('SECRET-424242')
    const check = await syncAll(a.c)
    expect(check.changes.find((x) => x.uid === E).data.amount).toBe('SECRET-424242')
  })

  it('valide les entrées', async () => {
    const { c } = await signup('Valid')
    const bad = (changes: unknown[]) => c.req('POST', '/api/sync', { cursor: { seq: 0, uid: '' }, changes })
    expect((await bad([{ kind: 'nimporte', uid: U(), vehicleUid: U(), updatedAt: 1, deleted: false, data: {} }])).status).toBe(400)
    expect((await bad([rec('entry', '../etc', U())])).status).toBe(400)
    expect((await bad([rec('entry', U(), U(), { big: 'x'.repeat(40_000) })])).status).toBe(413)
    expect((await bad(Array.from({ length: 51 }, () => rec('entry', U(), U())))).status).toBe(413)
  })

  it('pagination du curseur sans perte ni doublon', async () => {
    const { c } = await signup('Page')
    const V = U()
    const ids: string[] = []
    await syncAll(c, [rec('vehicle', V, V)])
    for (let i = 0; i < 7; i++) {
      const batch = Array.from({ length: 50 }, () => { const id = U(); ids.push(id); return rec('entry', id, V, { i }) })
      await syncAll(c, batch)
    }
    const seen = new Set<string>()
    let cursor = { seq: 0, uid: '' }
    for (let guard = 0; guard < 10; guard++) {
      const r = await syncAll(c, [], cursor)
      r.changes.forEach((x) => seen.add(x.uid))
      cursor = r.cursor
      if (!r.more) break
    }
    expect(ids.every((i) => seen.has(i))).toBe(true)
    expect(seen.size).toBe(351)
  })
})

d('API – partage', () => {
  it('invitation, droits, retrait', async () => {
    const a = await signup('Proprio'), b = await signup('Invite'), x = await signup('Tiers')
    const V = U(), E = U()
    await syncAll(a.c, [rec('vehicle', V, V, { name: 'Clio' }), rec('entry', E, V, { amount: 10 })])

    // seul le propriétaire invite
    expect((await b.c.req('POST', `/api/vehicles/${V}/invites`, { role: 'editor' })).status).toBe(403)
    expect((await a.c.req('POST', `/api/vehicles/${V}/invites`, { role: 'proprietaire' })).status).toBe(400)
    const inv = await a.c.req('POST', `/api/vehicles/${V}/invites`, { role: 'viewer' })
    expect(inv.status).toBe(201)

    expect((await b.c.req('POST', '/api/invites/accept', { code: 'AAAA-BBBB-CCCC' })).status).toBe(400)
    const acc = await b.c.req('POST', '/api/invites/accept', { code: inv.data.code.toLowerCase() })
    expect(acc.status).toBe(200)
    expect(acc.data.role).toBe('viewer')
    // usage unique
    expect((await x.c.req('POST', '/api/invites/accept', { code: inv.data.code })).status).toBe(400)

    // b reçoit les données existantes, en lecture seule
    const got = await syncAll(b.c)
    expect(got.changes.map((c) => c.uid).sort()).toEqual([V, E].sort())
    expect(got.memberships).toEqual([{ vehicleUid: V, role: 'viewer', removed: false }])
    expect((await syncAll(b.c, [rec('entry', E, V, { amount: 0 })])).rejected[0].reason).toMatch(/lecture seule/)
    expect((await b.c.req('GET', `/api/vehicles/${V}/members`)).data.members).toHaveLength(2)
    expect((await x.c.req('GET', `/api/vehicles/${V}/members`)).status).toBe(403)

    // éditeur : peut écrire, a un second compte qui voit la modification
    const inv2 = await a.c.req('POST', `/api/vehicles/${V}/invites`, { role: 'editor' })
    expect((await b.c.req('POST', '/api/invites/accept', { code: inv2.data.code })).data.role).toBe('editor')
    const cur = (await syncAll(b.c)).cursor
    const w = await syncAll(b.c, [rec('entry', E, V, { amount: 55 }, Date.now())], cur)
    expect(w.rejected).toEqual([])
    expect((await syncAll(a.c)).changes.find((c) => c.uid === E).data.amount).toBe(55)
    // un éditeur ne peut pas supprimer le véhicule
    expect((await syncAll(b.c, [rec('vehicle', V, V, {}, Date.now(), true)])).rejected[0].reason).toMatch(/propriétaire/)

    // retrait par le propriétaire
    expect((await a.c.req('DELETE', `/api/vehicles/${V}/members/${b.id}`)).status).toBe(200)
    const after = await syncAll(b.c)
    expect(after.memberships).toContainEqual({ vehicleUid: V, role: 'editor', removed: true })
    expect(after.changes).toEqual([])
    expect((await syncAll(b.c, [rec('entry', E, V, { amount: 1 })])).rejected).toHaveLength(1)
    // le propriétaire ne peut pas être retiré
    expect((await a.c.req('DELETE', `/api/vehicles/${V}/members/${a.id}`)).status).toBe(400)
  })

  it('un membre peut quitter le véhicule', async () => {
    const a = await signup('P2'), b = await signup('I2')
    const V = U()
    await syncAll(a.c, [rec('vehicle', V, V)])
    const inv = await a.c.req('POST', `/api/vehicles/${V}/invites`, { role: 'editor' })
    await b.c.req('POST', '/api/invites/accept', { code: inv.data.code })
    expect((await b.c.req('DELETE', `/api/vehicles/${V}/members/${b.id}`)).status).toBe(200)
    expect((await syncAll(b.c)).changes).toEqual([])
  })
})

d('API – pièces jointes', () => {
  it('envoi, lecture, droits, types sûrs, taille', async () => {
    const a = await signup('Blob'), b = await signup('BlobB')
    const V = U(), D = U()
    await syncAll(a.c, [rec('vehicle', V, V), rec('document', D, V, { name: 'f.pdf' })])
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49])
    expect((await a.c.req('PUT', `/api/blobs/${V}/${D}`, undefined, { raw: bytes, type: 'application/pdf' })).status).toBe(201)
    const got = await a.c.req('GET', `/api/blobs/${V}/${D}`)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('application/pdf')
    expect(got.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await b.c.req('GET', `/api/blobs/${V}/${D}`)).status).toBe(403)
    expect((await b.c.req('PUT', `/api/blobs/${V}/${D}`, undefined, { raw: bytes })).status).toBe(403)
    // un HTML déposé ne sera jamais servi comme HTML
    const E = U()
    await a.c.req('PUT', `/api/blobs/${V}/${E}`, undefined, { raw: '<script>alert(1)</script>', type: 'text/html' })
    expect((await a.c.req('GET', `/api/blobs/${V}/${E}`)).headers.get('content-type')).toBe('application/octet-stream')
    // trop gros
    expect((await a.c.req('PUT', `/api/blobs/${V}/${U()}`, undefined, { raw: new Uint8Array(16 * 1024 * 1024), type: 'application/pdf' })).status).toBe(413)
    expect((await a.c.req('GET', `/api/blobs/${V}/${U()}`)).status).toBe(404)
  })

  it('la suppression du document supprime la pièce jointe', async () => {
    const a = await signup('BlobDel')
    const V = U(), D = U()
    const t = Date.now() - 5000
    await syncAll(a.c, [rec('vehicle', V, V, {}, t), rec('document', D, V, {}, t)])
    await a.c.req('PUT', `/api/blobs/${V}/${D}`, undefined, { raw: new Uint8Array([1, 2, 3]), type: 'image/png' })
    await syncAll(a.c, [rec('document', D, V, {}, t + 1000, true)])
    expect((await a.c.req('GET', `/api/blobs/${V}/${D}`)).status).toBe(404)
  })
})

d('API – suppression de compte', () => {
  it('transfère à un autre membre, sinon supprime les données', async () => {
    const a = await signup('Del1'), b = await signup('Heir')
    const Vshared = U(), Vsolo = U(), E = U()
    await syncAll(a.c, [rec('vehicle', Vshared, Vshared), rec('vehicle', Vsolo, Vsolo), rec('entry', E, Vsolo, { x: 1 })])
    const inv = await a.c.req('POST', `/api/vehicles/${Vshared}/invites`, { role: 'editor' })
    await b.c.req('POST', '/api/invites/accept', { code: inv.data.code })

    expect((await a.c.req('POST', '/api/account/delete', { password: 'faux-faux-faux' })).status).toBe(401)
    expect((await a.c.req('POST', '/api/account/delete', { password: PW })).status).toBe(200)
    expect((await a.c.req('GET', '/api/auth/me')).data.user).toBeNull()

    const r = await syncAll(b.c)
    expect(r.changes.map((x) => x.uid)).toEqual([Vshared])
    expect(r.memberships.find((m) => m.vehicleUid === Vshared).role).toBe('owner')
    // le véhicule non partagé n'existe plus
    const inv2 = await b.c.req('POST', `/api/vehicles/${Vsolo}/invites`, { role: 'viewer' })
    expect(inv2.status).toBe(403)
  })
})
