import { motion } from 'framer-motion'
import { spring } from './motion'

/** Chiffres d'un compteur kilométrique : `padTo` chiffres, zéros de tête compris. Fonction pure (testée). */
export function odometerDigits(value: number, padTo = 6): { digit: number; lead: boolean }[] {
  const v = Math.max(0, Math.min(Math.floor(value), 10 ** padTo - 1))
  const s = String(v).padStart(padTo, '0')
  const firstReal = padTo - String(v).length
  return [...s].map((c, i) => ({ digit: Number(c), lead: i < firstReal }))
}

/**
 * Compteur à rouleaux : chaque chiffre est une colonne 0-9 qui défile vers le bon chiffre,
 * de gauche à droite en cascade. Les zéros de tête sont estompés.
 */
export default function Odometer({ value, padTo = 6, className = '' }: { value: number; padTo?: number; className?: string }) {
  const digits = odometerDigits(value, padTo)
  return (
    <div className={`odo ${className}`} role="img" aria-label={`${value.toLocaleString('fr-FR')} kilomètres`}>
      {digits.map((d, i) => (
        <span key={i} className={`odo-cell ${d.lead ? 'odo-lead' : ''} ${(padTo - i) % 3 === 0 && i > 0 ? 'odo-gap' : ''}`} aria-hidden>
          <motion.span
            className="odo-strip"
            initial={{ y: '0%' }}
            animate={{ y: `${-d.digit * 10}%` }}
            transition={{ ...spring, stiffness: 120, damping: 20, delay: i * 0.09 }}
          >
            {Array.from({ length: 10 }, (_, n) => <span key={n} className="odo-num">{n}</span>)}
          </motion.span>
        </span>
      ))}
    </div>
  )
}
