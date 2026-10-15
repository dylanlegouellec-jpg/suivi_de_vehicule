import { useEffect, useState } from 'react'
import { useVehicles } from '../vehicleContext'
import { useAuth, useSyncStatus } from '../sync/hooks'
import { Wordmark } from './Logo'

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

const pill = 'rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-medium'

export default function Header({ onManageVehicles }: { onManageVehicles: () => void }) {
  const { vehicles, active, setActiveId } = useVehicles()
  const online = useOnline()
  const { user } = useAuth()
  const sync = useSyncStatus()
  return (
    <header
      className="relative z-30 flex shrink-0 items-center gap-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.6rem)] short:pb-1 short:pt-[calc(env(safe-area-inset-top)+0.25rem)]"
      style={{
        paddingLeft: 'calc(1rem + env(safe-area-inset-left))', paddingRight: 'calc(1rem + env(safe-area-inset-right))',
        background: 'var(--header-bg)', color: 'rgb(var(--header-fg))', borderBottom: '1px solid var(--header-border)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <h1 aria-label="AutoSuivi"><Wordmark /></h1>
      {!online && <span role="status" className={pill}>Hors ligne</span>}
      {online && user && sync.state === 'syncing' && <span role="status" className={`${pill} animate-pulse`}>Synchro…</span>}
      {online && user && sync.state === 'error' && <span role="alert" className={`${pill} bg-danger text-white`}>Erreur synchro</span>}
      <div className="ml-auto min-w-0 max-w-[60%] flex-1 desktop:max-w-xs">
        {vehicles && vehicles.length > 0 ? (
          <>
            <label htmlFor="active-vehicle" className="sr-only">Véhicule actif</label>
            <select
              id="active-vehicle"
              className="field min-h-[44px] w-full short:min-h-[40px]"
              value={active?.id ?? ''}
              onChange={(e) => setActiveId(Number(e.target.value))}
            >
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </>
        ) : (
          <button className="btn-primary w-full" onClick={onManageVehicles}>Ajouter un véhicule</button>
        )}
      </div>
    </header>
  )
}
