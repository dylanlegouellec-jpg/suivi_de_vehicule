import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { exportBackupBlob, getLastBackupAt, markBackupDone, mergeInto, replaceAll } from '../db/backup'
import { buildCarnet } from '../lib/export/carnet'
import { entriesToCsv, fuelToCsv } from '../lib/export/csv'
import { saveFile } from '../lib/export/saveFile'
import { BackupError, parseBackup, type Snapshot } from '../lib/backup/format'
import { errorMessage } from '../lib/storage'
import { useVehicles } from '../vehicleContext'

type Msg = { kind: 'ok' | 'error'; text: string }

export default function BackupSection() {
  const { vehicles, active } = useVehicles()
  const lastBackup = useLiveQuery(() => getLastBackupAt(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [pending, setPending] = useState<Snapshot | null>(null)
  const [carnetId, setCarnetId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async (label: string, fn: () => Promise<Msg | void>) => {
    setBusy(label)
    setMsg(null)
    try {
      const res = await fn()
      if (res) setMsg(res)
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof BackupError ? e.message : errorMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  const saved = (r: 'shared' | 'downloaded' | 'cancelled', what: string): Msg | void =>
    r === 'cancelled' ? undefined : { kind: 'ok', text: `${what} prêt${r === 'shared' ? ' : choisissez « Enregistrer dans Fichiers »' : ' (téléchargé)'}.` }

  const exportJson = () => run('json', async () => {
    const { blob, name } = await exportBackupBlob()
    const r = await saveFile(blob, name)
    if (r !== 'cancelled') await markBackupDone()
    return saved(r, 'Sauvegarde')
  })

  const exportCsv = (kind: 'entries' | 'fuel') => run(kind, async () => {
    const [entries, fuel, vs] = await Promise.all([db.entries.toArray(), db.fuelLogs.toArray(), db.vehicles.toArray()])
    const csv = kind === 'entries' ? entriesToCsv(entries, vs) : fuelToCsv(fuel, vs)
    const name = `autosuivi-${kind === 'entries' ? 'historique' : 'carburant'}-${new Date().toISOString().slice(0, 10)}.csv`
    return saved(await saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), name), 'Export CSV')
  })

  const exportPdf = () => run('pdf', async () => {
    const id = carnetId ?? active?.id
    const vehicle = vehicles?.find((v) => v.id === id)
    if (!vehicle) throw new Error('Choisissez un véhicule.')
    const [entries, fuel] = await Promise.all([db.entries.toArray(), db.fuelLogs.toArray()])
    const { buildCarnetPdf } = await import('../lib/export/carnetPdf')
    const blob = await buildCarnetPdf(buildCarnet(vehicle, entries, fuel))
    const slug = vehicle.name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'vehicule'
    return saved(await saveFile(blob, `carnet-entretien-${slug}.pdf`), 'Carnet PDF')
  })

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    void run('read', async () => {
      setPending(parseBackup(await file.text()))
    })
  }

  const counts = (s: Snapshot) =>
    `${s.vehicles.length} véhicule(s), ${s.entries.length} entrée(s), ${s.fuelLogs.length} plein(s), ${s.documents.length} document(s)`

  const doMerge = () => run('merge', async () => {
    const r = await mergeInto(pending!)
    setPending(null)
    return { kind: 'ok', text: `Fusion terminée : ${r.vehicles} véhicule(s), ${r.entries} entrée(s), ${r.fuelLogs} plein(s), ${r.reminderRules} rappel(s) ajoutés ; ${r.skipped} doublon(s) ignoré(s).` }
  })

  const doReplace = () => {
    if (!window.confirm('Remplacer TOUTES les données actuelles par la sauvegarde ? Cette action est irréversible.')) return
    void run('replace', async () => {
      await replaceAll(pending!)
      setPending(null)
      return { kind: 'ok', text: 'Données remplacées par la sauvegarde.' }
    })
  }

  const lastLabel = lastBackup ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(lastBackup)) : 'jamais'
  const disabled = busy != null

  return (
    <section className="card space-y-3" aria-label="Sauvegarde et export">
      <h2 className="font-semibold">Sauvegarde et export</h2>
      <p className="text-sm">Dernière sauvegarde : <strong>{lastLabel}</strong></p>

      <button className="btn-primary w-full" onClick={exportJson} disabled={disabled}>
        {busy === 'json' ? 'Préparation…' : '💾 Exporter une sauvegarde complète'}
      </button>
      <p className="text-xs text-muted">Fichier JSON avec toutes vos données et pièces jointes. Enregistrez-le dans Fichiers ou iCloud Drive.</p>

      <button className="btn-secondary w-full" onClick={() => fileRef.current?.click()} disabled={disabled}>📥 Importer une sauvegarde</button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onPick} />

      {pending && (
        <div role="group" aria-label="Choix d'import" className="space-y-2 rounded-xl bg-surface2 p-3">
          <p className="text-sm">Sauvegarde lue : {counts(pending)}.</p>
          <button className="btn-primary w-full" onClick={doMerge} disabled={disabled}>Fusionner avec mes données</button>
          <button className="btn-danger w-full" onClick={doReplace} disabled={disabled}>Remplacer toutes mes données</button>
          <button className="btn-secondary w-full" onClick={() => setPending(null)} disabled={disabled}>Annuler</button>
        </div>
      )}

      <hr className="border-line" />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" onClick={() => exportCsv('entries')} disabled={disabled}>CSV historique</button>
        <button className="btn-secondary" onClick={() => exportCsv('fuel')} disabled={disabled}>CSV carburant</button>
      </div>

      <div>
        <label className="label" htmlFor="carnet-vehicle">Carnet d'entretien (PDF)</label>
        <div className="flex gap-2">
          <select id="carnet-vehicle" className="field" value={carnetId ?? active?.id ?? ''} onChange={(e) => setCarnetId(Number(e.target.value))} disabled={!vehicles?.length}>
            {!vehicles?.length && <option value="">Aucun véhicule</option>}
            {vehicles?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="btn-secondary shrink-0" onClick={exportPdf} disabled={disabled || !vehicles?.length}>
            {busy === 'pdf' ? '…' : '📘 PDF'}
          </button>
        </div>
      </div>

      {msg && (
        <p role={msg.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-xl p-3 text-sm ${msg.kind === 'error' ? 'bg-danger/15 text-fg' : 'bg-ok/15 text-fg'}`}>
          {msg.text}
        </p>
      )}
    </section>
  )
}
