import type { Fuel } from '../../db/schema'
import { formatPlate, isCompletePlate } from '../plate'
import { fold, none, toIso, type Field } from './parseInvoice'

export interface ParsedRegistration {
  brand: Field<string> // D.1
  model: Field<string> // D.3
  plate: Field<string> // A
  firstRegistration: Field<string> // B (ISO)
  year: Field<number>
  vin: Field<string> // E
  fuel: Field<Fuel> // P.3
}

const BRANDS = [
  'RENAULT', 'PEUGEOT', 'CITROEN', 'DACIA', 'TOYOTA', 'VOLKSWAGEN', 'OPEL', 'FORD', 'FIAT', 'NISSAN', 'BMW', 'AUDI',
  'MERCEDES', 'SEAT', 'SKODA', 'HYUNDAI', 'KIA', 'MAZDA', 'HONDA', 'SUZUKI', 'MINI', 'VOLVO', 'TESLA', 'DS', 'ALFA ROMEO',
  'JEEP', 'LAND ROVER', 'MITSUBISHI', 'SMART', 'LEXUS', 'PORSCHE', 'YAMAHA', 'KAWASAKI', 'CUPRA', 'MG', 'IVECO', 'KTM',
]
const ACRONYMS = new Set(['BMW', 'DS', 'MG', 'KTM', 'VW'])
const DISPLAY: Record<string, string> = { CITROEN: 'Citroën' }

/** Codes « carburant » (champ P.3) d'un certificat d'immatriculation français. */
const FUEL_CODES: Record<string, Fuel> = {
  ES: 'essence', GO: 'diesel', GP: 'gpl', EL: 'electrique',
  EH: 'hybride', GH: 'hybride', PH: 'hybride', EP: 'hybride', GQ: 'hybride', EQ: 'hybride', EE: 'hybride',
}

const titleCase = (s: string) =>
  ACRONYMS.has(s) ? s : DISPLAY[s] ? DISPLAY[s] : s.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase())

/** Valeur d'un champ « CODE valeur » : sur la même ligne, sinon sur la ligne suivante. */
function fieldValue(lines: string[], code: RegExp, labelWords: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = code.exec(lines[i])
    if (!m) continue
    for (const candidate of [lines[i].slice(m[0].length), lines[i + 1] ?? '']) {
      const v = candidate.replace(labelWords, ' ').replace(/[^A-Za-zÀ-ÿ0-9 \-/]/g, ' ').replace(/\s+/g, ' ').trim()
      if (v.length >= 1 && /[A-Za-zÀ-ÿ0-9]/.test(v)) return v.slice(0, 40)
    }
  }
  return null
}

/** Analyse le texte (OCR) d'un certificat d'immatriculation français (« carte grise »). */
export function parseRegistration(rawText: string): ParsedRegistration {
  const text = (rawText ?? '').replace(/[  ]/g, ' ').replace(/\r/g, '')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const up = lines.map((l) => l.toUpperCase())
  const folded = up.map((l) => fold(l).toUpperCase())

  // ── Marque (D.1) ──
  let brand: Field<string> = none()
  const brandRaw = fieldValue(folded, /^D\s?\.?\s?1(?!\d)[\s.:)\-]*/, /\bMARQUE\b/g)
  if (brandRaw) {
    const known = BRANDS.find((b) => brandRaw === b || brandRaw.startsWith(b + ' '))
    brand = { value: titleCase(known ?? brandRaw), confidence: known ? 0.92 : 0.7 }
  } else {
    const flat = ` ${folded.join(' ')} `
    const found = BRANDS.find((b) => flat.includes(` ${b} `))
    if (found) brand = { value: titleCase(found), confidence: 0.5 }
  }

  // ── Modèle (D.3) ──
  let model: Field<string> = none()
  const modelRaw = fieldValue(folded, /^D\s?\.?\s?3(?!\d)[\s.:)\-]*/, /\bDENOMINATION\b|\bCOMMERCIALE\b/g)
  if (modelRaw) model = { value: titleCase(modelRaw), confidence: 0.85 }

  // ── Plaque (A) ──
  let plate: Field<string> = none()
  for (const l of folded) {
    const m = /^A[\s.:)\-]+([A-Z0-9][A-Z0-9 \-]{4,12})$/.exec(l)
    if (!m) continue
    const f = formatPlate(m[1])
    if (isCompletePlate(f)) { plate = { value: f, confidence: 0.92 }; break }
  }
  if (!plate.value) {
    const m = /(?<![A-Z0-9])([A-Z]{2})\s?-?\s?(\d{3})\s?-?\s?([A-Z]{2})(?![A-Z0-9])/.exec(folded.join('\n'))
    if (m) plate = { value: `${m[1]}-${m[2]}-${m[3]}`, confidence: 0.6 }
  }

  // ── Date de première immatriculation (B) ──
  let firstRegistration: Field<string> = none()
  for (const l of folded) {
    const m = /^B[\s.:)\-]+(\d{1,2})[\s/.\-]+(\d{1,2})[\s/.\-]+(\d{4})/.exec(l)
    if (!m) continue
    const iso = toIso(+m[1], +m[2], +m[3])
    if (iso) { firstRegistration = { value: iso, confidence: 0.9 }; break }
  }
  if (!firstRegistration.value) {
    // L'OCR supprime parfois les séparateurs : « B 15032019 »
    for (const l of folded) {
      const m = /^B[\s.:)\-]+(\d{2})(\d{2})(\d{4})(?!\d)/.exec(l)
      const iso = m ? toIso(+m[1], +m[2], +m[3]) : null
      if (iso) { firstRegistration = { value: iso, confidence: 0.85 }; break }
    }
  }
  if (!firstRegistration.value) {
    const all = [...folded.join('\n').matchAll(/(?<![\d/.-])(\d{1,2})[\s/.\-](\d{1,2})[\s/.\-](\d{4})(?!\d)/g)]
      .map((m) => toIso(+m[1], +m[2], +m[3]))
      .filter((x): x is string => !!x)
      .sort()
    // La première immatriculation est la plus ancienne date de la carte.
    if (all.length) firstRegistration = { value: all[0], confidence: 0.45 }
  }
  const year: Field<number> = firstRegistration.value
    ? { value: Number(firstRegistration.value.slice(0, 4)), confidence: firstRegistration.confidence }
    : none()

  // ── VIN (E) : 17 caractères, sans I, O, Q (souvent confondus avec 1, 0, 0 par l'OCR) ──
  let vin: Field<string> = none()
  for (const l of folded) {
    const m = /^E[\s.:)\-]+([A-Z0-9 ]{17,24})/.exec(l)
    if (!m) continue
    const v = m[1].replace(/\s/g, '').replace(/O|Q/g, '0').replace(/I/g, '1').slice(0, 17)
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) { vin = { value: v, confidence: 0.8 }; break }
  }
  if (!vin.value) {
    const m = /(?<![A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])/.exec(folded.join(' '))
    if (m && /\d/.test(m[1]) && /[A-Z]/.test(m[1])) vin = { value: m[1], confidence: 0.55 }
  }

  // ── Carburant (P.3) ──
  let fuel: Field<Fuel> = none()
  for (const l of folded) {
    const m = /^P\s?\.?\s?3(?!\d)[\s.:)\-]*(?:[A-Z ]*?\b)?([A-Z]{2})\b/.exec(l)
    if (!m) continue
    const f = FUEL_CODES[m[1]]
    fuel = f ? { value: f, confidence: 0.88 } : { value: 'autre', confidence: 0.4 }
    break
  }

  return { brand, model, plate, firstRegistration, year, vin, fuel }
}
