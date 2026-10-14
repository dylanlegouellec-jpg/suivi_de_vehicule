export interface StorageStatus {
  persisted: boolean
  usage: number | null
  quota: number | null
}

/** Demande le stockage persistant (best effort : iOS peut refuser). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch { /* ignoré */ }
  return false
}

export async function getStorageStatus(): Promise<StorageStatus> {
  let persisted = false
  let usage: number | null = null
  let quota: number | null = null
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false
    const est = await navigator.storage?.estimate?.()
    usage = est?.usage ?? null
    quota = est?.quota ?? null
  } catch { /* ignoré */ }
  return { persisted, usage, quota }
}

export function isQuotaError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'QuotaExceededError' || /quota/i.test(e.message))
}

export function errorMessage(e: unknown): string {
  if (isQuotaError(e)) return 'Stockage plein : libérez de la place ou exportez une sauvegarde.'
  return e instanceof Error ? e.message : 'Une erreur est survenue.'
}
