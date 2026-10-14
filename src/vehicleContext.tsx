import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting } from './db/db'
import type { Vehicle } from './db/schema'
import { useRoles, type Role } from './sync/hooks'

interface Ctx {
  vehicles: Vehicle[] | undefined
  active: Vehicle | undefined
  setActiveId: (id: number) => void
  /** Rôle de l'utilisateur sur un véhicule (« owner » pour un véhicule local). */
  roleOf: (vehicleId: number | null | undefined) => Role
  /** false pour un véhicule partagé en lecture seule. */
  canEdit: (vehicleId: number | null | undefined) => boolean
  /** Véhicules sur lesquels on peut écrire. */
  writable: Vehicle[] | undefined
}

const VehicleCtx = createContext<Ctx>({ vehicles: undefined, active: undefined, setActiveId: () => {}, roleOf: () => 'owner', canEdit: () => true, writable: undefined })
export const useVehicles = () => useContext(VehicleCtx)

export function VehicleProvider({ children }: { children: ReactNode }) {
  const vehicles = useLiveQuery(() => db.vehicles.orderBy('name').toArray(), [])
  const [activeId, setId] = useState<number | null>(null)
  const roles = useRoles()

  useEffect(() => { getSetting<number | null>('activeVehicleId', null).then(setId) }, [])

  const active = vehicles?.find((v) => v.id === activeId) ?? vehicles?.[0]

  const setActiveId = (id: number) => {
    setId(id)
    void setSetting('activeVehicleId', id)
  }

  const roleOf = (id: number | null | undefined): Role => {
    const uid = vehicles?.find((v) => v.id === id)?.uid
    return (uid && roles[uid]) || 'owner'
  }
  const canEdit = (id: number | null | undefined) => roleOf(id) !== 'viewer'
  const writable = vehicles?.filter((v) => canEdit(v.id))

  return <VehicleCtx.Provider value={{ vehicles, active, setActiveId, roleOf, canEdit, writable }}>{children}</VehicleCtx.Provider>
}
