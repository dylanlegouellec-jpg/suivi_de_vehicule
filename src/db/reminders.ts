import { db } from './db'
import { DEFAULT_RULES } from '../lib/reminders/defaults'

export async function createDefaultRules(vehicleId: number): Promise<void> {
  const existing = await db.reminderRules.where('vehicleId').equals(vehicleId).toArray()
  const have = new Set(existing.map((r) => r.type))
  await db.reminderRules.bulkAdd(
    DEFAULT_RULES.filter((d) => !have.has(d.type)).map((d) => ({ ...d, vehicleId })),
  )
}
