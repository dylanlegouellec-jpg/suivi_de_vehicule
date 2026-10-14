import { base64ToBytes, bytesToBase64 } from '../lib/base64'

/** Taille d'un morceau envoyé au serveur (la base D1 limite chaque ligne à 2 Mo). */
export const CHUNK_BYTES = 700 * 1024

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
/** Pas de réseau, ou serveur injoignable. */
export class NetworkError extends Error {}

export interface Api {
  json<T = unknown>(method: string, path: string, body?: unknown): Promise<T>
  putBlob(path: string, blob: Blob): Promise<void>
  /** null si la pièce jointe n'existe pas (encore) sur le serveur. */
  getBlob(path: string): Promise<Blob | null>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** Client HTTP minimal. Les cookies de session sont gérés par le navigateur (même origine). */
export function createApi(fetchImpl: FetchLike = (i, init) => fetch(i, init), base = '', onUnauthorized?: () => void): Api {
  async function call(method: string, path: string, init: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetchImpl(base + path, { method, credentials: 'same-origin', ...init })
    } catch {
      throw new NetworkError('Pas de connexion au serveur.')
    }
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.()
    return res
  }
  const fail = async (res: Response): Promise<never> => {
    let message = `Erreur serveur (${res.status}).`
    try {
      const data = await res.json()
      if (data && typeof data.error === 'string') message = data.error
    } catch { /* corps non JSON */ }
    throw new ApiError(res.status, message)
  }
  return {
    async json<T>(method: string, path: string, body?: unknown) {
      const res = await call(method, path, {
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) return fail(res)
      return (await res.json()) as T
    },
    async putBlob(path, blob) {
      // Envoi par morceaux en base64 ; le serveur ne décode rien (peu de CPU, ligne D1 < 2 Mo).
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const chunks = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES))
      const q = `chunks=${chunks}&size=${bytes.length}&mime=${encodeURIComponent(blob.type || 'application/octet-stream')}`
      for (let i = 0; i < chunks; i++) {
        const part = bytesToBase64(bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES))
        const res = await call('PUT', `${path}/${i}?${q}`, { headers: { 'content-type': 'text/plain' }, body: part })
        if (!res.ok) await fail(res)
      }
    },
    async getBlob(path) {
      const metaRes = await call('GET', path, {})
      if (metaRes.status === 404) return null
      if (!metaRes.ok) return fail(metaRes)
      const meta = (await metaRes.json()) as { mime: string; chunks: number }
      const parts: Uint8Array[] = []
      for (let i = 0; i < meta.chunks; i++) {
        const res = await call('GET', `${path}/${i}`, {})
        if (res.status === 404) return null
        if (!res.ok) return fail(res)
        parts.push(base64ToBytes(await res.text()))
      }
      return new Blob(parts as BlobPart[], { type: meta.mime })
    },
  }
}
