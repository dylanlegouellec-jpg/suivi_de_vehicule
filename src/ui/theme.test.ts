import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, THEMES, resolveReducedMotion } from './theme'

describe('animations réduites', () => {
  it('le choix explicite prime sur le réglage de l’appareil', () => {
    expect(resolveReducedMotion('reduced', false)).toBe(true)
    expect(resolveReducedMotion('full', true)).toBe(false)
  })
  it('en « auto », suit le réglage de l’appareil', () => {
    expect(resolveReducedMotion('auto', true)).toBe(true)
    expect(resolveReducedMotion('auto', false)).toBe(false)
  })
})

describe('thèmes', () => {
  it('trois thèmes, Cockpit par défaut', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['cockpit', 'aurora', 'fluide'])
    expect(DEFAULT_THEME).toBe('cockpit')
  })
  it('chaque thème précise son mode clair/sombre et la couleur de la barre d’état', () => {
    for (const t of THEMES) {
      expect(['dark', 'light']).toContain(t.mode)
      expect(t.barColor).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(THEMES.find((t) => t.id === 'fluide')!.mode).toBe('light')
  })
})
