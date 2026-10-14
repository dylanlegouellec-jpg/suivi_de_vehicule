import { canvasToBlob } from './image'

export interface PdfResult {
  text: string
  /** Page 1 rasterisée (aperçu, et entrée de l'OCR si le PDF n'a pas de texte). */
  pageCanvas: HTMLCanvasElement | null
  preview: Blob | null
}

const MIN_TEXT_CHARS = 25
const MAX_PAGES = 5

/** Extrait le texte d'un PDF avec pdf.js (chargé à la demande), et rasterise la page 1. */
export async function extractPdf(file: Blob): Promise<PdfResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    const name = (e as { name?: string })?.name
    if (name === 'PasswordException') throw new Error('Ce PDF est protégé par un mot de passe.')
    throw new Error('Ce fichier PDF est illisible ou corrompu.')
  }

  try {
    let text = ''
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
      }
      text += '\n'
    }

    let pageCanvas: HTMLCanvasElement | null = null
    let preview: Blob | null = null
    try {
      const page = await doc.getPage(1)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(3, 2000 / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      pageCanvas = document.createElement('canvas')
      pageCanvas.width = Math.floor(viewport.width)
      pageCanvas.height = Math.floor(viewport.height)
      const ctx = pageCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
        await page.render({ canvasContext: ctx, viewport, canvas: pageCanvas }).promise
        preview = await canvasToBlob(pageCanvas, 'image/jpeg', 0.8)
      }
    } catch {
      pageCanvas = null // l'aperçu est optionnel
    }
    return { text, pageCanvas, preview }
  } finally {
    void task.destroy()
  }
}

export const hasUsableText = (t: string) => t.replace(/\s/g, '').length >= MIN_TEXT_CHARS
