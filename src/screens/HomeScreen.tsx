import EmptyState from '../components/EmptyState'
import { useVehicles } from '../vehicleContext'
import { FUEL_LABELS } from '../db/schema'
import { formatKm } from '../lib/format'

export default function HomeScreen({ onManageVehicles }: { onManageVehicles: () => void }) {
  const { vehicles, active } = useVehicles()
  if (!vehicles) return <p role="status">Chargement…</p>
  if (!active)
    return (
      <EmptyState icon="🚗" title="Bienvenue sur AutoSuivi" text="Commencez par ajouter votre premier véhicule.">
        <button className="btn-primary mt-2" onClick={onManageVehicles}>Ajouter un véhicule</button>
      </EmptyState>
    )
  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="text-lg font-semibold">{active.name}</h2>
        <p className="text-slate-600 dark:text-slate-400">
          {[active.brand, active.model, active.plate].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 text-sm">
          {FUEL_LABELS[active.fuel]}{active.mileage != null && ` · ${formatKm(active.mileage)}`}
        </p>
      </section>
      <section className="card">
        <h2 className="font-semibold">À faire</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Les rappels arrivent en phase 4.</p>
      </section>
    </div>
  )
}
