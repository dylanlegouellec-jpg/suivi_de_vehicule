import { useState, type FormEvent } from 'react'
import { db } from '../db/db'
import { FUEL_LABELS, type Fuel, type Vehicle } from '../db/schema'
import { useVehicles } from '../vehicleContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/storage'
import { formatKm } from '../lib/format'

type Draft = Omit<Vehicle, 'id' | 'createdAt'>

const emptyDraft = (): Draft => ({
  name: '', brand: '', model: '', year: null, plate: '', fuel: 'essence',
  firstRegistration: null, mileage: null, photo: null,
})

const toNum = (s: string) => (s.trim() === '' ? null : Number(s))

export default function VehiclesScreen({ onBack }: { onBack: () => void }) {
  const { vehicles, active, setActiveId } = useVehicles()
  const [editing, setEditing] = useState<{ id?: number; draft: Draft } | null>(null)

  if (editing)
    return <VehicleForm initial={editing} onClose={() => setEditing(null)} onSaved={(id) => { setActiveId(id); setEditing(null) }} />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn-secondary" onClick={onBack} aria-label="Retour">←</button>
        <h2 className="text-xl font-bold">Mes véhicules</h2>
        <button className="btn-primary ml-auto" onClick={() => setEditing({ draft: emptyDraft() })}>Ajouter</button>
      </div>
      {!vehicles ? (
        <p role="status">Chargement…</p>
      ) : vehicles.length === 0 ? (
        <EmptyState icon="🚗" title="Aucun véhicule" text="Ajoutez votre première voiture, moto ou utilitaire." />
      ) : (
        <ul className="space-y-2">
          {vehicles.map((v) => (
            <li key={v.id} className="card flex items-center gap-3">
              {v.photo ? <PhotoThumb blob={v.photo} /> : <div aria-hidden className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl dark:bg-slate-800">🚗</div>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{v.name} {v.id === active?.id && <span className="text-xs text-brand">(actif)</span>}</p>
                <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                  {[v.brand, v.model, v.plate].filter(Boolean).join(' · ') || FUEL_LABELS[v.fuel]}
                  {v.mileage != null && ` · ${formatKm(v.mileage)}`}
                </p>
              </div>
              <button className="btn-secondary" onClick={() => {
                const { id, createdAt, ...draft } = v
                void createdAt
                setEditing({ id, draft })
              }}>Modifier</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PhotoThumb({ blob }: { blob: Blob }) {
  const [url] = useState(() => URL.createObjectURL(blob))
  return <img src={url} alt="" className="h-14 w-14 rounded-xl object-cover" />
}

function VehicleForm({ initial, onClose, onSaved }: {
  initial: { id?: number; draft: Draft }
  onClose: () => void
  onSaved: (id: number) => void
}) {
  const [d, setD] = useState<Draft>(initial.draft)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!d.name.trim()) return setError('Le nom du véhicule est obligatoire.')
    setBusy(true)
    try {
      const clean = { ...d, name: d.name.trim(), plate: d.plate.trim().toUpperCase() }
      let id = initial.id
      if (id != null) await db.vehicles.update(id, clean)
      else id = await db.vehicles.add({ ...clean, createdAt: Date.now() })
      onSaved(id)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (initial.id == null) return
    if (!window.confirm('Supprimer ce véhicule et toutes ses données (entrées, pleins, rappels) ?')) return
    const id = initial.id
    await db.transaction('rw', [db.vehicles, db.entries, db.fuelLogs, db.reminderRules, db.documents], async () => {
      const docIds = (await db.entries.where('vehicleId').equals(id).toArray())
        .map((e) => e.documentId).filter((x): x is number => x != null)
      await db.documents.bulkDelete(docIds)
      await db.entries.where('vehicleId').equals(id).delete()
      await db.fuelLogs.where('vehicleId').equals(id).delete()
      await db.reminderRules.where('vehicleId').equals(id).delete()
      await db.vehicles.delete(id)
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} aria-label="Annuler">←</button>
        <h2 className="text-xl font-bold">{initial.id != null ? 'Modifier le véhicule' : 'Nouveau véhicule'}</h2>
      </div>

      <div><label className="label" htmlFor="v-name">Nom *</label>
        <input id="v-name" className="field" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Ma Clio" required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="v-brand">Marque</label>
          <input id="v-brand" className="field" value={d.brand} onChange={(e) => set('brand', e.target.value)} /></div>
        <div><label className="label" htmlFor="v-model">Modèle</label>
          <input id="v-model" className="field" value={d.model} onChange={(e) => set('model', e.target.value)} /></div>
        <div><label className="label" htmlFor="v-year">Année</label>
          <input id="v-year" className="field" type="number" inputMode="numeric" min={1900} max={2100} value={d.year ?? ''} onChange={(e) => set('year', toNum(e.target.value))} /></div>
        <div><label className="label" htmlFor="v-plate">Plaque</label>
          <input id="v-plate" className="field uppercase" value={d.plate} onChange={(e) => set('plate', e.target.value)} placeholder="AB-123-CD" autoCapitalize="characters" /></div>
      </div>
      <div><label className="label" htmlFor="v-fuel">Carburant</label>
        <select id="v-fuel" className="field" value={d.fuel} onChange={(e) => set('fuel', e.target.value as Fuel)}>
          {Object.entries(FUEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></div>
      <div><label className="label" htmlFor="v-reg">Date de mise en circulation</label>
        <input id="v-reg" className="field" type="date" value={d.firstRegistration ?? ''} onChange={(e) => set('firstRegistration', e.target.value || null)} /></div>
      <div><label className="label" htmlFor="v-km">Kilométrage actuel</label>
        <input id="v-km" className="field" type="number" inputMode="numeric" min={0} value={d.mileage ?? ''} onChange={(e) => set('mileage', toNum(e.target.value))} /></div>
      <div><label className="label" htmlFor="v-photo">Photo (optionnelle)</label>
        <input id="v-photo" className="field py-2" type="file" accept="image/*" onChange={(e) => set('photo', e.target.files?.[0] ?? d.photo)} />
        {d.photo && <button type="button" className="mt-1 text-sm text-red-600 underline" onClick={() => set('photo', null)}>Retirer la photo</button>}</div>

      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}

      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      {initial.id != null && <button type="button" className="btn-danger w-full" onClick={remove}>Supprimer ce véhicule</button>}
    </form>
  )
}
