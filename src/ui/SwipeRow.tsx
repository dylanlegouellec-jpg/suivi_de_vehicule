import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { spring } from './motion'

const OPEN = 104

/**
 * Ligne qu'on balaie vers la gauche pour révéler « Supprimer ». Un tap referme la ligne ouverte ;
 * un balayage ne déclenche jamais l'ouverture de la fiche. `disabled` : lecture seule.
 */
export default function SwipeRow({ children, onDelete, disabled = false }: { children: ReactNode; onDelete: () => void; disabled?: boolean }) {
  const x = useMotionValue(0)
  const actionOpacity = useTransform(x, [-OPEN, -24, 0], [1, 0.6, 0])
  const actionScale = useTransform(x, [-OPEN, -30, 0], [1, 0.8, 0.6])
  const dragged = useRef(false)

  if (disabled) return <>{children}</>

  return (
    <div className="relative overflow-hidden rounded-card">
      <motion.button
        style={{ opacity: actionOpacity, scale: actionScale }}
        className="absolute inset-y-0 right-0 flex w-[104px] flex-col items-center justify-center gap-1 rounded-card bg-danger text-sm font-semibold text-white"
        onClick={() => { animate(x, 0, spring); onDelete() }}
        aria-label="Supprimer"
      >
        <span aria-hidden className="text-xl">🗑️</span>Supprimer
      </motion.button>
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -OPEN, right: 0 }}
        dragElastic={{ left: 0.15, right: 0.02 }}
        dragMomentum={false}
        onDragStart={() => { dragged.current = true }}
        onDragEnd={(_, info) => {
          animate(x, x.get() < -OPEN / 2 || info.velocity.x < -400 ? -OPEN : 0, spring)
          setTimeout(() => { dragged.current = false }, 60)
        }}
        onClickCapture={(e) => {
          if (dragged.current) { e.stopPropagation(); e.preventDefault(); return }
          if (x.get() < -4) { e.stopPropagation(); e.preventDefault(); animate(x, 0, spring) }
        }}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  )
}
