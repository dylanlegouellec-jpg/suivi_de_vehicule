const isLetter = (c: string) => /[A-Z]/.test(c)
const isDigit = (c: string) => /[0-9]/.test(c)

/**
 * Met en forme une plaque d'immatriculation au fil de la frappe.
 * - SIV (depuis 2009) : AB-123-CD, soit 2 lettres, 3 chiffres, 2 lettres ; les tirets sont ajoutés tout seuls.
 * - FNI (avant 2009, commence par un chiffre) : 1234 AB 56, soit 1 à 4 chiffres, 1 à 3 lettres, 2 à 3 chiffres.
 * Un caractère qui n'est pas du bon type à sa position (un chiffre à la place d'une lettre, et inversement) est ignoré.
 */
export function formatPlate(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!raw) return ''

  if (isLetter(raw[0])) {
    const pattern = 'LLDDDLL'
    let out = ''
    for (const ch of raw) {
      if (out.length >= pattern.length) break
      const want = pattern[out.length]
      if ((want === 'L' && isLetter(ch)) || (want === 'D' && isDigit(ch))) out += ch
    }
    return [out.slice(0, 2), out.slice(2, 5), out.slice(5)].filter(Boolean).join('-')
  }

  const groups = ['', '', '']
  const max = [4, 3, 3]
  let phase = 0
  for (const ch of raw) {
    if (phase === 0) {
      if (isDigit(ch)) { if (groups[0].length < max[0]) groups[0] += ch }
      else { phase = 1; groups[1] += ch }
    } else if (phase === 1) {
      if (isLetter(ch)) { if (groups[1].length < max[1]) groups[1] += ch }
      else if (groups[1]) { phase = 2; groups[2] += ch }
    } else if (isDigit(ch) && groups[2].length < max[2]) groups[2] += ch
  }
  return groups.filter(Boolean).join(' ')
}

/** Plaque complète et valide (SIV ou FNI). */
export function isCompletePlate(plate: string): boolean {
  return /^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(plate) || /^\d{1,4} [A-Z]{1,3} \d{2,3}$/.test(plate)
}
