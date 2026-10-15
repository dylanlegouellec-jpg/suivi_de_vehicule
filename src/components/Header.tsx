import { useEffect, useState } from 'react'
import { useVehicles } from '../vehicleContext'
import { Wordmark } from './Logo'
import { useAuth, useSyncStatus } from '../sync/hooks'

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
  const { user } = useAuth()
  const sync = useSyncStatus()
  return (
    <header
      className="flex shrink-0 items-center gap-2 bg-brand pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white short:pb-1 short:pt-[calc(env(safe-area-inset-top)+0.25rem)]"
      style={{ paddingLeft: 'calc(1rem + env(safe-area-inset-left))', paddingRight: 'calc(1rem + env(safe-area-inset-right))' }}
    >
      <h1 aria-label="AutoSuivi"><Wordmark /></h1>
      {!online && <span role="status" className="rounded-full bg-white/25 px-2 py-0.5 text-xs">Hors ligne</span>}
      {online && user && sync.state === 'syncing' && <span role="status" className="rounded-full bg-white/25 px-2 py-0.5 text-xs">Synchro…</span>}
      {online && user && sync.state === 'error' && <span role="alert" className="rounded-full bg-red-600 px-2 py-0.5 text-xs">Erreur synchro</span>}
      <div className="ml-auto min-w-0 max-w-[60%] flex-1 desktop:max-w-xs">
        {vehicles && vehicles.length > 0 ? (
          <>
            <label htmlFor="active-vehicle" className="sr-only">Véhicule actif</label>
            <select
              id="active-vehicle"
              className="min-h-[44px] w-full rounded-xl bg-white/20 px-3 text-white short:min-h-[40px]"
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
