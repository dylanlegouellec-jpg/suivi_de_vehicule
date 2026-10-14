const pad = (n: number) => String(n).padStart(2, '0')

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

/** Ajoute des mois à une date ISO ; le jour est ramené à la fin du mois si besoin (31 jan + 1 mois = 28/29 fév). */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parse(iso)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`
}

/** Nombre de jours entre deux dates ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d)
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d)
  return Math.round((tb - ta) / 86_400_000)
}
