import { useState, type FormEvent } from 'react'
import { db } from '../db/db'
import { deleteVehicle } from '../db/mutations'
import { createDefaultRules } from '../db/reminders'
import { FUEL_LABELS, type Fuel, type Vehicle } from '../db/schema'
import { useVehicles } from '../vehicleContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/storage'
import { formatPlate } from '../lib/plate'
import RegistrationScan from '../components/RegistrationScan'
import type { ParsedRegistration } from '../lib/parsing/parseRegistration'
import { LOW_CONFIDENCE } from '../lib/parsing/parseInvoice'
import { downscaleToJpeg } from '../lib/extract/image'
import { formatKm } from '../lib/format'

type Draft = Omit<Vehicle, 'id' | 'createdAt' | 'uid' | 'updatedAt' | 'dirty' | 'rw' | 'photoSyncedVersion' | 'registrationSyncedVersion'>

const emptyDraft = (): Draft => ({
  name: '', brand: '', model: '', year: null, plate: '', fuel: 'essence',
  firstRegistration: null, mileage: null, photo: null, photoVersion: null,
  vin: '', registrationPhoto: null, registrationVersion: null,
})

const toNum = (s: string) => (s.trim() === '' ? null : Number(s))

export default function VehiclesScreen({ onBack, onShare }: { onBack: () => void; onShare: (vehicleId: number) => void }) {
  const { vehicles, active, setActiveId, roleOf } = useVehicles()
  const [editing, setEditing] = useState<{ id?: number; draft: Draft } | null>(null)

  if (editing)
    return <VehicleForm initial={editing} roleOf={roleOf} onClose={() => setEditing(null)} onSaved={(id) => { setActiveId(id); setEditing(null) }} />

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
                {roleOf(v.id) !== 'owner' && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Partagé · {roleOf(v.id) === 'viewer' ? 'lecture seule' : 'vous pouvez modifier'}</p>}
                <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                  {[v.brand, v.model, v.plate].filter(Boolean).join(' · ') || FUEL_LABELS[v.fuel]}
                  {v.mileage != null && ` · ${formatKm(v.mileage)}`}
                </p>
              </div>
              <div className="flex flex-col gap-1">
              <button className="btn-secondary" onClick={() => onShare(v.id!)}>Partager</button>
              {roleOf(v.id) !== 'viewer' && <button className="btn-secondary" onClick={() => {
                const { id, createdAt, uid, updatedAt, dirty, rw, photoSyncedVersion, registrationSyncedVersion, ...draft } = v
                void createdAt; void uid; void updatedAt; void dirty; void rw; void photoSyncedVersion; void registrationSyncedVersion
                setEditing({ id, draft })
              }}>Modifier</button>}
              </div>
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

function VehicleForm({ initial, roleOf, onClose, onSaved }: {
  roleOf: (id: number | null | undefined) => string
  initial: { id?: number; draft: Draft }
  onClose: () => void
  onSaved: (id: number) => void
}) {
  const [d, setD] = useState<Draft>(initial.draft)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  /** Pré-remplit la fiche depuis la carte grise, sans écraser ce qui est déjà saisi. Renvoie un résumé à afficher. */
  const applyRegistration = (r: ParsedRegistration): string => {
    const filled: string[] = []
    const doubtful: string[] = []
    const next: Draft = { ...d }
    const take = <K extends keyof Draft>(key: K, value: Draft[K] | null, label: string, conf: number, force = false) => {
      if (value == null || value === '') return
      const empty = next[key] == null || next[key] === ''
      if (empty || force) {
        next[key] = value as Draft[K]
        filled.push(label)
        if (conf < LOW_CONFIDENCE) doubtful.push(label)
      }
    }
    take('brand', r.brand.value, 'marque', r.brand.confidence)
    take('model', r.model.value, 'modèle', r.model.confidence)
    take('plate', r.plate.value, 'plaque', r.plate.confidence)
    take('year', r.year.value, 'année', r.year.confidence)
    take('firstRegistration', r.firstRegistration.value, 'date de mise en circulation', r.firstRegistration.confidence)
    take('vin', r.vin.value, 'VIN', r.vin.confidence)
    take('fuel', r.fuel.value, 'carburant', r.fuel.confidence, true)
    if (!next.name.trim() && (r.brand.value || r.model.value)) {
      next.name = [r.brand.value, r.model.value].filter(Boolean).join(' ')
      filled.push('nom')
    }
    setD(next)
    if (!filled.length) return "Aucune information reconnue : la photo est conservée, saisissez les champs à la main (ou reprenez la photo plus nette, à plat et bien éclairée)."
    return `Champs remplis : ${filled.join(', ')}. Vérifiez-les${doubtful.length ? ` (surtout : ${doubtful.join(', ')})` : ''} avant d'enregistrer.`
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!d.name.trim()) return setError('Le nom du véhicule est obligatoire.')
    setBusy(true)
    try {
      const clean = { ...d, name: d.name.trim(), plate: formatPlate(d.plate) }
      let id = initial.id
      if (id != null) await db.vehicles.update(id, clean)
      else {
        id = await db.vehicles.add({ ...clean, createdAt: Date.now() })
        await createDefaultRules(id)
      }
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
    await deleteVehicle(id)
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} aria-label="Annuler">←</button>
        <h2 className="text-xl font-bold">{initial.id != null ? 'Modifier le véhicule' : 'Nouveau véhicule'}</h2>
      </div>

      {roleOf(initial.id) === 'owner' && (
        <RegistrationScan
          photo={d.registrationPhoto}
          onPhoto={(blob) => setD((p) => ({ ...p, registrationPhoto: blob, registrationVersion: blob ? Date.now() : null }))}
          onRecognized={applyRegistration}
        />
      )}
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
          <input id="v-plate" className="field uppercase" value={d.plate} onChange={(e) => set('plate', formatPlate(e.target.value))} placeholder="AB-123-CD" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" /></div>
      </div>
      <div><label className="label" htmlFor="v-fuel">Carburant</label>
        <select id="v-fuel" className="field" value={d.fuel} onChange={(e) => set('fuel', e.target.value as Fuel)}>
          {Object.entries(FUEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></div>
      <div><label className="label" htmlFor="v-reg">Date de mise en circulation</label>
        <input id="v-reg" className="field" type="date" value={d.firstRegistration ?? ''} onChange={(e) => set('firstRegistration', e.target.value || null)} /></div>
      <div><label className="label" htmlFor="v-vin">Numéro de série (VIN)</label>
        <input id="v-vin" className="field font-mono uppercase" value={d.vin ?? ''} maxLength={17} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          onChange={(e) => set('vin', e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))} placeholder="17 caractères (champ E)" /></div>
      <div><label className="label" htmlFor="v-km">Kilométrage actuel</label>
        <input id="v-km" className="field" type="number" inputMode="numeric" min={0} value={d.mileage ?? ''} onChange={(e) => set('mileage', toNum(e.target.value))} /></div>
      <div><label className="label" htmlFor="v-photo">Photo (optionnelle)</label>
        <input id="v-photo" className="field py-2" type="file" accept="image/*" onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) { const small = await downscaleToJpeg(f); setD((p) => ({ ...p, photo: small, photoVersion: Date.now() })) }
        }} />
        {d.photo && <button type="button" className="mt-1 text-sm text-red-600 underline" onClick={() => setD((p) => ({ ...p, photo: null, photoVersion: null }))}>Retirer la photo</button>}</div>

      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}

      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      {initial.id != null && roleOf(initial.id) === 'owner' && <button type="button" className="btn-danger w-full" onClick={remove}>Supprimer ce véhicule</button>}
    </form>
  )
}
