// Fonctions cryptographiques pures (WebCrypto) : hachage des mots de passe, jetons, codes.

const enc = new TextEncoder()
const PBKDF2_ITERATIONS = 100_000 // maximum accepté par Cloudflare Workers

export const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)))
}

/** Comparaison en temps constant. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}

/** Format : pbkdf2$<itérations>$<sel b64>$<hash b64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, PBKDF2_ITERATIONS))}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false
  const iterations = Math.min(Number(iter), PBKDF2_ITERATIONS)
  return safeEqual(toB64(await derive(password, fromB64(salt), iterations)), hash)
}

export function randomToken(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer)
}

// Alphabet sans caractères ambigus (0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Code lisible, ex. « K7QD-M2XP-R9WA ». ~5 bits par caractère. */
export function randomCode(groups: number, perGroup = 4): string {
  const out: string[] = []
  for (let g = 0; g < groups; g++) {
    let s = ''
    const rnd = crypto.getRandomValues(new Uint8Array(perGroup))
    for (const b of rnd) s += ALPHABET[b % ALPHABET.length]
    out.push(s)
  }
  return out.join('-')
}

export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '')
