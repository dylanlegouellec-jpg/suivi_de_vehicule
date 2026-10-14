import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Vehicle } from '../../db/schema'
import { todayIso } from '../format'
import { computeReminder, type ReminderResult } from './compute'

export interface ReminderItem extends ReminderResult {
  vehicle: Vehicle
}

/** Calcule en direct les rappels de tous les véhicules (se met à jour à chaque modification des données). */
export function useReminders(): ReminderItem[] | undefined {
  return useLiveQuery(async () => {
    const [vehicles, rules, entries] = await Promise.all([
      db.vehicles.toArray(), db.reminderRules.toArray(), db.entries.toArray(),
    ])
    const today = todayIso()
    const out: ReminderItem[] = []
    for (const rule of rules) {
      const vehicle = vehicles.find((v) => v.id === rule.vehicleId)
      if (!vehicle) continue
      const res = computeReminder(rule, {
        today,
        vehicle,
        entries: entries.filter((e) => e.vehicleId === rule.vehicleId),
      })
      out.push({ ...res, vehicle })
    }
    return out
  }, [])
}
