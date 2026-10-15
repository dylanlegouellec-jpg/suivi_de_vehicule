import { motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { getLastBackupAt } from '../db/backup'
import { db } from '../db/db'
import { ENTRY_TYPE_LABELS } from '../lib/entryTypes'
import { formatDate, formatEuro, todayIso } from '../lib/format'
import { backupDue } from '../lib/backup/format'
import { groupReminders, reminderProgress } from '../lib/reminders/compute'
import { useReminders } from '../lib/reminders/useReminders'
import { computeConsumption } from '../lib/stats/fuel'
import { costByMonth, buildCostItems } from '../lib/stats/stats'
import { FUEL_LABELS } from '../db/schema'
import { useVehicles } from '../vehicleContext'
import EmptyState from '../components/EmptyState'
import PlateDisplay from '../components/PlateDisplay'
import ReminderCard, { RingCenter, STATE_COLOR } from '../components/ReminderCard'
import AnimatedNumber from '../ui/AnimatedNumber'
import { itemVariants, listVariants } from '../ui/motion'
import Odometer from '../ui/Odometer'
import Ring from '../ui/Ring'
import TiltCard from '../ui/TiltCard'

export default function HomeScreen({ onManageVehicles, onOpenReminders, onOpenBackup, onOpenEntry }: {
  onManageVehicles: () => void
  onOpenReminders: () => void
  onOpenBackup: () => void
  onOpenEntry: (id: number) => void
}) {
  const { vehicles, active } = useVehicles()
  const reminders = useReminders()
  const mine = useMemo(() => (reminders && active ? groupReminders(reminders.filter((r) => r.vehicle.id === active.id)) : null), [reminders, active])
  const ordered = mine ? [...mine.overdue, ...mine.soon, ...mine.later] : []
  const unknownCount = mine?.unknown.length ?? 0

  const needBackup = useLiveQuery(async () => {
    const [last, vs, hasEntries] = await Promise.all([getLastBackupAt(), db.vehicles.toArray(), db.entries.count()])
    if (!vs.length && !hasEntries) return false
    return backupDue({ lastBackupAt: last, firstDataAt: vs.length ? Math.min(...vs.map((v) => v.createdAt)) : null, now: Date.now() })
  }, [])

  // Chiffres du véhicule actif : consommation moyenne, dépenses du mois, dernières entrées
  const stats = useLiveQuery(async () => {
    if (active?.id == null) return null
    const [entries, fuel] = await Promise.all([db.entries.where('vehicleId').equals(active.id).toArray(), db.fuelLogs.where('vehicleId').equals(active.id).toArray()])
    const month = todayIso().slice(0, 7)
    const thisMonth = costByMonth(buildCostItems(entries, fuel)).find((m) => m.key === month)?.total ?? 0
    return {
      consumption: computeConsumption(fuel).average,
      thisMonth,
      recent: [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3),
    }
  }, [active?.id])

  if (!vehicles) return <div className="space-y-3" role="status" aria-label="Chargement"><div className="skeleton h-40" /><div className="skeleton h-24" /><div className="skeleton h-24" /></div>
  if (!active)
    return (
      <EmptyState icon="🚗" title="Bienvenue sur AutoSuivi" text="Commencez par ajouter votre premier véhicule.">
        <button className="btn-primary mt-2" onClick={onManageVehicles}>Ajouter un véhicule</button>
      </EmptyState>
    )

  const urgent = (mine?.overdue.length ?? 0) + (mine?.soon.length ?? 0)

  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-4 desktop:grid desktop:grid-cols-2 desktop:items-start desktop:gap-5 desktop:space-y-0">
      {needBackup && (
        <motion.button variants={itemVariants} whileTap={{ scale: 0.98 }} className="w-full rounded-card bg-warn/15 p-4 text-left ring-1 ring-warn/60 desktop:col-span-2" onClick={onOpenBackup}>
          <strong>💾 Sauvegarde recommandée</strong>
          <span className="block text-sm text-muted">Aucune sauvegarde depuis plus de 30 jours. Touchez pour exporter vos données.</span>
        </motion.button>
      )}

      <div className="space-y-4">
        <motion.div variants={itemVariants}>
          <p className="text-sm text-muted">Votre véhicule</p>
          <div className="flex items-center justify-between gap-3">
            <h2 className="truncate text-3xl font-extrabold tracking-tight">{active.name}</h2>
            <PlateDisplay plate={active.plate} />
          </div>
          <p className="text-sm text-muted">{[active.brand, active.model, FUEL_LABELS[active.fuel]].filter(Boolean).join(' · ')}</p>
        </motion.div>

        <motion.div variants={itemVariants}>
          <TiltCard>
            <div className="hero sheen">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">Compteur</p>
              <div className="mt-2 flex items-end gap-2">
                {active.mileage != null ? <Odometer value={active.mileage} /> : <span className="text-2xl font-bold opacity-70">Kilométrage non renseigné</span>}
                {active.mileage != null && <span className="pb-1 text-sm font-semibold opacity-70">km</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="chip">⛽ {stats?.consumption != null ? <><AnimatedNumber value={stats.consumption} format={(n) => n.toFixed(1).replace('.', ',')} /> L/100 km</> : '— L/100 km'}</span>
                <span className="chip">💶 {stats ? <AnimatedNumber value={stats.thisMonth} format={(n) => formatEuro(n)} /> : '—'} ce mois</span>
              </div>
            </div>
          </TiltCard>
        </motion.div>

        {stats && stats.recent.length > 0 && (
          <motion.section variants={itemVariants} aria-label="Dernières entrées" className="space-y-2">
            <h3 className="font-semibold">Dernières entrées</h3>
            {stats.recent.map((e) => (
              <motion.button key={e.id} whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} onClick={() => onOpenEntry(e.id!)} className="card flex w-full items-center gap-3 !p-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{ENTRY_TYPE_LABELS[e.type]}</span>
                  <span className="block truncate text-xs text-muted">{formatDate(e.date)}{e.garage && ` · ${e.garage}`}</span>
                </span>
                <span className="font-semibold">{e.amount != null ? formatEuro(e.amount) : '—'}</span>
              </motion.button>
            ))}
          </motion.section>
        )}
      </div>

      <motion.section variants={itemVariants} aria-label="À faire" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">
            Échéances {urgent > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="ml-1 rounded-full bg-danger px-2 py-0.5 align-middle text-xs text-white">{urgent}</motion.span>}
          </h3>
          <button className="min-h-[44px] px-2 text-sm font-semibold text-accent" onClick={onOpenReminders}>Tout voir / gérer</button>
        </div>

        {!mine ? (
          <div className="space-y-2"><div className="skeleton h-24" /><div className="skeleton h-24" /></div>
        ) : ordered.length === 0 && unknownCount === 0 ? (
          <button className="card w-full text-left text-sm" onClick={onOpenReminders}>🔔 Aucun rappel configuré. Touchez pour ajouter les rappels par défaut.</button>
        ) : (
          <>
            {ordered.length > 0 && (
              <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2" aria-label="Jauges d'échéances">
                {ordered.slice(0, 8).map((r, i) => (
                  <motion.button
                    key={r.rule.id} onClick={onOpenReminders} whileTap={{ scale: 0.94 }} whileHover={{ y: -3 }}
                    initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 300, damping: 22 }}
                    className="card flex w-[104px] shrink-0 snap-start flex-col items-center gap-2 !p-3"
                  >
                    <Ring progress={reminderProgress(r) ?? 0} size={76} stroke={8} color={STATE_COLOR[r.state]} pulse={r.state === 'overdue'} delay={0.2 + i * 0.08}>
                      <RingCenter item={r} />
                    </Ring>
                    <span className="line-clamp-2 text-center text-xs font-medium leading-tight">{r.rule.label}</span>
                  </motion.button>
                ))}
              </div>
            )}
            {urgent === 0 ? (
              <p className="card text-sm">✅ Rien d'urgent pour le moment.{unknownCount > 0 && ` ${unknownCount} rappel(s) à renseigner.`}</p>
            ) : (
              <div className="space-y-2">
                {[...(mine?.overdue ?? []), ...(mine?.soon ?? [])].slice(0, 4).map((it, i) => (
                  <ReminderCard key={it.rule.id} item={it} showVehicle={false} onClick={onOpenReminders} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </motion.section>
    </motion.div>
  )
}
