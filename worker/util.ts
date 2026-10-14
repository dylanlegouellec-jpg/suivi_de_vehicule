import { HttpError } from './types'

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 512 * 1024): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > maxBytes) throw new HttpError(413, 'Requête trop volumineuse.')
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) throw new HttpError(415, 'Format attendu : JSON.')
  const text = await req.text()
  if (text.length > maxBytes) throw new HttpError(413, 'Requête trop volumineuse.')
  try {
    const v = JSON.parse(text)
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error()
    return v as T
  } catch {
    throw new HttpError(400, 'JSON invalide.')
  }
}

export const str = (v: unknown, max: number, name: string, min = 1): string => {
  if (typeof v !== 'string' || v.length < min || v.length > max) throw new HttpError(400, `Champ « ${name} » invalide.`)
  return v
}

export const UID_RE = /^[A-Za-z0-9_-]{8,64}$/
export const uid = (v: unknown, name = 'uid'): string => {
  if (typeof v !== 'string' || !UID_RE.test(v)) throw new HttpError(400, `Identifiant « ${name} » invalide.`)
  return v
}

/** Découpe un tableau en lots (limite de 100 paramètres liés par requête D1). */
export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}
