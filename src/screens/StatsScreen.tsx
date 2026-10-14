import { lazy, Suspense, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import EmptyState from '../components/EmptyState'
import { CATEGORY_LABELS } from '../lib/entryTypes'
import { formatEuro, formatNumber, todayIso } from '../lib/format'
import { computeConsumption } from '../lib/stats/fuel'
import {
  buildCostItems, costByCategory, costByMonth, costByYear, costPerKm, distanceKm, inPeriod,
  presetPeriod, totalCost, type PeriodPreset,
} from '../lib/stats/stats'
import { useVehicles } from '../vehicleContext'

const MonthlyChart = lazy(() => import('../components/charts/MonthlyChart'))
const ConsumptionChart = lazy(() => import('../components/charts/ConsumptionChart'))

export default function StatsScreen({ onOpenFuel }: { onOpenFuel: () => void }) {
  const { vehicles, active } = useVehicles()
  const [vehicleId, setVehicleId] = useState<number | 'all' | null>(null) // null = véhicule actif
  const [preset, setPreset] = useState<PeriodPreset>('12m')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const data = useLiveQuery(async () => ({ entries: await db.entries.toArray(), fuel: await db.fuelLogs.toArray() }), [])

  const selected = vehicleId ?? active?.id ?? 'all'
  const period = presetPeriod(preset, todayIso(), custom)

  const view = useMemo(() => {
    if (!data) return null
    const byV = <T extends { vehicleId: number }>(xs: T[]) => (selected === 'all' ? xs : xs.filter((x) => x.vehicleId === selected))
    const entries = byV(data.entries), fuel = byV(data.fuel)
    const items = buildCostItems(entries, fuel).filter((i) => inPeriod(i.date, period))
    const total = totalCost(items)
    const distance = distanceKm([...entries, ...fuel], period)
    const months = costByMonth(items)
    const consumption = selected === 'all' ? null : computeConsumption(fuel.filter((f) => inPeriod(f.date, period)))
    return { items, total, distance, perKm: costPerKm(total, distance), months, years: costByYear(items), cats: costByCategory(items), consumption }
  }, [data, selected, period.from, period.to]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!vehicles) return <p role="status">Chargement…</p>
  if (vehicles.length === 0)
    return <EmptyState icon="📊" title="Pas encore de statistiques" text="Ajoutez un véhicule puis vos premières dépenses." />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold">Statistiques</h2>
        <button className="btn-secondary ml-auto" onClick={onOpenFuel}>⛽ Carburant</button>
      </div>

      <section className="card grid grid-cols-2 gap-3" aria-label="Filtres">
        <div><label className="label" htmlFor="s-vehicle">Véhicule</label>
          <select id="s-vehicle" className="field" value={selected} onChange={(e) => setVehicleId(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">Tous</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="s-period">Période</label>
          <select id="s-period" className="field" value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)}>
            <option value="12m">12 mois glissants</option>
            <option value="year">Cette année</option>
            <option value="lastyear">Année passée</option>
            <option value="all">Tout</option>
            <option value="custom">Personnalisée</option>
          </select></div>
        {preset === 'custom' && (
          <>
            <div><label className="label" htmlFor="s-from">Du</label>
              <input id="s-from" type="date" className="field" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></div>
            <div><label className="label" htmlFor="s-to">Au</label>
              <input id="s-to" type="date" className="field" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
          </>
        )}
      </section>

      {!view ? (
        <p role="status">Chargement…</p>
      ) : view.items.length === 0 ? (
        <EmptyState icon="📊" title="Aucune dépense sur cette période" text="Modifiez le filtre ou ajoutez des factures et des pleins." />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3" aria-label="Indicateurs">
            <div className="card"><p className="text-sm text-slate-600 dark:text-slate-400">Coût total</p><p className="text-2xl font-bold">{formatEuro(view.total)}</p></div>
            <div className="card"><p className="text-sm text-slate-600 dark:text-slate-400">Coût au km</p>
              <p className="text-2xl font-bold">{view.perKm != null ? formatEuro(view.perKm) : '—'}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{view.distance > 0 ? `sur ${formatNumber(view.distance)} km` : 'kilométrage insuffisant'}</p></div>
          </section>

          <Suspense fallback={<p role="status">Chargement du graphique…</p>}>
            <MonthlyChart data={view.months} />
          </Suspense>

          <section className="card" aria-label="Coût par an">
            <h3 className="mb-2 font-semibold">Coût par année</h3>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {view.years.map((y) => <li key={y.year} className="flex justify-between py-2"><span>{y.year}</span><strong>{formatEuro(y.total)}</strong></li>)}
            </ul>
          </section>

          <section className="card viz-root" aria-label="Répartition par catégorie">
            <h3 className="mb-3 font-semibold">Répartition par catégorie</h3>
            <ul className="space-y-3">
              {view.cats.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{CATEGORY_LABELS[c.category]}</span>
                    <span><strong>{formatEuro(c.total)}</strong> <span className="text-slate-600 dark:text-slate-400">· {Math.round(c.share * 100)} %</span></span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
                    <div className="h-3 rounded-full" style={{ width: `${Math.max(2, c.share * 100)}%`, background: `var(--cat-${c.category})` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {selected === 'all' ? (
            <p className="card text-sm text-slate-600 dark:text-slate-400">Choisissez un véhicule pour voir l'évolution de sa consommation.</p>
          ) : view.consumption && view.consumption.segments.filter((s) => s.valid).length >= 2 ? (
            <Suspense fallback={<p role="status">Chargement du graphique…</p>}>
              <ConsumptionChart segments={view.consumption.segments.filter((s) => s.valid)} />
            </Suspense>
          ) : (
            <p className="card text-sm text-slate-600 dark:text-slate-400">
              Consommation : il faut au moins trois pleins complets avec kilométrage sur la période pour tracer une évolution.
            </p>
          )}
        </>
      )}
    </div>
  )
}
