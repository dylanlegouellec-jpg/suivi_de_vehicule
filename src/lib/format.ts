const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const num = new Intl.NumberFormat('fr-FR')
const date = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const formatEuro = (n: number) => eur.format(n)
export const formatNumber = (n: number) => num.format(n)
export const formatKm = (n: number) => `${num.format(n)} km`
export const formatDate = (iso: string) => date.format(new Date(iso))

/** Accepte « 1 234,56 », « 12.5 », « 12,5 € » ; renvoie null si vide ou invalide. */
export function parseDecimal(s: string): number | null {
  const cleaned = s.replace(/[\s €]/g, '').replace(',', '.')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export const todayIso = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
