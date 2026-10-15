import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { spring } from './motion'

const TRIGGER = 72
const MAX = 120

/**
 * Tirer vers le bas depuis le haut de la page pour synchroniser (écrans tactiles).
 * L'indicateur grossit et tourne selon la traction ; un ressort ramène le contenu.
 */
export default function PullToRefresh({ scrollRef, enabled, onRefresh, children }: {
  scrollRef: RefObject<HTMLElement | null>
  enabled: boolean
  onRefresh: () => Promise<unknown>
  children: ReactNode
}) {
  const y = useMotionValue(0)
  const rotate = useTransform(y, [0, MAX], [0, 300])
  const scale = useTransform(y, [0, 30, TRIGGER], [0.4, 0.8, 1])
  const opacity = useTransform(y, [0, 24], [0, 1])
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !enabled) return
    let startY = 0
    let pulling = false

    const start = (e: TouchEvent) => { startY = e.touches[0].clientY; pulling = false }
    const move = (e: TouchEvent) => {
      if (busy.current) return
      const dy = e.touches[0].clientY - startY
      if (dy > 0 && el.scrollTop <= 0) {
        pulling = true
        if (e.cancelable) e.preventDefault()
        y.set(Math.min(dy * 0.5, MAX))
      } else if (pulling) { y.set(0); pulling = false }
    }
    const end = async () => {
      if (!pulling || busy.current) return
      pulling = false
      if (y.get() >= TRIGGER) {
        busy.current = true
        setRefreshing(true)
        animate(y, 58, spring)
        try { await onRefresh() } finally {
          setRefreshing(false)
          await animate(y, 0, spring)
          busy.current = false
        }
      } else animate(y, 0, spring)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end)
    }
  }, [scrollRef, enabled, onRefresh, y])

  return (
    <div className="relative">
      <motion.div aria-hidden style={{ opacity, scale }} className="pointer-events-none absolute left-1/2 top-0 z-10 -mt-1 -translate-x-1/2">
        <motion.div style={{ rotate: refreshing ? undefined : rotate }} className={`flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg text-accent shadow-lg ring-1 ring-line ${refreshing ? 'animate-spin' : ''}`}>
          ↻
        </motion.div>
      </motion.div>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  )
}
