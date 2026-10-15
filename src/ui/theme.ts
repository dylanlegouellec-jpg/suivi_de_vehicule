import { useSyncExternalStore } from 'react'

export type ThemeId = 'cockpit' | 'aurora' | 'fluide'
export type MotionPref = 'auto' | 'full' | 'reduced'

export interface ThemeMeta {
  id: ThemeId
  label: string
  description: string
  mode: 'dark' | 'light'
  /** Couleur de la barre d'état (meta theme-color). */
  barColor: string
}

export const THEMES: ThemeMeta[] = [
  { id: 'cockpit', label: 'Cockpit', description: 'Tableau de bord : fond carbone, compteur à rouleaux, accent ambre.', mode: 'dark', barColor: '#0d0f12' },
  { id: 'aurora', label: 'Aurora', description: 'Verre dépoli sur lumières colorées qui dérivent lentement.', mode: 'dark', barColor: '#070b1a' },
  { id: 'fluide', label: 'Fluide', description: 'Clair et vitaminé : dégradés doux, grosses cartes arrondies.', mode: 'light', barColor: '#f4f1ff' },
]

export const DEFAULT_THEME: ThemeId = 'cockpit'
const THEME_KEY = 'autosuivi.theme'
const MOTION_KEY = 'autosuivi.motion'

const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v)
const isMotion = (v: unknown): v is MotionPref => v === 'auto' || v === 'full' || v === 'reduced'

/** Animations réduites ? Le choix de l'utilisateur prime ; en « auto », on suit le réglage de l'appareil. */
export function resolveReducedMotion(pref: MotionPref, osPrefersReduced: boolean): boolean {
  if (pref === 'reduced') return true
  if (pref === 'full') return false
  return osPrefersReduced
}

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* stockage indisponible : le choix vaut pour la session */ }
}

// ───── petit store ─────
interface State { theme: ThemeId; motion: MotionPref; osReduced: boolean }
const listeners = new Set<() => void>()
let state: State = { theme: DEFAULT_THEME, motion: 'auto', osReduced: false }
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const get = () => state

export const useThemeState = () => useSyncExternalStore(subscribe, get)
export const useReducedMotion = () => {
  const s = useThemeState()
  return resolveReducedMotion(s.motion, s.osReduced)
}
export const getReducedMotion = () => resolveReducedMotion(state.motion, state.osReduced)

function applyAttributes() {
  const meta = THEMES.find((t) => t.id === state.theme)!
  const root = document.documentElement
  root.dataset.theme = meta.id
  root.dataset.mode = meta.mode
  root.dataset.motion = state.motion
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', meta.barColor)
}

/** À appeler une fois, avant le premier rendu (évite le flash d'un autre thème). */
export function initTheme() {
  const t = read(THEME_KEY)
  const m = read(MOTION_KEY)
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  state = { theme: isTheme(t) ? t : DEFAULT_THEME, motion: isMotion(m) ? m : 'auto', osReduced: !!mq?.matches }
  applyAttributes()
  mq?.addEventListener?.('change', (e) => set({ osReduced: e.matches }))
}

/**
 * Change de thème. Avec l'API View Transitions (si disponible et animations actives),
 * le nouveau thème se révèle en cercle depuis le point touché ; sinon fondu des couleurs.
 */
export function setTheme(id: ThemeId, origin?: { x: number; y: number }) {
  if (id === state.theme) return
  write(THEME_KEY, id)
  const commit = () => { set({ theme: id }); applyAttributes() }
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
  if (!getReducedMotion() && doc.startViewTransition && origin) {
    const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y))
    const t = doc.startViewTransition(commit)
    void t.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
        { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    }).catch(() => {})
    return
  }
  if (!getReducedMotion()) {
    document.documentElement.classList.add('theme-switching')
    setTimeout(() => document.documentElement.classList.remove('theme-switching'), 500)
  }
  commit()
}

export function setMotionPref(pref: MotionPref) {
  write(MOTION_KEY, pref)
  set({ motion: pref })
  applyAttributes()
}
