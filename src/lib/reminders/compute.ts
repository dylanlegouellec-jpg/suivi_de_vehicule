import type { Entry, ReminderRule, Vehicle } from '../../db/schema'
import { nextTechnicalInspection } from './ctRule'
import { addMonths, daysBetween } from './dates'

export const SOON_DAYS = 30
export const SOON_KM = 1000
/** Pour comparer jours et km lors du tri : ~40 km parcourus par jour. */
const KM_PER_DAY = 40

export type ReminderState = 'overdue' | 'soon' | 'later' | 'unknown'

export interface ReminderContext {
  /** Date du jour, ISO yyyy-mm-dd. */
  today: string
  vehicle: Pick<Vehicle, 'mileage' | 'firstRegistration'>
  entries: Pick<Entry, 'type' | 'date' | 'km'>[]
}

export interface ReminderResult {
  rule: ReminderRule
  state: ReminderState
  dueDate: string | null
  dueKm: number | null
  daysLeft: number | null
  kmLeft: number | null
  lastDate: string | null
  lastKm: number | null
  /** Explication quand l'état est « unknown ». */
  reason?: string
}

function lastDone(rule: ReminderRule, entries: ReminderContext['entries']) {
  let best: { date: string; km: number | null } | null = null
  if (rule.type !== 'personnalise') {
    for (const e of entries) {
      if (e.type === rule.type && (!best || e.date > best.date)) best = { date: e.date, km: e.km }
    }
  }
  if (rule.baseDate && (!best || rule.baseDate > best.date)) {
    best = { date: rule.baseDate, km: rule.baseKm ?? null }
  }
  return best
}

export function computeReminder(rule: ReminderRule, ctx: ReminderContext): ReminderResult {
  const last = lastDone(rule, ctx.entries)
  const base = {
    rule, dueDate: null as string | null, dueKm: null as number | null,
    daysLeft: null as number | null, kmLeft: null as number | null,
    lastDate: last?.date ?? null, lastKm: last?.km ?? null,
  }

  let dueDate: string | null = null
  let dueKm: number | null = null

  if (rule.type === 'controle_technique') {
    dueDate = nextTechnicalInspection(ctx.vehicle.firstRegistration, last?.date ?? null)
    if (!dueDate)
      return { ...base, state: 'unknown', reason: 'Renseignez la date de mise en circulation du véhicule ou la date du dernier contrôle.' }
  } else {
    if (!last) return { ...base, state: 'unknown', reason: 'Aucun historique : indiquez la dernière fois que ce point a été fait.' }
    if (rule.everyMonths) dueDate = addMonths(last.date, rule.everyMonths)
  }
  if (rule.everyKm && last?.km != null) dueKm = last.km + rule.everyKm

  if (dueDate == null && dueKm == null)
    return { ...base, state: 'unknown', reason: 'Kilométrage manquant sur le dernier entretien, ou aucune périodicité définie.' }

  const daysLeft = dueDate ? daysBetween(ctx.today, dueDate) : null
  const kmLeft = dueKm != null && ctx.vehicle.mileage != null ? dueKm - ctx.vehicle.mileage : null

  let state: ReminderState = 'later'
  if ((daysLeft != null && daysLeft < 0) || (kmLeft != null && kmLeft < 0)) state = 'overdue'
  else if ((daysLeft != null && daysLeft <= SOON_DAYS) || (kmLeft != null && kmLeft <= SOON_KM)) state = 'soon'

  return { ...base, state, dueDate, dueKm, daysLeft, kmLeft }
}

/** Urgence en « jours équivalents » : plus c'est petit, plus c'est urgent. */
export function urgency(r: ReminderResult): number {
  const d = r.daysLeft ?? Infinity
  const k = r.kmLeft != null ? r.kmLeft / KM_PER_DAY : Infinity
  return Math.min(d, k)
}

export function sortReminders<T extends ReminderResult>(items: T[]): T[] {
  return [...items].sort((a, b) => urgency(a) - urgency(b))
}

export function groupReminders<T extends ReminderResult>(items: T[]): Record<ReminderState, T[]> {
  const out: Record<ReminderState, T[]> = { overdue: [], soon: [], later: [], unknown: [] }
  for (const it of sortReminders(items)) out[it.state].push(it)
  return out
}
