import { animate, useMotionValue, useMotionValueEvent } from 'framer-motion'
import { useEffect, useState } from 'react'
import { easeOut } from './motion'
import { useReducedMotion } from './theme'

const defaultFormat = (n: number) => Math.round(n).toLocaleString('fr-FR')

/** Nombre qui « défile » jusqu'à sa valeur (et d'une valeur à l'autre quand elle change). */
export default function AnimatedNumber({ value, format = defaultFormat, duration = 1.1, className }: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const mv = useMotionValue(reduced ? value : 0)
  const [text, setText] = useState(() => format(reduced ? value : 0))

  useMotionValueEvent(mv, 'change', (v) => setText(format(v)))
  useEffect(() => {
    if (reduced) { mv.set(value); setText(format(value)); return }
    const controls = animate(mv, value, { duration, ease: easeOut })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced])

  return <span className={className} aria-label={format(value)}>{text}</span>
}
