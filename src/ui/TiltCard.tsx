import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import type { ReactNode } from 'react'

/** Carte qui s'incline en 3D vers la souris (ordinateur) ; sans effet au toucher. */
export default function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rx = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 200, damping: 20 })
  const ry = useSpring(useTransform(px, [0, 1], [-9, 9]), { stiffness: 200, damping: 20 })
  return (
    <motion.div
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        px.set((e.clientX - r.left) / r.width)
        py.set((e.clientY - r.top) / r.height)
      }}
      onPointerLeave={() => { px.set(0.5); py.set(0.5) }}
    >
      {children}
    </motion.div>
  )
}
