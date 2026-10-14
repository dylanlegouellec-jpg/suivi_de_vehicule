import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { EntryType } from '../db/schema'
import EmptyState from '../components/EmptyState'
import { ENTRY_TYPES, ENTRY_TYPE_LABELS } from '../lib/entryTypes'
import { emptyFilters, filterEntries, sortEntries, type SortKey } from '../lib/entries'
import { formatDate, formatEuro, formatKm } from '../lib/format'
import { useVehicles } from '../vehicleContext'

export default function HistoryScreen({ onOpen, onAdd }: { onOpen: (id: number) => void; onAdd: () => void }) {
  const { vehicles, active } = useVehicles()
  const [vehicleId, setVehicleId] = useState<number | 'all' | null>(null) // null = véhicule actif
  const [filters, setFilters] = useState(emptyFilters())
  const [sort, setSort] = useState<SortKey>('date_desc')
  const [showFilters, setShowFilters] = useState(false)

  const effectiveVehicle = vehicleId ?? active?.id ?? 'all'
  const all = useLiveQuery(() => db.entries.toArray(), [])

  const rows = useMemo(() => {
    if (!all) return undefined
    const byVehicle = effectiveVehicle === 'all' ? all : all.filter((e) => e.vehicleId === effectiveVehicle)
    return sortEntries(filterEntries(byVehicle, filters), sort)
  }, [all, effectiveVehicle, filters, sort])

  const total = rows?.reduce((s, e) => s + (e.amount ?? 0), 0) ?? 0
  const vehicleName = (id: number) => vehicles?.find((v) => v.id === id)?.name ?? '—'
  const hasFilter = filters.type || filters.from || filters.to || filters.text

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="h-search" className="sr-only">Rechercher</label>
          <input id="h-search" type="search" className="field" placeholder="Rechercher (garage, notes…)"
            value={filters.text} onChange={(e) => setFilters({ ...filters, text: e.target.value })} />
        </div>
        <button className="btn-secondary" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
          Filtres{hasFilter ? ' •' : ''}
        </button>
      </div>

      {showFilters && (
        <section className="card space-y-3" aria-label="Filtres">
          <div><label className="label" htmlFor="h-vehicle">Véhicule</label>
            <select id="h-vehicle" className="field" value={effectiveVehicle}
              onChange={(e) => setVehicleId(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">Tous les véhicules</option>
              {vehicles?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select></div>
          <div><label className="label" htmlFor="h-type">Type</label>
            <select id="h-type" className="field" value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value as EntryType | '' })}>
              <option value="">Tous les types</option>
              {ENTRY_TYPES.map((t) => <option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="h-from">Du</label>
              <input id="h-from" type="date" className="field" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
            <div><label className="label" htmlFor="h-to">Au</label>
              <input id="h-to" type="date" className="field" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
          </div>
          <div><label className="label" htmlFor="h-sort">Tri</label>
            <select id="h-sort" className="field" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="date_desc">Date : récentes d'abord</option>
              <option value="date_asc">Date : anciennes d'abord</option>
              <option value="amount_desc">Montant : décroissant</option>
              <option value="amount_asc">Montant : croissant</option>
            </select></div>
          {hasFilter && <button className="btn-secondary w-full" onClick={() => setFilters(emptyFilters())}>Réinitialiser</button>}
        </section>
      )}

      {!rows ? (
        <p role="status">Chargement…</p>
      ) : rows.length === 0 ? (
        all?.length === 0 ? (
          <EmptyState icon="🧾" title="Aucune entrée" text="Ajoutez votre première facture ou intervention.">
            <button className="btn-primary mt-2" onClick={onAdd}>Ajouter une entrée</button>
          </EmptyState>
        ) : (
          <EmptyState icon="🔍" title="Aucun résultat" text="Aucune entrée ne correspond à ces critères." />
        )
      ) : (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {rows.length} entrée{rows.length > 1 ? 's' : ''} · total {formatEuro(total)}
          </p>
          <ul className="space-y-2">
            {rows.map((e) => (
              <li key={e.id}>
                <button className="card flex w-full items-center gap-3 text-left active:opacity-80" onClick={() => onOpen(e.id!)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {ENTRY_TYPE_LABELS[e.type]}{e.documentId != null && <span aria-label="pièce jointe"> 📎</span>}
                    </p>
                    <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                      {formatDate(e.date)}{e.garage && ` · ${e.garage}`}{e.km != null && ` · ${formatKm(e.km)}`}
                      {effectiveVehicle === 'all' && ` · ${vehicleName(e.vehicleId)}`}
                    </p>
                  </div>
                  <span className="font-semibold">{e.amount != null ? formatEuro(e.amount) : '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
