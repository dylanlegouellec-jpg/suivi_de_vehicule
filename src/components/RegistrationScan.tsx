import { useEffect, useRef, useState } from 'react'
import ProgressBar from './ProgressBar'
import { extractDocument, type ExtractStatus } from '../lib/extract'
import { downscaleToJpeg } from '../lib/extract/image'
import { terminateOcr } from '../lib/extract/ocr'
import { parseRegistration, type ParsedRegistration } from '../lib/parsing/parseRegistration'

/** Scan de la carte grise : la photo est conservée dans le véhicule, l'OCR pré-remplit la fiche (à vérifier). */
export default function RegistrationScan({ photo, onPhoto, onRecognized }: {
  photo: Blob | null | undefined
  onPhoto: (photo: Blob | null) => void
  onRecognized: (parsed: ParsedRegistration) => string
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<ExtractStatus | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) { setUrl(null); return }
    const u = URL.createObjectURL(photo)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [photo])

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMessage(null)
    setStatus({ stage: 'lecture', label: 'Préparation…', progress: 0.05 })
    try {
      // La photo est gardée quoi qu'il arrive à la lecture automatique.
      const isImage = file.type.startsWith('image/')
      const kept = isImage ? await downscaleToJpeg(file, 2000, 0.85) : null
      if (kept) onPhoto(kept)
      const result = await extractDocument(file, setStatus)
      if (!kept && result.preview) onPhoto(result.preview)
      const summary = onRecognized(parseRegistration(result.text))
      setMessage({ ok: true, text: summary })
    } catch (err) {
      setMessage({ ok: false, text: `${err instanceof Error ? err.message : 'Lecture impossible.'} La photo est conservée : saisissez les informations à la main.` })
    } finally {
      setStatus(null)
      void terminateOcr()
    }
  }

  return (
    <section className="card space-y-3" aria-label="Carte grise">
      <h3 className="font-semibold">Carte grise</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Photographiez la carte grise : la fiche se remplit toute seule (marque, modèle, plaque, date de mise en circulation,
        carburant, VIN) et la photo est gardée dans l'app. La lecture se fait sur votre appareil.
      </p>
      {status ? (
        <div role="status"><ProgressBar value={status.progress} label={status.label} /></div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-primary" onClick={() => cameraRef.current?.click()}>📷 {photo ? 'Reprendre' : 'Photographier'}</button>
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>📄 Choisir un fichier</button>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handle} />

      {photo && url && !status && (
        <div className="flex items-center gap-3">
          <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Carte grise" className="h-16 w-24 rounded-lg object-cover ring-1 ring-slate-300 dark:ring-slate-700" /></a>
          <div className="flex flex-col items-start">
            <a className="min-h-[44px] py-3 text-sm text-brand underline" href={url} target="_blank" rel="noreferrer">Voir la carte grise</a>
            <button type="button" className="min-h-[44px] text-sm text-red-600 underline" onClick={() => { onPhoto(null); setMessage(null) }}>Retirer la photo</button>
          </div>
        </div>
      )}
      {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm ${message.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>{message.text}</p>}
    </section>
  )
}
