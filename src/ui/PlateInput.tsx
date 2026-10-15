import { motion, useAnimationControls } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { formatPlate } from '../lib/plate'

/** Champ plaque d'immatriculation : bandeau bleu européen, tirets automatiques, lettres/chiffres contrôlés. */
export default function PlateInput({ id, value, onChange, className = '' }: { id?: string; value: string; onChange: (v: string) => void; className?: string }) {
  const controls = useAnimationControls()
  const prev = useRef(value)
  useEffect(() => {
    if (value.length > prev.current.length) void controls.start({ scale: [1, 1.035, 1], transition: { duration: 0.22 } })
    prev.current = value
  }, [value, controls])

  return (
    <motion.div animate={controls} className={`plate w-full max-w-[320px] ${className}`}>
      <span className="plate-band" aria-hidden><i>★★★</i>F</span>
      <input
        id={id} className="plate-input" value={value} placeholder="AB-123-CD" inputMode="text"
        autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" aria-label="Plaque d'immatriculation"
        onChange={(e) => onChange(formatPlate(e.target.value))}
      />
      <span className="plate-band" aria-hidden />
    </motion.div>
  )
}
