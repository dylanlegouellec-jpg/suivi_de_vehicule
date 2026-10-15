import { MotionConfig, type Transition, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'
import { useReducedMotion } from './theme'

/** Ressorts partagés : tout bouge avec la même « physique », d'où la cohérence de l'ensemble. */
export const spring: Transition = { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 }
export const springSoft: Transition = { type: 'spring', stiffness: 210, damping: 26 }
export const springBouncy: Transition = { type: 'spring', stiffness: 520, damping: 17 }
export const easeOut = [0.22, 1, 0.36, 1] as const

/** Applique « réduire les animations » à toutes les animations de l'app (transformations et mises en page désactivées, fondus conservés). */
export function MotionRoot({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={spring}>
      {children}
    </MotionConfig>
  )
}

/** Liste dont les éléments arrivent en cascade. */
export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
}
export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.975 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.94, transition: { duration: 0.18 } },
}
