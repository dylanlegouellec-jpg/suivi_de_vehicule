import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { easeOut } from './motion'

/** Jauge circulaire : l'anneau se remplit jusqu'à `progress` (0 à 1). `pulse` fait « respirer » un élément urgent. */
export default function Ring({ progress, size = 88, stroke = 8, color = 'rgb(var(--accent))', pulse = false, dashed = false, delay = 0, children }: {
  progress: number
  size?: number
  stroke?: number
  color?: string
  pulse?: boolean
  dashed?: boolean
  delay?: number
  children?: ReactNode
}) {
  const p = Math.max(0, Math.min(1, progress))
  const r = (size - stroke) / 2
  return (
    <div className={`relative shrink-0 ${pulse ? 'breathe' : ''}`} style={{ width: size, height: size, color }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line) / 0.9)" strokeWidth={stroke} strokeDasharray={dashed ? '3 7' : undefined} strokeLinecap="round" />
        {!dashed && (
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(p, 0.015) }}
            transition={{ duration: 1.2, ease: easeOut, delay }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-fg">{children}</div>
    </div>
  )
}
