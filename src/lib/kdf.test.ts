import { describe, expect, it } from 'vitest'
import { deriveAuthKey } from './kdf'

describe('dérivation de la clé de connexion', () => {
  it('produit 64 caractères hexadécimaux, de façon déterministe', async () => {
    const a = await deriveAuthKey('alice@example.com', 'mot-de-passe-solide', 1000)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await deriveAuthKey('alice@example.com', 'mot-de-passe-solide', 1000)).toBe(a)
  })
  it("l'e-mail sert de sel, sans tenir compte de la casse ni des espaces", async () => {
    const a = await deriveAuthKey('alice@example.com', 'mot-de-passe-solide', 1000)
    expect(await deriveAuthKey('  ALICE@Example.com ', 'mot-de-passe-solide', 1000)).toBe(a)
    expect(await deriveAuthKey('bob@example.com', 'mot-de-passe-solide', 1000)).not.toBe(a)
  })
  it('un autre mot de passe donne une autre clé ; le mot de passe n’apparaît pas dans la clé', async () => {
    const a = await deriveAuthKey('alice@example.com', 'mot-de-passe-solide', 1000)
    const b = await deriveAuthKey('alice@example.com', 'mot-de-passe-solidf', 1000)
    expect(b).not.toBe(a)
    expect(a).not.toContain('mot')
  })
  it('le nombre d’itérations change la clé', async () => {
    expect(await deriveAuthKey('a@b.fr', 'x'.repeat(12), 1000)).not.toBe(await deriveAuthKey('a@b.fr', 'x'.repeat(12), 2000))
  })
})
