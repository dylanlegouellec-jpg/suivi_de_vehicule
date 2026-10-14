import { describe, expect, it } from 'vitest'
import { formatPlate, isCompletePlate } from './plate'

describe('formatPlate – format SIV (AB-123-CD)', () => {
  it('ajoute les tirets automatiquement', () => {
    expect(formatPlate('ab123cd')).toBe('AB-123-CD')
    expect(formatPlate('a')).toBe('A')
    expect(formatPlate('ab')).toBe('AB')
    expect(formatPlate('ab1')).toBe('AB-1')
    expect(formatPlate('ab123')).toBe('AB-123')
    expect(formatPlate('ab123c')).toBe('AB-123-C')
  })
  it('refuse un chiffre à la place d’une lettre, et inversement', () => {
    expect(formatPlate('A1')).toBe('A')
    expect(formatPlate('AB-12A')).toBe('AB-12')
    expect(formatPlate('AB-123-C1')).toBe('AB-123-C')
    expect(formatPlate('AB-123-1')).toBe('AB-123')
  })
  it('limite la longueur', () => {
    expect(formatPlate('ab123cdef')).toBe('AB-123-CD')
  })
  it('accepte un collage avec espaces, tirets ou minuscules', () => {
    expect(formatPlate('ab 123 cd')).toBe('AB-123-CD')
    expect(formatPlate('  ab-123-cd ')).toBe('AB-123-CD')
  })
  it('effacer le dernier caractère ne laisse pas de tiret orphelin', () => {
    expect(formatPlate('AB-')).toBe('AB')
    expect(formatPlate('AB-123-')).toBe('AB-123')
  })
  it('vide et caractères parasites', () => {
    expect(formatPlate('')).toBe('')
    expect(formatPlate('--  ')).toBe('')
    expect(formatPlate('é€!')).toBe('')
  })
})

describe('formatPlate – ancien format FNI (1234 AB 56)', () => {
  it('commence par un chiffre : 1 à 4 chiffres, 1 à 3 lettres, 2 à 3 chiffres', () => {
    expect(formatPlate('1234ab56')).toBe('1234 AB 56')
    expect(formatPlate('123abc45')).toBe('123 ABC 45')
    expect(formatPlate('12ab123')).toBe('12 AB 123')
  })
  it('saisie progressive', () => {
    expect(formatPlate('1234')).toBe('1234')
    expect(formatPlate('1234A')).toBe('1234 A')
    expect(formatPlate('1234AB5')).toBe('1234 AB 5')
  })
  it('refuse ce qui ne respecte pas la structure', () => {
    expect(formatPlate('12345')).toBe('1234')
    expect(formatPlate('1234ABCD')).toBe('1234 ABC')
    expect(formatPlate('1234AB56C')).toBe('1234 AB 56')
    expect(formatPlate('12ab3c')).toBe('12 AB 3')
  })
})

describe('isCompletePlate', () => {
  it('reconnaît les plaques complètes', () => {
    expect(isCompletePlate('AB-123-CD')).toBe(true)
    expect(isCompletePlate('1234 AB 56')).toBe(true)
    expect(isCompletePlate('AB-123-C')).toBe(false)
    expect(isCompletePlate('')).toBe(false)
  })
})
