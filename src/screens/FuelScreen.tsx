import { lazy, Suspense, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { FuelLog } from '../db/schema'
import EmptyState from '../components/EmptyState'
import AnimatedNumber from '../ui/AnimatedNumber'
import { formatDate, formatEuro, formatKm } from '../lib/format'
import { computeConsumption, pricePerLiter } from '../lib/stats/fuel'
import { useVehicles } from '../vehicleContext'
import FuelForm from './FuelForm'

const ConsumptionChart = lazy(() => import('../components/charts/ConsumptionChart'))

export default function FuelScreen({ onBack, startNew }: { onBack: () => void; startNew?: boolean }) {
  const { vehicles, active, canEdit } = useVehicles()
  const [editing, setEditing] = useState<FuelLog | 'new' | null>(startNew ? 'new' : null)
  const logs = useLiveQuery(
    () => (active?.id != null ? db.fuelLogs.where('vehicleId').equals(active.id).toArray() : []),
    [active?.id],
  )
  const result = useMemo(() => (logs ? computeConsumption(logs) : null), [logs])
  const sorted = useMemo(() => (logs ? [...logs].sort((a, b) => b.date.localeCompare(a.date) || (b.km ?? 0) - (a.km ?? 0)) : []), [logs])

  if (editing)
    return <FuelForm log={editing === 'new' ? undefined : editing} onClose={() => (startNew ? onBack() : setEditing(null))} onSaved={() => (startNew ? onBack() : setEditing(null))} />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn-secondary" onClick={onBack} aria-label="Retour">←</button>
        <h2 className="text-xl font-bold">Carburant</h2>
        <button className="btn-primary ml-auto" onClick={() => setEditing('new')} disabled={!vehicles?.length || !canEdit(active?.id)}>Plein</button>
      </div>
      {!active ? (
        <EmptyState icon="🚗" title="Aucun véhicule" text="Ajoutez un véhicule pour suivre ses pleins." />
      ) : !logs || !result ? (
        <p role="status">Chargement…</p>
      ) : logs.length === 0 ? (
        <EmptyState icon="⛽" title="Aucun plein" text={`Aucun plein enregistré pour ${active.name}.`} />
      ) : (
        <>
          <section className="card text-center">
            <p className="text-sm text-muted">Consommation moyenne · {active.name}</p>
            <p className="text-3xl font-bold">{result.average != null ? <><AnimatedNumber value={result.average} format={(n) => n.toFixed(1).replace('.', ',')} /> L/100 km</> : '—'}</p>
            {result.average == null && (
              <p className="mt-1 text-sm text-muted">
                Il faut au moins deux pleins complets avec kilométrage croissant.
              </p>
            )}
          </section>
          {result.warnings.length > 0 && (
            <details className="card text-sm">
              <summary className="min-h-[44px] cursor-pointer py-2 font-medium">⚠️ {result.warnings.length} point(s) incohérent(s) ignoré(s)</summary>
              <ul className="list-disc space-y-1 pl-5">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
          <div className="space-y-3 desktop:grid desktop:grid-cols-2 desktop:items-start desktop:gap-4 desktop:space-y-0">
          {result.segments.filter((s) => s.valid).length >= 2 && (
            <Suspense fallback={<p role="status">Chargement du graphique…</p>}>
              <ConsumptionChart segments={result.segments.filter((s) => s.valid)} />
            </Suspense>
          )}
          <ul className="space-y-2">
            {sorted.map((l) => (
              <li key={l.id}>
                <button className="card flex w-full items-center gap-3 text-left active:opacity-80" onClick={() => canEdit(active?.id) && setEditing(l)}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{formatDate(l.date)} · {l.liters.toLocaleString('fr-FR')} L {!l.full && <span className="text-xs font-normal text-muted">(partiel)</span>}</p>
                    <p className="truncate text-sm text-muted">
                      {pricePerLiter(l).toFixed(3).replace('.', ',')} €/L{l.km != null && ` · ${formatKm(l.km)}`}
                    </p>
                  </div>
                  <span className="font-semibold">{formatEuro(l.total)}</span>
                </button>
              </li>
            ))}
          </ul>
          </div>
        </>
      )}
    </div>
  )
}
