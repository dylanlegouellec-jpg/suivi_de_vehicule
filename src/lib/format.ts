const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const num = new Intl.NumberFormat('fr-FR')
const date = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const formatEuro = (n: number) => eur.format(n)
export const formatNumber = (n: number) => num.format(n)
export const formatKm = (n: number) => `${num.format(n)} km`
export const formatDate = (iso: string) => date.format(new Date(iso))
