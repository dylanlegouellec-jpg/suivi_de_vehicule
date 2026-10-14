export const MAX_SIDE = 2000

export interface Size { width: number; height: number }

export function fitSize(w: number, h: number, max = MAX_SIDE): Size {
  const scale = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    // Repli (anciens Safari) : <img> applique l'orientation EXIF automatiquement.
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/** Redimensionne (max 2000 px) puis passe en niveaux de gris avec étirement du contraste pour l'OCR. */
export function preprocessForOcr(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const { width, height } = fitSize(w, h)
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error("Impossible de préparer l'image (canvas indisponible).")
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)

  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    d[i] = d[i + 1] = d[i + 2] = g
    hist[g]++
  }
  const total = width * height
  const lo = percentile(hist, total * 0.02)
  const hi = percentile(hist, total * 0.98)
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

function percentile(hist: Uint32Array, target: number): number {
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= target) return i
  }
  return 255
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Échec de la conversion de l'image."))), type, quality),
  )
}
