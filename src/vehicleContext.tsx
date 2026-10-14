import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting } from './db/db'
import type { Vehicle } from './db/schema'

interface Ctx {
  vehicles: Vehicle[] | undefined
  active: Vehicle | undefined
  setActiveId: (id: number) => void
}

const VehicleCtx = createContext<Ctx>({ vehicles: undefined, active: undefined, setActiveId: () => {} })
export const useVehicles = () => useContext(VehicleCtx)

export function VehicleProvider({ children }: { children: ReactNode }) {
  const vehicles = useLiveQuery(() => db.vehicles.orderBy('name').toArray(), [])
  const [activeId, setId] = useState<number | null>(null)

  useEffect(() => { getSetting<number | null>('activeVehicleId', null).then(setId) }, [])

  const active = vehicles?.find((v) => v.id === activeId) ?? vehicles?.[0]

  const setActiveId = (id: number) => {
    setId(id)
    void setSetting('activeVehicleId', id)
  }

  return <VehicleCtx.Provider value={{ vehicles, active, setActiveId }}>{children}</VehicleCtx.Provider>
}
