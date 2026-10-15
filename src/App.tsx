import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { VehicleProvider } from './vehicleContext'
import Header from './components/Header'
import TabBar, { type Tab } from './components/TabBar'
import SideNav from './components/SideNav'
import HistoryScreen from './screens/HistoryScreen'
import EntryDetailScreen from './screens/EntryDetailScreen'
import AddScreen from './screens/AddScreen'
import ImportScreen from './screens/ImportScreen'
import EntryForm from './components/EntryForm'
import { db } from './db/db'
import { useLiveQuery } from 'dexie-react-hooks'
import StatsScreen from './screens/StatsScreen'
import FuelScreen from './screens/FuelScreen'
import VehiclesScreen from './screens/VehiclesScreen'
import SettingsScreen from './screens/SettingsScreen'
import HomeScreen from './screens/HomeScreen'
import RemindersScreen from './screens/RemindersScreen'
import { requestPersistence } from './lib/storage'
import AuthScreen from './screens/AuthScreen'
import SharingScreen from './screens/SharingScreen'
import { initAuth, syncNow } from './sync/session'
import { useAuth } from './sync/hooks'
import { MotionRoot, spring } from './ui/motion'
import Splash from './ui/Splash'
import ToastHost from './ui/Toast'
import ConfettiHost from './ui/Confetti'
import AuroraBackground from './ui/AuroraBackground'
import PullToRefresh from './ui/PullToRefresh'
import { NAV_ITEMS } from './components/TabBar'
import { useReminders } from './lib/reminders/useReminders'
import type { EntryType } from './db/schema'

/** Les écrans glissent dans le sens de la navigation : avancer = depuis la droite, revenir = depuis la gauche. */
const pageVariants: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d * 56, scale: 0.985 }),
  center: { opacity: 1, x: 0, scale: 1, transition: spring },
  exit: (d: number) => ({ opacity: 0, x: -d * 56, scale: 0.985, transition: { duration: 0.16, ease: 'easeIn' } }),
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [showVehicles, setShowVehicles] = useState(false)
  const [entryId, setEntryId] = useState<number | null>(null)
  const [importFiles, setImportFiles] = useState<File[] | null>(null)
  const [showReminders, setShowReminders] = useState(false)
  const [auth, setAuth] = useState<'login' | 'register' | null>(null)
  // Lien reçu par e-mail : /?reset=<jeton>&email=<adresse> ; on le retire aussitôt de la barre d'adresse.
  const [resetLink, setResetLink] = useState<{ token: string; email: string } | null>(() => {
    const q = new URLSearchParams(window.location.search)
    const token = q.get('reset')
    if (!token) return null
    window.history.replaceState(null, '', window.location.pathname)
    return { token, email: q.get('email') ?? '' }
  })
  const [sharing, setSharing] = useState<number | null>(null)
  const sharedVehicle = useLiveQuery(() => (sharing != null ? db.vehicles.get(sharing) : undefined), [sharing])
  const [fuel, setFuel] = useState<{ startNew: boolean } | null>(null)
  const [form, setForm] = useState<{ id?: number; vehicleId?: number; type?: EntryType } | null>(null)
  const reminders = useReminders()
  const badge = reminders?.filter((r) => r.state === 'overdue' || r.state === 'soon').length ?? 0
  const { user } = useAuth()
  const mainRef = useRef<HTMLElement>(null)
  const editing = useLiveQuery(() => (form?.id != null ? db.entries.get(form.id) : undefined), [form?.id])

  useEffect(() => { void requestPersistence(); void initAuth() }, [])

  const go = (t: Tab) => { setShowVehicles(false); setShowReminders(false); setAuth(null); setResetLink(null); setSharing(null); setFuel(null); setEntryId(null); setForm(null); setImportFiles(null); setTab(t) }

  let content
  if (resetLink) content = <AuthScreen resetToken={resetLink.token} initialEmail={resetLink.email} onClose={() => setResetLink(null)} />
  else if (auth) content = <AuthScreen initialMode={auth} onClose={() => setAuth(null)} />
  else if (sharing != null && sharedVehicle) content = <SharingScreen vehicle={sharedVehicle} onBack={() => setSharing(null)} />
  else if (importFiles) content = <ImportScreen files={importFiles} onDone={() => { setImportFiles(null); setTab('history') }} />
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
  else if (fuel) content = <FuelScreen key={String(fuel.startNew)} startNew={fuel.startNew} onBack={() => setFuel(null)} />
  else if (showReminders) content = (
    <RemindersScreen
      onBack={() => setShowReminders(false)}
      onDone={(vehicleId, type) => setForm({ vehicleId, type: type === 'personnalise' ? 'autre' : type })}
    />
  )
  else if (showVehicles) content = <VehiclesScreen onBack={() => setShowVehicles(false)} onShare={setSharing} />
  else if (tab === 'home') content = <HomeScreen onManageVehicles={() => setShowVehicles(true)} onOpenReminders={() => setShowReminders(true)} onOpenBackup={() => go('settings')} onOpenEntry={setEntryId} />
  else if (tab === 'history') content = <HistoryScreen onOpen={setEntryId} onAdd={() => setForm({})} />
  else if (tab === 'add') content = <AddScreen onManual={() => setForm({})} onFiles={setImportFiles} onFuel={() => setFuel({ startNew: true })} />
  else if (tab === 'stats') content = <StatsScreen onOpenFuel={() => setFuel({ startNew: false })} />
  else content = <SettingsScreen onManageVehicles={() => setShowVehicles(true)} onOpenReminders={() => setShowReminders(true)} onLogin={setAuth} />

  // Identifiant de la vue affichée et profondeur de navigation (0 = onglet, 1 = écran ouvert, 2 = écran dans un écran)
  const view = resetLink ? { key: 'reset', depth: 2 }
    : auth ? { key: 'auth', depth: 1 }
    : sharing != null ? { key: 'sharing', depth: 2 }
    : importFiles ? { key: 'import', depth: 1 }
    : form ? { key: `form-${form.id ?? 'new'}`, depth: entryId != null ? 2 : 1 }
    : entryId != null ? { key: `entry-${entryId}`, depth: 1 }
    : fuel ? { key: 'fuel', depth: 1 }
    : showReminders ? { key: 'reminders', depth: 1 }
    : showVehicles ? { key: 'vehicles', depth: 1 }
    : { key: `tab-${tab}`, depth: 0 }
  const tabIndex = NAV_ITEMS.findIndex((i) => i.id === tab)
  const prev = useRef({ depth: 0, tab: 0 })
  const direction = view.depth !== prev.current.depth ? Math.sign(view.depth - prev.current.depth) : Math.sign(tabIndex - prev.current.tab) || 1
  useEffect(() => { prev.current = { depth: view.depth, tab: tabIndex } })

  return (
    <MotionRoot>
      <VehicleProvider>
        <AuroraBackground />
        <div className="relative z-10 flex h-full">
          <SideNav current={tab} onChange={go} badges={{ home: badge }} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header onManageVehicles={() => setShowVehicles(true)} />
            <main
              ref={mainRef}
              className="relative z-0 flex-1 overflow-y-auto overflow-x-hidden pb-10 pt-3 rail:pb-6"
              style={{ paddingLeft: 'calc(1rem + env(safe-area-inset-left))', paddingRight: 'calc(1rem + env(safe-area-inset-right))' }}
            >
              <PullToRefresh scrollRef={mainRef} enabled={!!user} onRefresh={syncNow}>
                <div className="relative mx-auto w-full max-w-xl rail:max-w-3xl desktop:max-w-6xl">
                  <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                    <motion.div key={view.key} custom={direction} variants={pageVariants} initial="enter" animate="center" exit="exit">
                      {content}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </PullToRefresh>
            </main>
            <TabBar current={tab} onChange={go} badges={{ home: badge }} />
          </div>
        </div>
        <ToastHost />
        <ConfettiHost />
        <Splash />
      </VehicleProvider>
    </MotionRoot>
  )
}
