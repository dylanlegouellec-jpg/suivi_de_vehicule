import { useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { saveFuelLog } from '../db/saveEntry'
import type { FuelLog } from '../db/schema'
import { formatEuro, formatKm, parseDecimal, todayIso } from '../lib/format'
import { errorMessage } from '../lib/storage'
import { useVehicles } from '../vehicleContext'

const str = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n * 1000) / 1000).replace('.', ','))

export default function FuelForm({ log, onClose, onSaved }: { log?: FuelLog; onClose: () => void; onSaved: () => void }) {
  const { vehicles, active } = useVehicles()
  const [vehicleId, setVehicleId] = useState<number | null>(log?.vehicleId ?? active?.id ?? null)
  const [date, setDate] = useState(log?.date ?? todayIso())
  const [liters, setLiters] = useState(str(log?.liters))
  const [price, setPrice] = useState(log && log.liters > 0 ? str(log.total / log.liters) : '')
  const [total, setTotal] = useState(str(log?.total))
  const [km, setKm] = useState(log?.km != null ? String(log.km) : '')
  const [full, setFull] = useState(log?.full ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const prev = useLiveQuery(
    () => (vehicleId != null ? db.fuelLogs.where('vehicleId').equals(vehicleId).toArray() : []),
    [vehicleId],
  )
  const lastKm = useMemo(
    () => Math.max(0, ...(prev ?? []).filter((l) => l.id !== log?.id && l.date <= date && l.km != null).map((l) => l.km!)),
    [prev, log?.id, date],
  )

  // Litres + (prix au litre | total) : la saisie de l'un calcule l'autre.
  const onLiters = (v: string) => {
    setLiters(v)
    const l = parseDecimal(v), p = parseDecimal(price)
    if (l != null && p != null) setTotal(str(l * p))
  }
  const onPrice = (v: string) => {
    setPrice(v)
    const l = parseDecimal(liters), p = parseDecimal(v)
    if (l != null && p != null) setTotal(str(l * p))
  }
  const onTotal = (v: string) => {
    setTotal(v)
    const l = parseDecimal(liters), t = parseDecimal(v)
    if (l != null && l > 0 && t != null) setPrice(str(t / l))
  }

  const kmN = km.trim() === '' ? null : Number(km.replace(/\s/g, ''))
  const kmWarning = kmN != null && lastKm > 0 && kmN < lastKm
    ? `Ce kilométrage est inférieur au dernier plein enregistré (${formatKm(lastKm)}).` : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const l = parseDecimal(liters)
    let t = parseDecimal(total)
    const p = parseDecimal(price)
    if (vehicleId == null) return setError('Choisissez un véhicule.')
    if (!date) return setError('La date est obligatoire.')
    if (l == null || l <= 0) return setError('Indiquez le nombre de litres.')
    if (t == null && p != null) t = l * p
    if (t == null || t <= 0) return setError('Indiquez le prix au litre ou le montant total.')
    if (kmN != null && (!Number.isFinite(kmN) || kmN < 0)) return setError('Kilométrage invalide.')
    setBusy(true)
    try {
      await saveFuelLog({ vehicleId, date, liters: l, total: Math.round(t * 100) / 100, km: kmN, full }, log?.id)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (log?.id == null || !window.confirm('Supprimer ce plein ?')) return
    await db.fuelLogs.delete(log.id)
    onSaved()
  }

  const t = parseDecimal(total)

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} aria-label="Annuler">←</button>
        <h2 className="text-xl font-bold">{log ? 'Modifier le plein' : 'Nouveau plein'}</h2>
      </div>
      <div><label className="label" htmlFor="f-vehicle">Véhicule</label>
        <select id="f-vehicle" className="field" value={vehicleId ?? ''} onChange={(e) => setVehicleId(Number(e.target.value))}>
          {!vehicles?.length && <option value="">Aucun véhicule</option>}
          {vehicles?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="f-date">Date</label>
          <input id="f-date" type="date" className="field" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} required /></div>
        <div><label className="label" htmlFor="f-liters">Litres</label>
          <input id="f-liters" className="field" inputMode="decimal" value={liters} onChange={(e) => onLiters(e.target.value)} placeholder="0,00" /></div>
        <div><label className="label" htmlFor="f-price">Prix au litre (€)</label>
          <input id="f-price" className="field" inputMode="decimal" value={price} onChange={(e) => onPrice(e.target.value)} placeholder="1,789" /></div>
        <div><label className="label" htmlFor="f-total">Total (€)</label>
          <input id="f-total" className="field" inputMode="decimal" value={total} onChange={(e) => onTotal(e.target.value)} placeholder="0,00" /></div>
      </div>
      {t != null && t > 0 && <p className="text-sm text-slate-600 dark:text-slate-400">Total : {formatEuro(t)}</p>}
      <div><label className="label" htmlFor="f-km">Kilométrage</label>
        <input id="f-km" className="field" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></div>
      {kmWarning && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">⚠️ {kmWarning} Vous pouvez tout de même enregistrer.</p>}
      <label className="flex min-h-[44px] items-center gap-3">
        <input type="checkbox" className="h-6 w-6" checked={full} onChange={(e) => setFull(e.target.checked)} />
        <span>Plein complet <span className="text-sm text-slate-600 dark:text-slate-400">(réservoir rempli à ras)</span></span>
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      {log && <button type="button" className="btn-danger w-full" onClick={remove}>Supprimer</button>}
    </form>
  )
}
