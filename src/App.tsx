import { useEffect, useState } from 'react'
import { VehicleProvider } from './vehicleContext'
import Header from './components/Header'
import TabBar, { type Tab } from './components/TabBar'
import HistoryScreen from './screens/HistoryScreen'
import EntryDetailScreen from './screens/EntryDetailScreen'
import AddScreen from './screens/AddScreen'
import ImportScreen from './screens/ImportScreen'
import EntryForm from './components/EntryForm'
import { db } from './db/db'
import { useLiveQuery } from 'dexie-react-hooks'
import Placeholder from './screens/Placeholder'
import VehiclesScreen from './screens/VehiclesScreen'
import SettingsScreen from './screens/SettingsScreen'
import HomeScreen from './screens/HomeScreen'
import RemindersScreen from './screens/RemindersScreen'
import { requestPersistence } from './lib/storage'
import { useReminders } from './lib/reminders/useReminders'
import type { EntryType } from './db/schema'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [showVehicles, setShowVehicles] = useState(false)
  const [entryId, setEntryId] = useState<number | null>(null)
  const [importFiles, setImportFiles] = useState<File[] | null>(null)
  const [showReminders, setShowReminders] = useState(false)
  const [form, setForm] = useState<{ id?: number; vehicleId?: number; type?: EntryType } | null>(null)
  const reminders = useReminders()
  const badge = reminders?.filter((r) => r.state === 'overdue' || r.state === 'soon').length ?? 0
  const editing = useLiveQuery(() => (form?.id != null ? db.entries.get(form.id) : undefined), [form?.id])

  useEffect(() => { void requestPersistence() }, [])

  const go = (t: Tab) => { setShowVehicles(false); setShowReminders(false); setEntryId(null); setForm(null); setImportFiles(null); setTab(t) }

  let content
  if (importFiles) content = <ImportScreen files={importFiles} onDone={() => { setImportFiles(null); setTab('history') }} />
  else if (form) {
    if (form.id != null && !editing) content = <p role="status">Chargement…</p>
    else content = (
      <EntryForm
        key={form.id ?? 'new'}
        entry={editing}
        defaults={form.id == null ? { vehicleId: form.vehicleId, type: form.type } : undefined}
        onClose={() => setForm(null)}
        onSaved={(id) => { setForm(null); setEntryId(id) }}
      />
    )
  } else if (entryId != null) content = <EntryDetailScreen id={entryId} onBack={() => setEntryId(null)} onEdit={() => setForm({ id: entryId })} />
  else if (showReminders) content = (
    <RemindersScreen
      onBack={() => setShowReminders(false)}
      onDone={(vehicleId, type) => setForm({ vehicleId, type: type === 'personnalise' ? 'autre' : type })}
    />
  )
  else if (showVehicles) content = <VehiclesScreen onBack={() => setShowVehicles(false)} />
  else if (tab === 'home') content = <HomeScreen onManageVehicles={() => setShowVehicles(true)} onOpenReminders={() => setShowReminders(true)} />
  else if (tab === 'history') content = <HistoryScreen onOpen={setEntryId} onAdd={() => setForm({})} />
  else if (tab === 'add') content = <AddScreen onManual={() => setForm({})} onFiles={setImportFiles} />
  else if (tab === 'stats') content = <Placeholder title="Statistiques" phase={5} />
  else content = <SettingsScreen onManageVehicles={() => setShowVehicles(true)} onOpenReminders={() => setShowReminders(true)} />

  return (
    <VehicleProvider>
      <div className="mx-auto flex h-full max-w-xl flex-col">
        <Header onManageVehicles={() => setShowVehicles(true)} />
        <main className="flex-1 overflow-y-auto px-4 pb-6 pt-3">{content}</main>
        <TabBar current={tab} onChange={go} badges={{ home: badge }} />
      </div>
    </VehicleProvider>
  )
}
