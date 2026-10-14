import { loadBitmap, preprocessForOcr } from './image'
import { recognize } from './ocr'
import { extractPdf, hasUsableText } from './pdf'

export interface ExtractStatus {
  stage: 'lecture' | 'ocr'
  label: string
  progress: number // 0..1
}

export interface ExtractResult {
  text: string
  ocrUsed: boolean
  /** Image d'aperçu pour un PDF (null pour une image : on affiche l'original). */
  preview: Blob | null
}

export const isPdf = (f: Blob & { name?: string }) =>
  f.type === 'application/pdf' || /\.pdf$/i.test(f.name ?? '')

export function mimeOf(f: Blob & { name?: string }): string {
  if (f.type) return f.type
  return isPdf(f) ? 'application/pdf' : 'application/octet-stream'
}

/** Pipeline : PDF (texte, sinon rasterisation + OCR) ou image (redimensionnement, contraste, OCR). */
export async function extractDocument(file: File, onStatus: (s: ExtractStatus) => void): Promise<ExtractResult> {
  if (isPdf(file)) {
    onStatus({ stage: 'lecture', label: 'Lecture du PDF…', progress: 0.1 })
    const pdf = await extractPdf(file)
    if (hasUsableText(pdf.text)) return { text: pdf.text, ocrUsed: false, preview: pdf.preview }
    if (!pdf.pageCanvas) throw new Error("Ce PDF ne contient pas de texte et n'a pas pu être converti en image pour l'OCR.")
    onStatus({ stage: 'ocr', label: 'PDF scanné : reconnaissance du texte…', progress: 0 })
    const canvas = preprocessForOcr(pdf.pageCanvas, pdf.pageCanvas.width, pdf.pageCanvas.height)
    const text = await recognize(canvas, (p) => onStatus({ stage: 'ocr', label: 'Reconnaissance du texte…', progress: p }))
    return { text, ocrUsed: true, preview: pdf.preview }
  }

  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name)) {
    throw new Error('Format non pris en charge : choisissez une image ou un PDF.')
  }
  onStatus({ stage: 'lecture', label: "Préparation de l'image…", progress: 0.1 })
  let bitmap
  try {
    bitmap = await loadBitmap(file)
  } catch {
    throw new Error("Cette image est illisible (format non pris en charge par le navigateur).")
  }
  const w = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width
  const h = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height
  const canvas = preprocessForOcr(bitmap, w, h)
  if ('close' in bitmap) bitmap.close()
  onStatus({ stage: 'ocr', label: 'Reconnaissance du texte…', progress: 0 })
  const text = await recognize(canvas, (p) => onStatus({ stage: 'ocr', label: 'Reconnaissance du texte…', progress: p }))
  return { text, ocrUsed: true, preview: null }
}
