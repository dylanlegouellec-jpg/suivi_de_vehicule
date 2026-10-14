import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { authStore, syncStore } from './session'

export const useAuth = () => useSyncExternalStore(authStore.subscribe, authStore.get)
export const useSyncStatus = () => useSyncExternalStore(syncStore.subscribe, syncStore.get)

export type Role = 'owner' | 'editor' | 'viewer'

/** Rôles par uid de véhicule ; un véhicule absent de la liste est local (donc modifiable). */
export function useRoles(): Record<string, Role> {
  return useLiveQuery(async () => ((await db.settings.get('sync.roles'))?.value as Record<string, Role>) ?? {}, [], {}) ?? {}
}
