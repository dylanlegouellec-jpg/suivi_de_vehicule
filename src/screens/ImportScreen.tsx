import { useEffect, useState } from 'react'
import ProgressBar from '../components/ProgressBar'
import { extractDocument, type ExtractResult, type ExtractStatus } from '../lib/extract'
import { terminateOcr } from '../lib/extract/ocr'
import ReviewForm from './ReviewForm'

/** Traite les fichiers un par un : extraction → vérification obligatoire → enregistrement. */
export default function ImportScreen({ files, onDone }: { files: File[]; onDone: (saved: number) => void }) {
  const [index, setIndex] = useState(0)
  const [saved, setSaved] = useState(0)
  const [status, setStatus] = useState<ExtractStatus>({ stage: 'lecture', label: 'Lecture…', progress: 0 })
  const [result, setResult] = useState<{ extraction: ExtractResult | null; error: string | null } | null>(null)

  const file = files[index]

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setStatus({ stage: 'lecture', label: 'Lecture…', progress: 0 })
    extractDocument(file, (s) => { if (!cancelled) setStatus(s) })
      .then((extraction) => { if (!cancelled) setResult({ extraction, error: null }) })
      .catch((e) => {
        if (!cancelled) setResult({ extraction: null, error: e instanceof Error ? e.message : "L'analyse du document a échoué." })
      })
    return () => { cancelled = true }
  }, [file])

  const finish = (count: number) => { void terminateOcr(); onDone(count) }
  const next = (savedNow: boolean) => {
    const count = saved + (savedNow ? 1 : 0)
    setSaved(count)
    if (index + 1 >= files.length) finish(count)
    else setIndex(index + 1)
  }

  if (!result)
    return (
      <div className="narrow space-y-4 py-8" role="status">
        <p className="text-center font-semibold">Analyse du document {index + 1} / {files.length}</p>
        <p className="truncate text-center text-sm text-muted">{file.name}</p>
        <ProgressBar value={status.progress} label={status.label} />
        <button className="btn-secondary w-full" onClick={() => finish(saved)}>Annuler</button>
      </div>
    )

  return (
    <ReviewForm
      key={index}
      file={file}
      extraction={result.extraction}
      error={result.error}
      position={{ index, total: files.length }}
      onSaved={() => next(true)}
      onSkip={() => next(false)}
      onCancel={() => finish(saved)}
    />
  )
}
