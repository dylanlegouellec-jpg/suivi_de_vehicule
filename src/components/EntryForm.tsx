import { useState, type FormEvent } from 'react'
import { db } from '../db/db'
import { saveEntry } from '../db/saveEntry'
import type { Entry, EntryType } from '../db/schema'
import { ENTRY_TYPES, ENTRY_TYPE_LABELS } from '../lib/entryTypes'
import { findDuplicate } from '../lib/entries'
import { formatDate, formatEuro, parseDecimal, todayIso } from '../lib/format'
import { errorMessage } from '../lib/storage'
import { useVehicles } from '../vehicleContext'

export default function EntryForm({ entry, defaults, onClose, onSaved }: {
  entry?: Entry
  defaults?: { vehicleId?: number; type?: EntryType }
  onClose: () => void
  onSaved: (id: number) => void
}) {
  const { writable: vehicles, active } = useVehicles()
  const [vehicleId, setVehicleId] = useState<number | null>(entry?.vehicleId ?? defaults?.vehicleId ?? active?.id ?? null)
  const [type, setType] = useState<EntryType>(entry?.type ?? defaults?.type ?? 'vidange')
  const [date, setDate] = useState(entry?.date ?? todayIso())
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount).replace('.', ',') : '')
  const [km, setKm] = useState(entry?.km != null ? String(entry.km) : '')
  const [garage, setGarage] = useState(entry?.garage ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (ignoreDup: boolean) => {
    setError(null)
    if (vehicleId == null) return setError('Choisissez un véhicule (ajoutez-en un depuis Réglages).')
    if (!date) return setError('La date est obligatoire.')
    const amountNum = parseDecimal(amount)
    if (amount.trim() !== '' && (amountNum == null || amountNum < 0)) return setError('Montant invalide.')
    const kmNum = km.trim() === '' ? null : Number(km.replace(/\s/g, ''))
    if (kmNum != null && (!Number.isFinite(kmNum) || kmNum < 0)) return setError('Kilométrage invalide.')

    setBusy(true)
    try {
      const data: Omit<Entry, 'id'> = {
        vehicleId, type, date, amount: amountNum, km: kmNum,
        garage: garage.trim(), notes: notes.trim(), documentId: entry?.documentId ?? null,
      }
      if (!ignoreDup) {
        const same = await db.entries.where('vehicleId').equals(vehicleId).toArray()
        const dup = findDuplicate(same, data, entry?.id)
        if (dup) {
          setDupWarning(`Une entrée existe déjà le ${formatDate(dup.date)} pour ${formatEuro(dup.amount ?? 0)} (${ENTRY_TYPE_LABELS[dup.type]}).`)
          setBusy(false)
          return
        }
      }
      onSaved(await saveEntry(data, { id: entry?.id }))
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void save(false) }

  return (
    <form onSubmit={submit} className="narrow space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} aria-label="Annuler">←</button>
        <h2 className="text-xl font-bold">{entry ? "Modifier l'entrée" : 'Nouvelle entrée'}</h2>
      </div>

      <div><label className="label" htmlFor="e-vehicle">Véhicule</label>
        <select id="e-vehicle" className="field" value={vehicleId ?? ''} onChange={(e) => setVehicleId(Number(e.target.value))}>
          {!vehicles?.length && <option value="">Aucun véhicule</option>}
          {vehicles?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select></div>
      <div><label className="label" htmlFor="e-type">Type</label>
        <select id="e-type" className="field" value={type} onChange={(e) => setType(e.target.value as EntryType)}>
          {ENTRY_TYPES.map((t) => <option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>)}
        </select></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="e-date">Date</label>
          <input id="e-date" className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        <div><label className="label" htmlFor="e-amount">Montant TTC (€)</label>
          <input id="e-amount" className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
      </div>
      <div><label className="label" htmlFor="e-km">Kilométrage</label>
        <input id="e-km" className="field" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></div>
      <div><label className="label" htmlFor="e-garage">Garage / fournisseur</label>
        <input id="e-garage" className="field" value={garage} onChange={(e) => setGarage(e.target.value)} /></div>
      <div><label className="label" htmlFor="e-notes">Notes</label>
        <textarea id="e-notes" className="field py-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      {dupWarning && (
        <div role="alert" className="space-y-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
          <p>⚠️ Doublon possible : {dupWarning}</p>
          <button type="button" className="btn-secondary w-full" onClick={() => void save(true)}>Enregistrer quand même</button>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </form>
  )
}
