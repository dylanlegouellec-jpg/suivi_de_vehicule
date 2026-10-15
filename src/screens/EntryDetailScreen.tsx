import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { deleteEntry } from '../db/mutations'
import { ENTRY_TYPE_LABELS } from '../lib/entryTypes'
import { formatDate, formatEuro, formatKm } from '../lib/format'
import { errorMessage } from '../lib/storage'
import { engine } from '../sync/session'
import { useVehicles } from '../vehicleContext'

export default function EntryDetailScreen({ id, onBack, onEdit }: { id: number; onBack: () => void; onEdit: () => void }) {
  const entry = useLiveQuery(() => db.entries.get(id), [id])
  const vehicle = useLiveQuery(() => (entry ? db.vehicles.get(entry.vehicleId) : undefined), [entry?.vehicleId])
  const doc = useLiveQuery(() => (entry?.documentId != null ? db.documents.get(entry.documentId) : undefined), [entry?.documentId])
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { canEdit } = useVehicles()
  const [dl, setDl] = useState<'idle' | 'busy' | 'fail'>('idle')

  useEffect(() => {
    if (!doc?.blob) { setUrl(null); return }
    const u = URL.createObjectURL(doc.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [doc])

  if (entry === undefined) return <p role="status">Chargement…</p>
  if (!entry) return <p role="alert">Cette entrée n'existe plus. <button className="underline" onClick={onBack}>Retour</button></p>

  const remove = async () => {
    if (!window.confirm('Supprimer définitivement cette entrée et sa pièce jointe ?')) return
    try {
      await deleteEntry(id)
      onBack()
    } catch (e) { setError(errorMessage(e)) }
  }

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between gap-4 py-2"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
  )

  return (
    <div className="narrow space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn-secondary" onClick={onBack} aria-label="Retour">←</button>
        <h2 className="text-xl font-bold">{ENTRY_TYPE_LABELS[entry.type]}</h2>
      </div>
      <dl className="card divide-y divide-line">
        <Row label="Date" value={formatDate(entry.date)} />
        <Row label="Montant TTC" value={entry.amount != null ? formatEuro(entry.amount) : '—'} />
        {entry.amountHT != null && <Row label="Montant HT" value={formatEuro(entry.amountHT)} />}
        {entry.vat != null && <Row label="TVA" value={formatEuro(entry.vat)} />}
        <Row label="Kilométrage" value={entry.km != null ? formatKm(entry.km) : '—'} />
        <Row label="Garage" value={entry.garage || '—'} />
        <Row label="Véhicule" value={vehicle?.name ?? '—'} />
        {entry.notes && <div className="py-2"><dt className="text-muted">Notes</dt><dd className="whitespace-pre-wrap">{entry.notes}</dd></div>}
      </dl>

      {doc && !doc.blob && (
        <section className="card space-y-2">
          <h3 className="font-semibold">Pièce jointe : {doc.name}</h3>
          <p className="text-sm text-muted">Ce document vient d'un autre appareil et n'est pas encore sur celui-ci.</p>
          <button className="btn-secondary w-full" disabled={dl === 'busy'} onClick={async () => {
            setDl('busy')
            try { setDl((await engine.downloadDocument(doc.id!)) ? 'idle' : 'fail') } catch { setDl('fail') }
          }}>{dl === 'busy' ? 'Téléchargement…' : 'Télécharger le document'}</button>
          {dl === 'fail' && <p role="alert" className="text-sm text-danger">Téléchargement impossible (hors ligne, ou fichier pas encore envoyé par l'autre appareil).</p>}
        </section>
      )}
      {doc && url && (
        <section className="card space-y-2">
          <h3 className="font-semibold">Pièce jointe : {doc.name}</h3>
          {doc.mime.startsWith('image/') ? (
            <img src={url} alt={`Document ${doc.name}`} className="w-full rounded-xl" />
          ) : (
            <a className="btn-secondary w-full" href={url} target="_blank" rel="noreferrer">Ouvrir le PDF</a>
          )}
        </section>
      )}

      {error && <p role="alert" className="rounded-xl bg-danger/15 p-3 text-sm text-fg">{error}</p>}
      {canEdit(entry.vehicleId) ? (
        <>
          <button className="btn-primary w-full" onClick={onEdit}>Modifier</button>
          <button className="btn-danger w-full" onClick={remove}>Supprimer</button>
        </>
      ) : (
        <p className="card text-sm">Véhicule partagé en lecture seule : modification impossible.</p>
      )}
    </div>
  )
}
