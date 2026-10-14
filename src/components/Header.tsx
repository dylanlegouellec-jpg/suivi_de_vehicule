import { useEffect, useState } from 'react'
import { useVehicles } from '../vehicleContext'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export default function Header({ onManageVehicles }: { onManageVehicles: () => void }) {
  const { vehicles, active, setActiveId } = useVehicles()
  const online = useOnline()
  return (
    <header
      className="flex items-center gap-2 bg-brand px-4 pb-3 text-white"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
    >
      <h1 className="text-lg font-bold">AutoSuivi</h1>
      {!online && <span role="status" className="rounded-full bg-white/25 px-2 py-0.5 text-xs">Hors ligne</span>}
      <div className="ml-auto min-w-0 flex-1 max-w-[60%]">
        {vehicles && vehicles.length > 0 ? (
          <>
            <label htmlFor="active-vehicle" className="sr-only">Véhicule actif</label>
            <select
              id="active-vehicle"
              className="min-h-[44px] w-full rounded-xl bg-white/20 px-3 text-white"
              value={active?.id ?? ''}
              onChange={(e) => setActiveId(Number(e.target.value))}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id} className="text-slate-900">{v.name}</option>
              ))}
            </select>
          </>
        ) : (
          <button className="btn w-full bg-white/20 text-white" onClick={onManageVehicles}>
            Ajouter un véhicule
          </button>
        )}
      </div>
    </header>
  )
}
