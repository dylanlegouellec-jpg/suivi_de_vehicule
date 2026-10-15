import { motion } from 'framer-motion'
import { useRef } from 'react'
import { itemVariants, listVariants } from '../ui/motion'
import { useVehicles } from '../vehicleContext'

export default function AddScreen({ onManual, onFiles, onFuel }: { onManual: () => void; onFiles: (files: File[]) => void; onFuel: () => void }) {
  const { active, canEdit } = useVehicles()
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const multiRef = useRef<HTMLInputElement>(null)

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // permet de re-sélectionner le même fichier
    if (files.length) onFiles(files)
  }

  const Option = ({ icon, title, text, onClick }: { icon: string; title: string; text: string; onClick: () => void }) => (
    <motion.button variants={itemVariants} whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} className="card flex w-full items-center gap-3 text-left" onClick={onClick}>
      <span aria-hidden className="text-3xl">{icon}</span>
      <span><span className="block font-semibold">{title}</span>
        <span className="text-sm text-muted">{text}</span></span>
    </motion.button>
  )

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className="narrow space-y-3">
      <h2 className="text-xl font-bold">Ajouter</h2>
      {active && !canEdit(active.id) && (
        <p role="status" className="rounded-xl bg-warn/15 p-3 text-sm text-fg">
          « {active.name} » est partagé en lecture seule. Choisissez un autre véhicule dans l'en-tête pour y ajouter des données.
        </p>
      )}
      <Option icon="📷" title="Prendre une photo" text="Photographier une facture avec l'appareil photo" onClick={() => cameraRef.current?.click()} />
      <Option icon="📄" title="Choisir un fichier" text="PDF ou image depuis l'iPhone" onClick={() => fileRef.current?.click()} />
      <Option icon="🗂️" title="Import multiple" text="Plusieurs factures d'un coup, vérifiées une par une" onClick={() => multiRef.current?.click()} />
      <Option icon="✍️" title="Saisie manuelle" text="Sans document : entretien, réparation, assurance…" onClick={onManual} />
      <Option icon="⛽" title="Plein de carburant" text="Litres, prix, kilométrage : saisie rapide" onClick={onFuel} />
      <p className="text-xs text-muted">
        L'analyse se fait entièrement sur votre appareil. La première reconnaissance de texte (OCR) télécharge les
        ressources de l'application (~4 Mo), puis elle fonctionne hors ligne.
      </p>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handle} />
      <input ref={multiRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handle} />
    </motion.div>
  )
}
