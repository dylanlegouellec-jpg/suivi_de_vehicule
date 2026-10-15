import { useEffect, useState } from 'react'
import { getStorageStatus, requestPersistence, type StorageStatus } from '../lib/storage'
import { formatNumber } from '../lib/format'
import BackupSection from './BackupSection'
import AccountSection from './AccountSection'
import { useAuth } from '../sync/hooks'

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches

export default function SettingsScreen({ onManageVehicles, onOpenReminders, onLogin }: { onManageVehicles: () => void; onOpenReminders: () => void; onLogin: (mode: 'login' | 'register') => void }) {
  const { user } = useAuth()
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const refresh = () => getStorageStatus().then(setStatus)
  useEffect(() => { void refresh() }, [])

  return (
    <div className="space-y-3 desktop:columns-2 desktop:gap-4 desktop:space-y-0 columns-cards">
      <AccountSection onLogin={onLogin} />
      <section className="card">
        <h2 className="font-semibold">Véhicules</h2>
        <button className="btn-secondary mt-2 w-full" onClick={onManageVehicles}>Gérer mes véhicules</button>
      </section>
      <section className="card">
        <h2 className="font-semibold">Rappels</h2>
        <button className="btn-secondary mt-2 w-full" onClick={onOpenReminders}>Gérer les rappels et intervalles</button>
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">Stockage et sauvegarde</h2>
        <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
          {user
            ? '⚠️ Vos données sont aussi sur votre compte en ligne. Gardez tout de même une sauvegarde exportée de temps en temps.'
            : '⚠️ Vos données restent uniquement sur cet appareil. iOS peut vider le stockage des sites peu utilisés : exportez régulièrement une sauvegarde ci-dessous, ou créez un compte pour les synchroniser.'}
        </p>
        <p className="text-sm">
          Stockage persistant : <strong>{status ? (status.persisted ? 'accordé' : 'non garanti') : '…'}</strong>
        </p>
        {status?.usage != null && (
          <p className="text-sm">Utilisé : {formatNumber(Math.round(status.usage / 1024))} Ko</p>
        )}
        {status && !status.persisted && (
          <button className="btn-secondary w-full" onClick={() => requestPersistence().then(refresh)}>
            Demander le stockage persistant
          </button>
        )}
      </section>
      <BackupSection />
      {isIos && !isStandalone && (
        <section className="card text-sm">
          <h2 className="font-semibold">Installer sur l'écran d'accueil</h2>
          <p>Dans Safari, touchez <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong> : l'app s'ouvrira en plein écran et fonctionnera hors ligne.</p>
        </section>
      )}
    </div>
  )
}
