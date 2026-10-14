/**
 * Enregistre/partage un fichier. Sur iPhone, la feuille de partage permet « Enregistrer dans Fichiers » ;
 * à défaut (ou si le partage est impossible), repli sur un téléchargement classique.
 */
export async function saveFile(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // autre erreur (ex. geste utilisateur expiré) : on retombe sur le téléchargement
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
