import type { CarnetData } from './carnet'
import { FUEL_LABELS } from '../../db/schema'

// Les polices standard de jsPDF (WinAnsi) ne gèrent pas les espaces insécables fines de Intl : on les normalise.
const clean = (s: string) => s.replace(/[  ]/g, ' ')
const eur = (n: number) => clean(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n))
const dt = (iso: string) => new Intl.DateTimeFormat('fr-FR').format(new Date(iso))
const km = (n: number) => clean(new Intl.NumberFormat('fr-FR').format(n)) + ' km'

/** Génère le carnet d'entretien (PDF A4) d'un véhicule. jsPDF est chargé à la demande. */
export async function buildCarnetPdf(data: CarnetData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 15, BOTTOM = 280
  let y = M

  const v = data.vehicle
  doc.setFont('helvetica', 'bold').setFontSize(20).text("Carnet d'entretien", M, y + 6)
  y += 14
  doc.setFontSize(14).text(clean(v.name), M, y)
  y += 7
  doc.setFont('helvetica', 'normal').setFontSize(10)
  const info = [
    ['Marque / modèle', [v.brand, v.model].filter(Boolean).join(' ') || '-'],
    ['Année', v.year ? String(v.year) : '-'],
    ['Plaque', v.plate || '-'],
    ['Carburant', FUEL_LABELS[v.fuel]],
    ['Mise en circulation', v.firstRegistration ? dt(v.firstRegistration) : '-'],
    ['Kilométrage actuel', v.mileage != null ? km(v.mileage) : '-'],
  ]
  info.forEach(([k, val], i) => {
    const col = i % 2, row = Math.floor(i / 2)
    doc.setTextColor(100).text(clean(k), M + col * 90, y + row * 6)
    doc.setTextColor(0).text(clean(val), M + col * 90 + 38, y + row * 6)
  })
  y += 22

  // Tableau des interventions
  const cols = [
    { h: 'Date', x: M, w: 22 },
    { h: 'Intervention', x: M + 22, w: 38 },
    { h: 'Km', x: M + 60, w: 24 },
    { h: 'Garage / notes', x: M + 84, w: 68 },
    { h: 'Montant', x: W - M - 1.5, w: 28, right: true },
  ]
  const header = () => {
    doc.setFillColor(37, 99, 235).rect(M, y - 5, W - 2 * M, 8, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(255)
    cols.forEach((c) => doc.text(c.h, c.x + (c.right ? 0 : 1.5), y, { align: c.right ? 'right' : 'left' }))
    y += 8
    doc.setFont('helvetica', 'normal').setTextColor(0)
  }
  doc.setFont('helvetica', 'bold').setFontSize(12).text('Interventions', M, y)
  y += 8
  header()

  if (data.rows.length === 0) {
    doc.setFontSize(10).text('Aucune intervention enregistrée.', M + 1.5, y)
    y += 8
  }
  data.rows.forEach((r, i) => {
    const detail = [r.garage, r.notes].filter(Boolean).join(' - ')
    const lines = doc.setFontSize(9).splitTextToSize(clean(detail || '-'), cols[3].w - 2) as string[]
    const h = Math.max(6, lines.length * 4.2 + 2)
    if (y + h > BOTTOM) { doc.addPage(); y = M + 5; header() }
    if (i % 2 === 0) doc.setFillColor(243, 244, 246).rect(M, y - 4, W - 2 * M, h, 'F')
    doc.setFontSize(9).setTextColor(0)
    doc.text(dt(r.date), cols[0].x + 1.5, y)
    doc.text(clean(r.type), cols[1].x + 1.5, y)
    doc.text(r.km != null ? km(r.km) : '-', cols[2].x + 1.5, y)
    doc.text(lines, cols[3].x + 1.5, y)
    doc.text(r.amount != null ? eur(r.amount) : '-', cols[4].x, y, { align: 'right' })
    y += h
  })

  // Totaux
  if (y + 12 + data.byCategory.length * 6 + 14 > BOTTOM) { doc.addPage(); y = M + 5 }
  y += 6
  doc.setDrawColor(200).line(M, y - 3, W - M, y - 3)
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(0).text('Total des coûts', M, y + 3)
  doc.text(eur(data.total), W - M, y + 3, { align: 'right' })
  y += 11
  doc.setFont('helvetica', 'normal').setFontSize(10)
  for (const c of data.byCategory) {
    doc.text(clean(c.label), M + 4, y)
    doc.text(eur(c.total), W - M, y, { align: 'right' })
    y += 6
  }
  if (data.fuelTotal > 0) {
    y += 2
    doc.setTextColor(100).text('Carburant (hors interventions ci-dessus)', M + 4, y)
    doc.text(eur(data.fuelTotal), W - M, y, { align: 'right' })
  }

  // Pied de page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p).setFontSize(8).setTextColor(130)
    doc.text(`AutoSuivi - généré le ${dt(new Date().toISOString())}`, M, 290)
    doc.text(`${p} / ${pages}`, W - M, 290, { align: 'right' })
  }
  return doc.output('blob')
}
