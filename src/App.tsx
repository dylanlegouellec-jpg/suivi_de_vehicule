import { useEffect, useState } from 'react'
import { VehicleProvider } from './vehicleContext'
import Header from './components/Header'
import TabBar, { type Tab } from './components/TabBar'
import Placeholder from './screens/Placeholder'
import VehiclesScreen from './screens/VehiclesScreen'
import SettingsScreen from './screens/SettingsScreen'
import HomeScreen from './screens/HomeScreen'
import { requestPersistence } from './lib/storage'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [showVehicles, setShowVehicles] = useState(false)

  useEffect(() => { void requestPersistence() }, [])

  const go = (t: Tab) => { setShowVehicles(false); setTab(t) }

  let content
  if (showVehicles) content = <VehiclesScreen onBack={() => setShowVehicles(false)} />
  else if (tab === 'home') content = <HomeScreen onManageVehicles={() => setShowVehicles(true)} />
  else if (tab === 'history') content = <Placeholder title="Historique" phase={2} />
  else if (tab === 'add') content = <Placeholder title="Ajouter" phase={2} />
  else if (tab === 'stats') content = <Placeholder title="Statistiques" phase={5} />
  else content = <SettingsScreen onManageVehicles={() => setShowVehicles(true)} />

  return (
    <VehicleProvider>
      <div className="mx-auto flex h-full max-w-xl flex-col">
        <Header onManageVehicles={() => setShowVehicles(true)} />
        <main className="flex-1 overflow-y-auto px-4 pb-6 pt-3">{content}</main>
        <TabBar current={tab} onChange={go} />
      </div>
    </VehicleProvider>
  )
}
