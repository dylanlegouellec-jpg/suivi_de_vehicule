// tesseract.js est chargé à la demande (import dynamique) pour ne pas alourdir le premier chargement.
// Worker, cœur WASM et langue « fra » sont servis par l'app elle-même (/tesseract), sans CDN tiers.
import type { Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null
let onProgress: ((p: number) => void) | null = null

const abs = (path: string) => new URL(path, window.location.origin).href

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker('fra', 1, {
        workerPath: abs('/tesseract/worker.min.js'),
        corePath: abs('/tesseract/'),
        langPath: abs('/tesseract/lang'),
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') onProgress?.(m.progress)
        },
      })
    })().catch((e) => {
      workerPromise = null
      throw e
    })
  }
  return workerPromise
}

export async function recognize(image: HTMLCanvasElement | Blob, progress?: (p: number) => void): Promise<string> {
  onProgress = progress ?? null
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(image)
    return data.text
  } catch (e) {
    throw new Error(
      `La reconnaissance du texte (OCR) a échoué${e instanceof Error && e.message ? ` : ${e.message}` : '.'} ` +
        'Si vous êtes hors ligne, ouvrez une première fois l\'OCR avec du réseau pour le mettre en cache.',
    )
  } finally {
    onProgress = null
  }
}

/** Libère la mémoire (important sur iPhone) une fois le lot traité. */
export async function terminateOcr(): Promise<void> {
  const p = workerPromise
  workerPromise = null
  if (p) {
    try { await (await p).terminate() } catch { /* ignoré */ }
  }
}
