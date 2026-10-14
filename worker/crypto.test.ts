import { describe, expect, it } from 'vitest'
import { hashPassword, normalizeCode, randomCode, randomToken, safeEqual, sha256Hex, verifyPassword } from './crypto'

describe('mots de passe', () => {
  it('vérifie le bon mot de passe et refuse les autres', async () => {
    const h = await hashPassword('correct horse battery')
    expect(h.startsWith('pbkdf2$100000$')).toBe(true)
    expect(await verifyPassword('correct horse battery', h)).toBe(true)
    expect(await verifyPassword('Correct horse battery', h)).toBe(false)
    expect(await verifyPassword('', h)).toBe(false)
  })
  it('sel aléatoire : deux hachages du même mot de passe diffèrent', async () => {
    expect(await hashPassword('motdepasse12')).not.toBe(await hashPassword('motdepasse12'))
  })
  it('refuse un format de hachage invalide', async () => {
    expect(await verifyPassword('x', 'plaintext')).toBe(false)
  })
})

describe('utilitaires', () => {
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
  it('sha256Hex est déterministe (64 caractères hexadécimaux)', async () => {
    expect(await sha256Hex('a')).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb')
  })
  it('jetons et codes', () => {
    expect(randomToken()).toMatch(/^[0-9a-f]{64}$/)
    expect(randomToken()).not.toBe(randomToken())
    expect(randomCode(3)).toMatch(/^([A-Z2-9]{4}-){2}[A-Z2-9]{4}$/)
    expect(normalizeCode('k7qd-m2xp r9wa')).toBe('K7QDM2XPR9WA')
  })
})
