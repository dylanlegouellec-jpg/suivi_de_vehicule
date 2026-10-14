import EmptyState from '../components/EmptyState'
import { useVehicles } from '../vehicleContext'
import { FUEL_LABELS } from '../db/schema'
import { formatKm } from '../lib/format'
import ReminderCard from '../components/ReminderCard'
import { groupReminders } from '../lib/reminders/compute'
import { useReminders } from '../lib/reminders/useReminders'

export default function HomeScreen({ onManageVehicles, onOpenReminders }: { onManageVehicles: () => void; onOpenReminders: () => void }) {
  const { vehicles, active } = useVehicles()
  const reminders = useReminders()
  const groups = reminders ? groupReminders(reminders) : null
  const urgent = groups ? [...groups.overdue, ...groups.soon] : []
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
      <section aria-label="À faire" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">À faire {urgent.length > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{urgent.length}</span>}</h2>
          <button className="min-h-[44px] px-2 text-sm font-medium text-brand" onClick={onOpenReminders}>Tout voir / gérer</button>
        </div>
        {!reminders ? (
          <p role="status" className="text-sm">Chargement…</p>
        ) : reminders.length === 0 ? (
          <button className="card w-full text-left text-sm" onClick={onOpenReminders}>🔔 Aucun rappel configuré. Touchez pour ajouter les rappels par défaut.</button>
        ) : urgent.length === 0 ? (
          <p className="card text-sm">✅ Rien d'urgent pour le moment.{groups!.unknown.length > 0 && ` ${groups!.unknown.length} rappel(s) à renseigner.`}</p>
        ) : (
          urgent.slice(0, 5).map((it) => (
            <ReminderCard key={it.rule.id} item={it} showVehicle={(vehicles?.length ?? 0) > 1} onClick={onOpenReminders} />
          ))
        )}
      </section>
    </div>
  )
}
