import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '../db/db'
import { saveEntry } from '../db/saveEntry'
import type { Entry, EntryType } from '../db/schema'
import { findDuplicate } from '../lib/entries'
import { ENTRY_TYPES, ENTRY_TYPE_LABELS } from '../lib/entryTypes'
import { mimeOf, type ExtractResult } from '../lib/extract'
import { formatDate, formatEuro, parseDecimal, todayIso } from '../lib/format'
import { LOW_CONFIDENCE, parseInvoice, type Field, type ParsedInvoice } from '../lib/parsing/parseInvoice'
import { errorMessage } from '../lib/storage'
import { useVehicles } from '../vehicleContext'

const normPlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const isLow = (f: Field<unknown>) => f.value == null || f.confidence < LOW_CONFIDENCE
const str = (n: number | null) => (n == null ? '' : String(n).replace('.', ','))

function Row({ label, htmlFor, low, children }: { label: string; htmlFor: string; low: boolean; children: ReactNode }) {
  return (
    <div className={low ? 'rounded-xl bg-amber-50 p-2 ring-2 ring-amber-400 dark:bg-amber-950/40' : 'p-2'}>
      <label className="label flex justify-between" htmlFor={htmlFor}>
        <span>{label}</span>
        {low && <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">À vérifier</span>}
      </label>
      {children}
    </div>
  )
}

export default function ReviewForm({ file, extraction, error, position, onSaved, onSkip, onCancel }: {
  file: File
  extraction: ExtractResult | null
  error: string | null
  position: { index: number; total: number }
  onSaved: () => void
  onSkip: () => void
  onCancel: () => void
}) {
  const { writable: vehicles, active } = useVehicles()
  const parsed: ParsedInvoice = useMemo(() => parseInvoice(extraction?.text ?? ''), [extraction])

  const matchedVehicle = useMemo(() => {
    const p = parsed.plate.value
    return p ? vehicles?.find((v) => v.plate && normPlate(v.plate) === normPlate(p)) : undefined
  }, [parsed, vehicles])

  const [vehicleId, setVehicleId] = useState<number | null>(null)
  useEffect(() => { setVehicleId((cur) => cur ?? matchedVehicle?.id ?? active?.id ?? null) }, [matchedVehicle, active])

  const [type, setType] = useState<EntryType>(parsed.type.value ?? 'autre')
  const [date, setDate] = useState(parsed.date.value ?? '')
  const [ttc, setTtc] = useState(str(parsed.amountTTC.value))
  const [ht, setHt] = useState(str(parsed.amountHT.value))
  const [vat, setVat] = useState(str(parsed.vat.value))
  const [km, setKm] = useState(parsed.km.value != null ? String(parsed.km.value) : '')
  const [plate, setPlate] = useState(parsed.plate.value ?? '')
  const [garage, setGarage] = useState(parsed.garage.value ?? '')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Les champs sont initialisés une seule fois depuis l'analyse ; la clé du composant change à chaque document.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const isImage = file.type.startsWith('image/')
  useEffect(() => {
    const blob = isImage ? file : extraction?.preview ?? null
    if (!blob) { setPreviewUrl(null); return }
    const u = URL.createObjectURL(blob)
    setPreviewUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file, extraction, isImage])
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  useEffect(() => {
    if (isImage) return
    const u = URL.createObjectURL(file)
    setPdfUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file, isImage])

  const plateMismatch = (() => {
    const v = vehicles?.find((x) => x.id === vehicleId)
    return !!(plate && v?.plate && normPlate(plate) !== normPlate(v.plate))
  })()

  const save = async (ignoreDup: boolean) => {
    setFormError(null)
    if (vehicleId == null) return setFormError('Choisissez un véhicule (ajoutez-en un depuis Réglages).')
    if (!date) return setFormError('La date est obligatoire.')
    const ttcN = parseDecimal(ttc), htN = parseDecimal(ht), vatN = parseDecimal(vat)
    if ((ttc.trim() && ttcN == null) || (ht.trim() && htN == null) || (vat.trim() && vatN == null))
      return setFormError('Un des montants est invalide.')
    const kmN = km.trim() === '' ? null : Number(km.replace(/\s/g, ''))
    if (kmN != null && (!Number.isFinite(kmN) || kmN < 0)) return setFormError('Kilométrage invalide.')

    setBusy(true)
    try {
      const data: Omit<Entry, 'id'> = {
        vehicleId, type, date, amount: ttcN, amountHT: htN, vat: vatN, km: kmN,
        garage: garage.trim(), notes: notes.trim(), documentId: null,
      }
      if (!ignoreDup) {
        const dup = findDuplicate(await db.entries.where('vehicleId').equals(vehicleId).toArray(), data)
        if (dup) {
          setDupWarning(`Une entrée existe déjà le ${formatDate(dup.date)} pour ${formatEuro(dup.amount ?? 0)} (${ENTRY_TYPE_LABELS[dup.type]}).`)
          setBusy(false)
          return
        }
      }
      await saveEntry(data, { document: { name: file.name || 'document', mime: mimeOf(file), blob: file, createdAt: Date.now() } })
      onSaved()
    } catch (e) {
      setFormError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} aria-label="Annuler l'import">✕</button>
        <h2 className="text-xl font-bold">Vérifier le document</h2>
        {position.total > 1 && <span className="ml-auto text-sm text-slate-600 dark:text-slate-400">{position.index + 1} / {position.total}</span>}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error} Vous pouvez saisir les informations à la main : le document sera tout de même joint.</p>}
      {!error && extraction && (
        <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
          {extraction.ocrUsed ? 'Texte reconnu par OCR : ' : 'Texte lu dans le PDF : '}
          vérifiez chaque champ, les cases jaunes sont incertaines. Rien n'est enregistré avant votre validation.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <section className="md:sticky md:top-0 md:self-start">
          <details open className="card">
            <summary className="min-h-[44px] cursor-pointer py-2 font-semibold">Aperçu : {file.name || 'document'}</summary>
            {previewUrl ? (
              <a href={previewUrl} target="_blank" rel="noreferrer">
                <img src={previewUrl} alt="Aperçu du document" className="max-h-[45vh] w-full rounded-xl object-contain md:max-h-[70vh]" />
              </a>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">Aucun aperçu disponible.</p>
            )}
            {pdfUrl && <a className="btn-secondary mt-2 w-full" href={pdfUrl} target="_blank" rel="noreferrer">Ouvrir le PDF complet</a>}
          </details>
          {extraction && (
            <details className="card mt-2">
              <summary className="min-h-[44px] cursor-pointer py-2 text-sm">Texte extrait</summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{extraction.text || '(vide)'}</pre>
            </details>
          )}
        </section>

        <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); void save(false) }}>
          <Row label="Véhicule" htmlFor="r-vehicle" low={false}>
            <select id="r-vehicle" className="field" value={vehicleId ?? ''} onChange={(e) => setVehicleId(Number(e.target.value))}>
              {!vehicles?.length && <option value="">Aucun véhicule</option>}
              {vehicles?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Row>
          <Row label="Type" htmlFor="r-type" low={isLow(parsed.type)}>
            <select id="r-type" className="field" value={type} onChange={(e) => setType(e.target.value as EntryType)}>
              {ENTRY_TYPES.map((t) => <option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>)}
            </select>
          </Row>
          <Row label="Date" htmlFor="r-date" low={isLow(parsed.date) && date === (parsed.date.value ?? '')}>
            <input id="r-date" className="field" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} required />
          </Row>
          <Row label="Montant TTC (€)" htmlFor="r-ttc" low={isLow(parsed.amountTTC)}>
            <input id="r-ttc" className="field" inputMode="decimal" value={ttc} onChange={(e) => setTtc(e.target.value)} placeholder="0,00" />
          </Row>
          <div className="grid grid-cols-2 gap-1">
            <Row label="HT (€)" htmlFor="r-ht" low={ht !== '' && isLow(parsed.amountHT)}>
              <input id="r-ht" className="field" inputMode="decimal" value={ht} onChange={(e) => setHt(e.target.value)} />
            </Row>
            <Row label="TVA (€)" htmlFor="r-vat" low={vat !== '' && isLow(parsed.vat)}>
              <input id="r-vat" className="field" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} />
            </Row>
          </div>
          <Row label="Kilométrage" htmlFor="r-km" low={km !== '' ? isLow(parsed.km) : false}>
            <input id="r-km" className="field" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
          </Row>
          <Row label="Plaque détectée" htmlFor="r-plate" low={plate !== '' && isLow(parsed.plate)}>
            <input id="r-plate" className="field uppercase" value={plate} onChange={(e) => setPlate(e.target.value)} autoCapitalize="characters" />
            {plateMismatch && <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">⚠️ Cette plaque ne correspond pas au véhicule sélectionné.</p>}
          </Row>
          <Row label="Garage" htmlFor="r-garage" low={isLow(parsed.garage)}>
            <input id="r-garage" className="field" value={garage} onChange={(e) => setGarage(e.target.value)} />
          </Row>
          <Row label="Notes" htmlFor="r-notes" low={false}>
            <textarea id="r-notes" className="field py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Row>

          {dupWarning && (
            <div role="alert" className="space-y-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
              <p>⚠️ Doublon possible : {dupWarning}</p>
              <button type="button" className="btn-secondary w-full" onClick={() => void save(true)}>Enregistrer quand même</button>
            </div>
          )}
          {formError && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{formError}</p>}

          <div className="space-y-2 p-2">
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Enregistrement…' : 'Valider et enregistrer'}</button>
            {position.total > 1 && <button type="button" className="btn-secondary w-full" onClick={onSkip}>Passer ce document</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
