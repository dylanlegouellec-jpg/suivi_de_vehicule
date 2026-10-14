const enc = new TextEncoder()

/** Itérations côté appareil (le serveur, lui, ne refait qu'un hachage léger de la clé obtenue). */
export const KDF_ITERATIONS = 600_000

/**
 * Dérive la « clé d'authentification » envoyée au serveur à la place du mot de passe.
 * Le mot de passe ne quitte jamais l'appareil ; le calcul coûteux (PBKDF2) se fait ici, ce qui
 * garde le serveur très léger (limite de CPU du plan gratuit Cloudflare). Sel : l'e-mail.
 */
export async function deriveAuthKey(email: string, password: string, iterations = KDF_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`autosuivi|${email.trim().toLowerCase()}`), iterations },
    key,
    256,
  )
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const MIN_PASSWORD_LENGTH = 10
