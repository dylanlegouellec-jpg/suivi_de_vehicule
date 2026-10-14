import type { EntryType } from '../../db/schema'

export interface Field<T> {
  value: T | null
  /** 0 à 1 : en dessous de LOW_CONFIDENCE, le champ doit être vérifié par l'utilisateur. */
  confidence: number
}

export interface ParsedInvoice {
  date: Field<string> // ISO yyyy-mm-dd
  amountTTC: Field<number>
  amountHT: Field<number>
  vat: Field<number>
  km: Field<number>
  plate: Field<string>
  garage: Field<string>
  type: Field<EntryType>
}

export const LOW_CONFIDENCE = 0.6

export const none = <T,>(): Field<T> => ({ value: null, confidence: 0 })

/** Minuscules + suppression des accents, sans changer la longueur (index conservés). */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[àâäá]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[îïí]/g, 'i')
    .replace(/[ôöó]/g, 'o')
    .replace(/[ùûüú]/g, 'u')
    .replace(/ç/g, 'c')
}

function normalizeText(text: string): string {
  return text
    .replace(/[   ]/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
}

// ───────────────────────── Montants ─────────────────────────

const AMOUNT_RE = /(?<![\d.,/-])(\d{1,3}(?:[ .]\d{3})+|\d+)[,.](\d{2})(?!\d|[.,]\d)(?!\s*%)/g

/** « 1 234,56 », « 1.234,56 », « 1234.56 » → 1234.56 */
export function parseAmountToken(intPart: string, dec: string): number {
  return Number(`${intPart.replace(/[ .]/g, '')}.${dec}`)
}

export function amountsIn(s: string): number[] {
  const out: number[] = []
  for (const m of s.matchAll(AMOUNT_RE)) out.push(parseAmountToken(m[1], m[2]))
  return out
}

interface KeyRule {
  re: RegExp
  confidence: number
  pick: 'first' | 'last'
}

const ANY_TOTAL_KEY = /total\s+h\.?t|montant\s+h\.?t|total\s+ttc|montant\s+ttc|net\s+a\s+payer|\btva\b|t\.v\.a|\bttc\b|\bh\.?t\b/g

/** Cherche un montant derrière un mot-clé, sur la même ligne (jusqu'au mot-clé suivant) ou la ligne suivante. */
function findByKeywords(lines: string[], rules: KeyRule[], skipLine?: RegExp): Field<number> {
  let best: Field<number> = none()
  lines.forEach((line, i) => {
    const f = fold(line)
    if (skipLine?.test(f)) return
    for (const rule of rules) {
      const m = rule.re.exec(f)
      if (!m) continue
      const start = m.index + m[0].length
      let segment = line.slice(start)
      const nextKey = fold(segment).search(ANY_TOTAL_KEY)
      if (nextKey > 0) segment = segment.slice(0, nextKey)
      let amounts = amountsIn(segment)
      if (amounts.length === 0 && lines[i + 1] && !ANY_TOTAL_KEY.test(fold(lines[i + 1]))) {
        amounts = amountsIn(lines[i + 1])
      }
      ANY_TOTAL_KEY.lastIndex = 0
      if (amounts.length === 0) continue
      const value = rule.pick === 'first' ? amounts[0] : amounts[amounts.length - 1]
      // Priorité à la meilleure confiance ; à confiance égale, la dernière occurrence (les totaux sont en bas).
      if (rule.confidence >= best.confidence) best = { value, confidence: rule.confidence }
      break
    }
  })
  return best
}

const TTC_RULES: KeyRule[] = [
  { re: /total\s+t\.?t\.?c|montant\s+t\.?t\.?c|net\s+t\.?t\.?c|total\s+facture\s+ttc/, confidence: 0.95, pick: 'last' },
  { re: /net\s+a\s+payer|total\s+a\s+payer|reste\s+a\s+payer|montant\s+a\s+payer|a\s+regler/, confidence: 0.9, pick: 'last' },
  { re: /total\s+general|\bt\.?t\.?c\b/, confidence: 0.8, pick: 'last' },
  { re: /(?<!sous[- ]?)(?<!sous )\btotal\b(?!\s*(?:h\.?t|hors|tva))/, confidence: 0.6, pick: 'last' },
]
const HT_RULES: KeyRule[] = [
  { re: /total\s+h\.?t\.?(?![a-z])|montant\s+h\.?t|net\s+h\.?t|base\s+h\.?t|total\s+hors\s+tax|sous[- ]total\s+h\.?t/, confidence: 0.9, pick: 'first' },
  { re: /\bh\.?t\b/, confidence: 0.6, pick: 'first' },
]
const VAT_RULES: KeyRule[] = [
  { re: /total\s+tva|montant\s+tva|dont\s+tva/, confidence: 0.9, pick: 'last' },
  { re: /\btva\b|t\.v\.a\.?/, confidence: 0.8, pick: 'last' },
]
const VAT_SKIP = /intracom|n\W*\s*tva|numero\s+de\s+tva|\bfr\s?\d{2}\s?\d{9}/

const near = (a: number, b: number) => Math.abs(a - b) <= 0.02

function resolveAmounts(
  lines: string[],
  text: string,
): Pick<ParsedInvoice, 'amountTTC' | 'amountHT' | 'vat'> {
  let ttc = findByKeywords(lines, TTC_RULES)
  let ht = findByKeywords(lines, HT_RULES)
  let vat = findByKeywords(lines, VAT_RULES, VAT_SKIP)

  // Cohérence HT + TVA = TTC
  if (ttc.value != null && ht.value != null && vat.value != null) {
    if (near(ht.value + vat.value, ttc.value)) {
      const c = 0.98
      ttc = { ...ttc, confidence: Math.max(ttc.confidence, c) }
      ht = { ...ht, confidence: Math.max(ht.confidence, c) }
      vat = { ...vat, confidence: Math.max(vat.confidence, c) }
    } else {
      ttc = { ...ttc, confidence: Math.min(ttc.confidence, 0.5) }
      ht = { ...ht, confidence: Math.min(ht.confidence, 0.5) }
      vat = { ...vat, confidence: Math.min(vat.confidence, 0.5) }
    }
  } else if (ttc.value != null && ht.value != null) {
    vat = ht.value <= ttc.value
      ? { value: Math.round((ttc.value - ht.value) * 100) / 100, confidence: 0.6 }
      : vat
  } else if (ht.value != null && vat.value != null) {
    ttc = { value: Math.round((ht.value + vat.value) * 100) / 100, confidence: 0.6 }
  } else if (ttc.value != null && vat.value != null && vat.value < ttc.value) {
    ht = { value: Math.round((ttc.value - vat.value) * 100) / 100, confidence: 0.6 }
  }

  if (ttc.value == null) {
    const all = amountsIn(text)
    if (all.length) ttc = { value: Math.max(...all), confidence: 0.35 }
  }
  return { amountTTC: ttc, amountHT: ht, vat }
}

// ───────────────────────── Dates ─────────────────────────

const MONTHS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, mar: 3, avril: 4, avr: 4,
  mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12,
}

const DATE_NUM_RE = /(?<![\d/.-])(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})(?![\d])/g
const DATE_ISO_RE = /(?<![\d/.-])(\d{4})-(\d{2})-(\d{2})(?!\d)/g
const DATE_TXT_RE = new RegExp(
  `(?<![\\d])(\\d{1,2})(?:er)?\\s+(${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')})\\.?\\s+(\\d{4}|\\d{2})(?!\\d)`,
  'g',
)

export function toIso(d: number, m: number, yRaw: number): string | null {
  const nowYear = new Date().getFullYear()
  let y = yRaw
  if (yRaw < 100) y = yRaw <= (nowYear + 1) % 100 ? 2000 + yRaw : 1900 + yRaw
  if (y < 1990 || y > nowYear + 1) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const DATE_EXCLUDE = /echeance|expir|validite|valable|naissance|mise en circulation|1ere immat|premiere immat|livraison|avant le|limite|prochain|proch\./
const DATE_KEY = /date|facture|fait le|emis|edit|intervention|controle du|le\s+\d/

export function parseDate(text: string): Field<string> {
  const lines = text.split('\n')
  const cands: { iso: string; conf: number; order: number }[] = []
  let order = 0
  for (const line of lines) {
    const f = fold(line)
    const excluded = DATE_EXCLUDE.test(f)
    const keyed = DATE_KEY.test(f)
    const push = (iso: string | null) => {
      if (!iso) return
      cands.push({ iso, conf: excluded ? 0.2 : keyed ? 0.9 : 0.6, order: order++ })
    }
    for (const m of f.matchAll(DATE_NUM_RE)) push(toIso(+m[1], +m[2], +m[3]))
    for (const m of f.matchAll(DATE_ISO_RE)) push(toIso(+m[3], +m[2], +m[1]))
    for (const m of f.matchAll(DATE_TXT_RE)) push(toIso(+m[1], MONTHS[m[2]], +m[3]))
  }
  if (!cands.length) return none()
  cands.sort((a, b) => b.conf - a.conf || a.order - b.order)
  const best = cands[0]
  // Plusieurs dates distinctes sans mot-clé : l'ambiguïté baisse la confiance.
  const distinctTop = new Set(cands.filter((c) => c.conf === best.conf).map((c) => c.iso))
  const conf = best.conf === 0.6 && distinctTop.size > 1 ? 0.5 : best.conf
  return { value: best.iso, confidence: conf }
}

// ───────────────────────── Kilométrage ─────────────────────────

const NUM = '(\\d{1,3}(?:[ .]\\d{3})+|\\d{1,6})'
const KM_KEY_RES = [
  new RegExp(`(?:kilometrage|km\\s+au\\s+compteur|km\\s+compteur|compteur|km\\s+releves?|km\\s+actuels?)\\s*(?:de\\s+)?[:=]?\\s*(?:environ\\s+)?(?<![\\d.,])${NUM}(?![\\d,]\\d)`),
  new RegExp(`\\bkms?\\s*[:=]\\s*${NUM}(?![\\d,]\\d)`),
]
const KM_SUFFIX_RE = new RegExp(`(?<![\\d.,/])${NUM}\\s*(?:km|kms|kilometres?)\\b(?!\\s*/)`, 'g')

function kmValue(s: string): number {
  return Number(s.replace(/[ .]/g, ''))
}

export function parseKm(text: string): Field<number> {
  const lines = text.split('\n')
  for (const line of lines) {
    const f = fold(line)
    for (const re of KM_KEY_RES) {
      const m = re.exec(f)
      if (m) {
        const v = kmValue(m[1])
        if (v >= 1 && v < 1_000_000) return { value: v, confidence: 0.9 }
      }
    }
  }
  for (const line of lines) {
    const f = fold(line)
    if (/l\s*\/\s*100|g\s*\/\s*km|garantie|forfait/.test(f)) continue
    for (const m of f.matchAll(KM_SUFFIX_RE)) {
      const v = kmValue(m[1])
      if (v >= 100 && v < 1_000_000) return { value: v, confidence: 0.7 }
    }
  }
  return none()
}

// ───────────────────────── Plaque ─────────────────────────

const PLATE_SIV = /(?<![A-Z0-9])([A-HJ-NP-TV-Z]{2})\s?[-–.]?\s?(\d{3})\s?[-–.]?\s?([A-HJ-NP-TV-Z]{2})(?![A-Z0-9])/
const PLATE_FNI = /(?<![A-Z0-9])(\d{1,4})\s?[-–]?\s?([A-Z]{2,3})\s?[-–]?\s?(\d{2,3})(?![A-Z0-9])/
const PLATE_KEY = /immat|plaque|vehicule|v[eé]hicule/i

export function parsePlate(text: string): Field<string> {
  const lines = text.split('\n')
  for (const line of lines) {
    const up = line.toUpperCase().replace(/[ÀÂÄ]/g, 'A')
    const m = PLATE_SIV.exec(up)
    if (m) return { value: `${m[1]}-${m[2]}-${m[3]}`, confidence: PLATE_KEY.test(line) ? 0.95 : 0.8 }
  }
  for (const line of lines) {
    if (!PLATE_KEY.test(line)) continue
    const m = PLATE_FNI.exec(line.toUpperCase())
    if (m) return { value: `${m[1]} ${m[2]} ${m[3]}`, confidence: 0.6 }
  }
  return none()
}

// ───────────────────────── Garage ─────────────────────────

const GARAGE_KEY =
  /garage|automobile|\bauto\b|carrosserie|centre auto|norauto|midas|speedy|feu vert|euromaster|point s\b|vulco|roady|motors?|ets\b|sarl|\bsas\b|eurl|pneu|mecanique|concession|dekra|autosur|securitest|norisko|autocontrol|renault|peugeot|citroen|dacia|toyota|volkswagen|opel|ford|fiat|nissan|bmw|audi|mercedes/
const GARAGE_SKIP =
  /^\s*(facture|devis|avoir|bon de|ordre de reparation|duplicata|original|page|date|client|n\W)|@|www\.|https?:|\btel\b|\bfax\b|siret|siren|\brcs\b|\bape\b|iban|bic\b|^\s*[\d\W]+$/

export function parseGarage(text: string): Field<string> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12)
  for (const line of lines) {
    const f = fold(line)
    if (GARAGE_SKIP.test(f) || line.length < 3 || line.length > 60) continue
    if (GARAGE_KEY.test(f)) return { value: cleanGarage(line), confidence: 0.75 }
  }
  for (const line of lines.slice(0, 3)) {
    const f = fold(line)
    if (GARAGE_SKIP.test(f) || line.length < 3 || line.length > 60) continue
    if (/[a-z]{3}/.test(f)) return { value: cleanGarage(line), confidence: 0.35 }
  }
  return none()
}

const cleanGarage = (s: string) => s.replace(/\s{2,}/g, ' ').replace(/^[\W_]+|[\W_]+$/g, '')

// ───────────────────────── Type ─────────────────────────

const TYPE_RULES: { type: EntryType; weight: number; re: RegExp }[] = [
  { type: 'controle_technique', weight: 3, re: /controle technique|proces[- ]verbal de controle|\bct periodique|contre[- ]visite|dekra|autosur|securitest|norisko|autocontrol/g },
  { type: 'vidange', weight: 2, re: /vidange|huile moteur|filtre a huile|filtre a air|filtre habitacle|filtre a carburant|revision|entretien periodique|\b\d{1,2}w[- ]?\d{2}\b/g },
  { type: 'pneus', weight: 2, re: /pneus?|pneumatiques?|equilibrage|parallelisme|geometrie|montage pneu|valve|michelin|continental|bridgestone|goodyear|pirelli|dunlop/g },
  { type: 'freins', weight: 2, re: /plaquettes?|disques? de frein|disques?\b|freins?|etriers?|liquide de frein|tambours?|machoires?/g },
  { type: 'courroie', weight: 2, re: /courroie|distribution|galet|pompe a eau|kit de distribution|tendeur/g },
  { type: 'carrosserie', weight: 2, re: /carrosserie|peinture|pare[- ]?chocs|debosselage|tolerie|vernis|aile avant|aile arriere|retroviseur|portiere/g },
]

export function parseType(text: string): Field<EntryType> {
  const f = fold(text)
  const scores = TYPE_RULES.map((r) => ({
    type: r.type,
    hits: (f.match(r.re) ?? []).length,
    score: (f.match(r.re) ?? []).length * r.weight,
  })).filter((s) => s.hits > 0)
  if (!scores.length) return { value: 'autre', confidence: 0.2 }
  scores.sort((a, b) => b.score - a.score)
  const [first, second] = scores
  const tie = second && second.score >= first.score * 0.8
  const conf = Math.min(0.9, 0.5 + 0.1 * first.hits) - (tie ? 0.25 : 0)
  return { value: first.type, confidence: Math.max(0.3, Number(conf.toFixed(2))) }
}

// ───────────────────────── API ─────────────────────────

export function parseInvoice(rawText: string): ParsedInvoice {
  const text = normalizeText(rawText ?? '')
  const lines = text.split('\n')
  return {
    date: parseDate(text),
    ...resolveAmounts(lines, text),
    km: parseKm(text),
    plate: parsePlate(text),
    garage: parseGarage(text),
    type: parseType(text),
  }
}
