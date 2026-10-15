/** Plaque d'immatriculation en lecture seule (même aspect que le champ de saisie). */
export default function PlateDisplay({ plate, className = '' }: { plate: string; className?: string }) {
  if (!plate) return null
  return (
    <span className={`plate ${className}`} aria-label={`Plaque ${plate}`}>
      <span className="plate-band" aria-hidden><i>★★★</i>F</span>
      <span className="px-3 py-1 font-mono text-[15px] font-extrabold tracking-[2px] text-[#111]">{plate}</span>
    </span>
  )
}
