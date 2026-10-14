// Deux « appareils » (bases IndexedDB simulées) synchronisés via le vrai Worker local.
//   (terminal 1) npm run dev:api     (terminal 2) API_URL=http://localhost:8787 npx vitest run src/sync/engine.integration.test.ts
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { AutoSuiviDB } from '../db/db'
import { makeMutations } from '../db/mutations'
import { createApi, NetworkError, type Api } from './api'
import { SyncEngine } from './engine'

const BASE = process.env.API_URL
const d = BASE ? describe : describe.skip

let n = 0
class Device {
  db: AutoSuiviDB
  api: Api
  engine: SyncEngine
  mut: ReturnType<typeof makeMutations>
  cookie = ''
  offline = false
  constructor() {
    const ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
    this.db = new AutoSuiviDB(`device-${Date.now()}-${n++}`)
    this.api = createApi(async (url, init) => {
      if (this.offline) throw new TypeError('offline')
      const headers = new Headers(init?.headers)
      headers.set('origin', BASE!)
      headers.set('cf-connecting-ip', ip)
      if (this.cookie) headers.set('cookie', this.cookie)
      const res = await fetch(url, { ...init, headers })
      const set = res.headers.get('set-cookie')
      if (set) this.cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0]
      return res
    }, BASE)
    this.engine = new SyncEngine(this.db, this.api)
    this.mut = makeMutations(this.db)
  }
  signup() {
    const email = `u${Math.random().toString(36).slice(2, 10)}@example.com`
    return this.api.json<{ user: { id: string } }>('POST', '/api/auth/register', { email, password: 'mot-de-passe-solide', name: 'T' }).then((r) => ({ email, id: r.user.id }))
  }
  login(email: string) { return this.api.json('POST', '/api/auth/login', { email, password: 'mot-de-passe-solide' }) }
  async seedVehicle(name = 'Clio') {
    const vid = await this.db.vehicles.add({ name, brand: '', model: '', year: null, plate: 'AB-123-CD', fuel: 'essence', firstRegistration: null, mileage: 1000, photo: null, createdAt: 1 })
    return vid
  }
}

const entry = (vehicleId: number, o: object = {}) => ({ vehicleId, type: 'vidange' as const, date: '2025-03-12', amount: 100, km: 5000, garage: 'G', notes: '', documentId: null, ...o })

d('Synchronisation client ↔ serveur', () => {
  it('un second appareil retrouve véhicule, entrées, carburant, rappels et pièce jointe', async () => {
    const a = new Device(), b = new Device()
    const acct = await a.signup()
    const vid = await a.seedVehicle()
    const docId = await a.db.documents.add({ name: 'f.pdf', mime: 'application/pdf', blob: new Blob(['%PDF-1'], { type: 'application/pdf' }), vehicleId: vid, createdAt: 1 })
    await a.db.entries.add(entry(vid, { documentId: docId }))
    await a.db.fuelLogs.add({ vehicleId: vid, date: '2025-01-01', liters: 40, total: 70, km: 1000, full: true })
    await a.db.reminderRules.add({ vehicleId: vid, type: 'vidange', label: 'Vidange', everyMonths: 12, everyKm: 15000 })
    const ra = await a.engine.run()
    expect(ra.pushed).toBe(5)
    expect(ra.blobsUp).toBe(1)
    expect(await a.engine.pendingCount()).toBe(0)

    await b.login(acct.email)
    const rb = await b.engine.run()
    expect(rb.pulled).toBe(5)
    const v = (await b.db.vehicles.toArray())[0]
    expect(v.name).toBe('Clio')
    const e = (await b.db.entries.toArray())[0]
    expect(e.vehicleId).toBe(v.id)
    expect(e.documentId).not.toBeNull()
    const doc = await b.db.documents.get(e.documentId!)
    expect(await doc!.blob!.text()).toBe('%PDF-1')
    expect(await b.db.fuelLogs.count()).toBe(1)
    expect(await b.db.reminderRules.count()).toBe(1)
    expect(await b.engine.pendingCount()).toBe(0)
    // pas d'écho : une seconde synchro n'envoie plus rien
    expect((await b.engine.run()).pushed).toBe(0)
  })

  it('modifications croisées : la plus récente gagne, sur les deux appareils', async () => {
    const a = new Device(), b = new Device()
    const acct = await a.signup()
    const vid = await a.seedVehicle()
    const eid = await a.db.entries.add(entry(vid, { amount: 10 }))
    await a.engine.run()
    await b.login(acct.email)
    await b.engine.run()

    await a.db.entries.update(eid, { amount: 20 }) // plus ancienne
    await new Promise((r) => setTimeout(r, 20))
    const bEntry = (await b.db.entries.toArray())[0]
    await b.db.entries.update(bEntry.id!, { amount: 30 }) // plus récente
    await a.engine.run()
    await b.engine.run()
    await a.engine.run()
    expect((await a.db.entries.toArray())[0].amount).toBe(30)
    expect((await b.db.entries.toArray())[0].amount).toBe(30)
  })

  it('suppression d’une entrée (avec son document) propagée', async () => {
    const a = new Device(), b = new Device()
    const acct = await a.signup()
    const vid = await a.seedVehicle()
    const docId = await a.db.documents.add({ name: 'f.png', mime: 'image/png', blob: new Blob(['x'], { type: 'image/png' }), vehicleId: vid, createdAt: 1 })
    const eid = await a.db.entries.add(entry(vid, { documentId: docId }))
    await a.engine.run()
    await b.login(acct.email)
    await b.engine.run()
    expect(await b.db.entries.count()).toBe(1)

    await a.mut.deleteEntry(eid)
    expect(await a.db.tombstones.count()).toBe(2)
    await a.engine.run()
    expect(await a.db.tombstones.count()).toBe(0)
    await b.engine.run()
    expect(await b.db.entries.count()).toBe(0)
    expect(await b.db.documents.count()).toBe(0)
  })

  it('suppression d’un véhicule en cascade', async () => {
    const a = new Device(), b = new Device()
    const acct = await a.signup()
    const vid = await a.seedVehicle()
    await a.db.entries.add(entry(vid))
    await a.db.fuelLogs.add({ vehicleId: vid, date: '2025-01-01', liters: 1, total: 2, km: null, full: true })
    await a.engine.run()
    await b.login(acct.email)
    await b.engine.run()
    await a.mut.deleteVehicle(vid)
    await a.engine.run()
    await b.engine.run()
    expect(await b.db.vehicles.count()).toBe(0)
    expect(await b.db.entries.count()).toBe(0)
    expect(await b.db.fuelLogs.count()).toBe(0)
  })

  it('hors ligne : les modifications restent locales puis partent au retour du réseau', async () => {
    const a = new Device()
    await a.signup()
    const vid = await a.seedVehicle()
    a.offline = true
    await expect(a.engine.run()).rejects.toBeInstanceOf(NetworkError)
    await a.db.entries.add(entry(vid))
    expect(await a.engine.pendingCount()).toBe(2)
    a.offline = false
    const r = await a.engine.run()
    expect(r.pushed).toBe(2)
    expect(await a.engine.pendingCount()).toBe(0)
  })

  it('gros volumes : envoi et réception en plusieurs lots', async () => {
    const a = new Device(), b = new Device()
    const acct = await a.signup()
    const vid = await a.seedVehicle()
    await a.db.entries.bulkAdd(Array.from({ length: 130 }, (_, i) => entry(vid, { amount: i, date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}` })))
    expect((await a.engine.run()).pushed).toBe(131)
    await b.login(acct.email)
    await b.engine.run()
    expect(await b.db.entries.count()).toBe(130)
  })

  it('photo du véhicule synchronisée', async () => {
    const a = new Device(), b = new Device()
    const acct = await a.signup()
    const vid = await a.seedVehicle()
    await a.db.vehicles.update(vid, { photo: new Blob(['jpegdata'], { type: 'image/jpeg' }), photoVersion: 111 })
    await a.engine.run()
    await b.login(acct.email)
    await b.engine.run()
    const v = (await b.db.vehicles.toArray())[0]
    expect(await v.photo!.text()).toBe('jpegdata')
    expect(v.photoVersion).toBe(111)
  })

  it('partage : invité (lecture seule puis retrait)', async () => {
    const a = new Device(), c = new Device()
    await a.signup()
    await c.signup()
    const vid = await a.seedVehicle()
    await a.db.entries.add(entry(vid))
    await a.engine.run()
    const vUid = (await a.db.vehicles.get(vid))!.uid!
    const inv = await a.api.json<{ code: string }>('POST', `/api/vehicles/${vUid}/invites`, { role: 'viewer' })
    await c.api.json('POST', '/api/invites/accept', { code: inv.code })
    await c.engine.run()
    expect(await c.db.vehicles.count()).toBe(1)
    expect(await c.db.entries.count()).toBe(1)
    expect((await c.engine.roles())[vUid]).toBe('viewer')

    const members = await a.api.json<{ members: { id: string }[] }>('GET', `/api/vehicles/${vUid}/members`)
    const other = members.members.find((m) => m.id !== (a.cookie && members.members[0].id))!
    await a.api.json('DELETE', `/api/vehicles/${vUid}/members/${members.members[1].id}`)
    void other
    await c.engine.run()
    expect(await c.db.vehicles.count()).toBe(0)
    expect(await c.db.entries.count()).toBe(0)
  })

  it('partage en édition : les deux comptes voient les modifications de l’autre', async () => {
    const a = new Device(), c = new Device()
    await a.signup()
    await c.signup()
    const vid = await a.seedVehicle()
    const eid = await a.db.entries.add(entry(vid, { amount: 1 }))
    await a.engine.run()
    const vUid = (await a.db.vehicles.get(vid))!.uid!
    const inv = await a.api.json<{ code: string }>('POST', `/api/vehicles/${vUid}/invites`, { role: 'editor' })
    await c.api.json('POST', '/api/invites/accept', { code: inv.code })
    await c.engine.run()
    const ce = (await c.db.entries.toArray())[0]
    await c.db.entries.update(ce.id!, { amount: 2 })
    await c.db.entries.add(entry((await c.db.vehicles.toArray())[0].id!, { amount: 3, garage: 'Ajout C' }))
    await c.engine.run()
    await a.engine.run()
    expect((await a.db.entries.get(eid))!.amount).toBe(2)
    expect((await a.db.entries.toArray()).some((e) => e.garage === 'Ajout C')).toBe(true)
  })

  it('une suppression locale plus récente n’est pas ressuscitée par une version plus ancienne du serveur', async () => {
    const a = new Device(), b = new Device()
    const acct = await a.signup()
    const vid = await a.seedVehicle()
    const eid = await a.db.entries.add(entry(vid))
    await a.engine.run()
    await b.login(acct.email)
    await b.engine.run()
    await new Promise((r) => setTimeout(r, 20))
    await b.mut.deleteEntry((await b.db.entries.toArray())[0].id!)
    await a.engine.run() // rien de nouveau côté A
    await b.engine.run()
    await a.engine.run()
    expect(await a.db.entries.get(eid)).toBeUndefined()
  })
})
