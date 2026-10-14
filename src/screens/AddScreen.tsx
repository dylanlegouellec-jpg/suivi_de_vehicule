export default function AddScreen({ onManual }: { onManual: () => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">Ajouter</h2>
      <button className="card flex w-full items-center gap-3 text-left" onClick={onManual}>
        <span aria-hidden className="text-3xl">✍️</span>
        <span><span className="block font-semibold">Saisie manuelle</span>
          <span className="text-sm text-slate-600 dark:text-slate-400">Entretien, réparation, assurance…</span></span>
      </button>
      <div className="card flex items-center gap-3 opacity-60" aria-disabled>
        <span aria-hidden className="text-3xl">📷</span>
        <span><span className="block font-semibold">Facture (photo ou fichier)</span>
          <span className="text-sm">Bientôt disponible (phase 3)</span></span>
      </div>
      <div className="card flex items-center gap-3 opacity-60" aria-disabled>
        <span aria-hidden className="text-3xl">⛽</span>
        <span><span className="block font-semibold">Plein de carburant</span>
          <span className="text-sm">Bientôt disponible (phase 5)</span></span>
      </div>
    </div>
  )
}
