import { useState, type FormEvent } from 'react'
import { db } from '../db/db'
import { createDefaultRules } from '../db/reminders'
import { deleteRule } from '../db/mutations'
import type { ReminderRule, RuleType } from '../db/schema'
import EmptyState from '../components/EmptyState'
import ReminderCard from '../components/ReminderCard'
import { formatDate, todayIso } from '../lib/format'
import { groupReminders } from '../lib/reminders/compute'
import { RULE_TYPES, RULE_TYPE_LABELS, DEFAULT_RULES } from '../lib/reminders/defaults'
import { useReminders, type ReminderItem } from '../lib/reminders/useReminders'
import { errorMessage } from '../lib/storage'
import { useVehicles } from '../vehicleContext'

const SECTIONS = [
  { key: 'overdue', title: '🔴 En retard' },
  { key: 'soon', title: '🟠 Bientôt (30 jours / 1 000 km)' },
  { key: 'later', title: '🟢 Plus tard' },
  { key: 'unknown', title: '⚪ À renseigner' },
] as const

export default function RemindersScreen({ onBack, onDone }: {
  onBack: () => void
  /** Ouvre la saisie d'une entrée (type prérempli) pour acter un entretien. */
  onDone: (vehicleId: number, type: RuleType) => void
}) {
  const items = useReminders()
  const { vehicles, active, canEdit } = useVehicles()
  const [editing, setEditing] = useState<ReminderRule | 'new' | null>(null)
  const [selected, setSelected] = useState<ReminderItem | null>(null)

  if (editing)
    return <RuleForm rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />

  if (selected) {
    const fresh = items?.find((i) => i.rule.id === selected.rule.id) ?? selected
    return (
      <RuleDetail
        item={fresh}
        onBack={() => setSelected(null)}
        onEdit={() => { setEditing(fresh.rule); setSelected(null) }}
        onDone={onDone}
        readOnly={!canEdit(fresh.rule.vehicleId)}
      />
    )
  }

  const groups = items ? groupReminders(items) : null
  const multi = (vehicles?.length ?? 0) > 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className="btn-secondary" onClick={onBack} aria-label="Retour">←</button>
        <h2 className="text-xl font-bold">À faire</h2>
        <button className="btn-primary ml-auto" onClick={() => setEditing('new')} disabled={!vehicles?.length || !canEdit(active?.id)}>Ajouter</button>
      </div>

      {!items || !vehicles ? (
        <p role="status">Chargement…</p>
      ) : vehicles.length === 0 ? (
        <EmptyState icon="🚗" title="Aucun véhicule" text="Ajoutez un véhicule pour suivre ses échéances." />
      ) : items.length === 0 ? (
        <EmptyState icon="🔔" title="Aucun rappel" text="Créez les rappels courants (vidange, contrôle technique, pneus, courroie, assurance) avec des intervalles par défaut modifiables.">
          <button className="btn-primary mt-2" onClick={() => Promise.all(vehicles.filter((v) => canEdit(v.id)).map((v) => createDefaultRules(v.id!)))}>
            Ajouter les rappels par défaut
          </button>
        </EmptyState>
      ) : (
        SECTIONS.map(({ key, title }) =>
          groups![key].length > 0 && (
            <section key={key} aria-label={title} className="space-y-2">
              <h3 className="font-semibold">{title} <span className="text-slate-500">({groups![key].length})</span></h3>
              <div className="space-y-2 desktop:grid desktop:grid-cols-2 desktop:gap-3 desktop:space-y-0">
                {groups![key].map((it) => (
                  <ReminderCard key={it.rule.id} item={it} showVehicle={multi} onClick={() => setSelected(it)} />
                ))}
              </div>
            </section>
          ),
        )
      )}
    </div>
  )
}

function RuleDetail({ item, onBack, onEdit, onDone, readOnly }: {
  readOnly: boolean
  item: ReminderItem
  onBack: () => void
  onEdit: () => void
  onDone: (vehicleId: number, type: RuleType) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const { rule, vehicle } = item

  const markDone = async () => {
    if (rule.type !== 'personnalise') return onDone(rule.vehicleId, rule.type)
    if (!window.confirm(`Marquer « ${rule.label} » comme fait aujourd'hui ?`)) return
    try {
      await db.reminderRules.update(rule.id!, { baseDate: todayIso(), baseKm: vehicle.mileage ?? null })
      onBack()
    } catch (e) { setError(errorMessage(e)) }
  }

  const remove = async () => {
    if (!window.confirm('Supprimer ce rappel ? Vos entrées ne sont pas affectées.')) return
    await deleteRule(rule.id!)
    onBack()
  }

  const interval = [
    rule.type === 'controle_technique' ? '4 ans puis tous les 2 ans (règle française)' : rule.everyMonths ? `tous les ${rule.everyMonths} mois` : null,
    rule.everyKm ? `tous les ${rule.everyKm.toLocaleString('fr-FR')} km` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="narrow space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn-secondary" onClick={onBack} aria-label="Retour">←</button>
        <h2 className="text-xl font-bold">{rule.label}</h2>
      </div>
      <ReminderCard item={item} showVehicle />
      <dl className="card space-y-1 text-sm">
        <div className="flex justify-between"><dt>Périodicité</dt><dd className="text-right font-medium">{interval || '—'}</dd></div>
        <div className="flex justify-between"><dt>Dernière fois</dt>
          <dd className="font-medium">{item.lastDate ? formatDate(item.lastDate) : '—'}{item.lastKm != null && ` · ${item.lastKm.toLocaleString('fr-FR')} km`}</dd></div>
      </dl>
      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}
      {readOnly ? (
        <p className="card text-sm">Véhicule partagé en lecture seule : modification impossible.</p>
      ) : (
        <>
          <button className="btn-primary w-full" onClick={markDone}>
            {rule.type === 'personnalise' ? 'Marquer comme fait aujourd\'hui' : 'Enregistrer un entretien'}
          </button>
          <button className="btn-secondary w-full" onClick={onEdit}>Modifier la règle</button>
          <button className="btn-danger w-full" onClick={remove}>Supprimer</button>
        </>
      )}
    </div>
  )
}

function RuleForm({ rule, onClose }: { rule?: ReminderRule; onClose: () => void }) {
  const { vehicles, active } = useVehicles()
  const [vehicleId, setVehicleId] = useState<number | null>(rule?.vehicleId ?? active?.id ?? null)
  const [type, setType] = useState<RuleType>(rule?.type ?? 'vidange')
  const [label, setLabel] = useState(rule?.label ?? RULE_TYPE_LABELS[rule?.type ?? 'vidange'])
  const [months, setMonths] = useState(rule?.everyMonths != null ? String(rule.everyMonths) : '12')
  const [km, setKm] = useState(rule?.everyKm != null ? String(rule.everyKm) : '15000')
  const [baseDate, setBaseDate] = useState(rule?.baseDate ?? '')
  const [baseKm, setBaseKm] = useState(rule?.baseKm != null ? String(rule.baseKm) : '')
  const [error, setError] = useState<string | null>(null)

  const isCT = type === 'controle_technique'

  const changeType = (t: RuleType) => {
    setType(t)
    const d = DEFAULT_RULES.find((x) => x.type === t)
    if (!rule) {
      setLabel(RULE_TYPE_LABELS[t] === 'Personnalisé' ? '' : d?.label ?? RULE_TYPE_LABELS[t])
      if (d) { setMonths(d.everyMonths ? String(d.everyMonths) : ''); setKm(d.everyKm ? String(d.everyKm) : '') }
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (vehicleId == null) return setError('Choisissez un véhicule.')
    if (!label.trim()) return setError('Donnez un nom au rappel.')
    const m = months.trim() ? Number(months) : null
    const k = km.trim() ? Number(km.replace(/\s/g, '')) : null
    if ((m != null && (!Number.isInteger(m) || m <= 0)) || (k != null && (!Number.isFinite(k) || k <= 0)))
      return setError('Les intervalles doivent être des nombres positifs.')
    if (!isCT && m == null && k == null) return setError('Indiquez un intervalle en mois et/ou en kilomètres.')
    if (type === 'personnalise' && !baseDate) return setError('Indiquez la dernière date à laquelle ce point a été fait.')
    const bk = baseKm.trim() ? Number(baseKm.replace(/\s/g, '')) : null
    if (bk != null && (!Number.isFinite(bk) || bk < 0)) return setError('Kilométrage de départ invalide.')
    const data: Omit<ReminderRule, 'id'> = {
      vehicleId, type, label: label.trim(), everyMonths: isCT ? 24 : m, everyKm: k,
      baseDate: baseDate || null, baseKm: bk,
    }
    try {
      if (rule?.id != null) await db.reminderRules.update(rule.id, data)
      else await db.reminderRules.add(data)
      onClose()
    } catch (err) { setError(errorMessage(err)) }
  }

  const remove = async () => {
    if (rule?.id == null || !window.confirm('Supprimer ce rappel ?')) return
    await deleteRule(rule.id)
    onClose()
  }

  return (
    <form onSubmit={submit} className="narrow space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} aria-label="Annuler">←</button>
        <h2 className="text-xl font-bold">{rule ? 'Modifier le rappel' : 'Nouveau rappel'}</h2>
      </div>
      <div><label className="label" htmlFor="rr-vehicle">Véhicule</label>
        <select id="rr-vehicle" className="field" value={vehicleId ?? ''} onChange={(e) => setVehicleId(Number(e.target.value))} disabled={!!rule}>
          {vehicles?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select></div>
      <div><label className="label" htmlFor="rr-type">Type</label>
        <select id="rr-type" className="field" value={type} onChange={(e) => changeType(e.target.value as RuleType)}>
          {RULE_TYPES.map((t) => <option key={t} value={t}>{RULE_TYPE_LABELS[t]}</option>)}
        </select></div>
      <div><label className="label" htmlFor="rr-label">Nom</label>
        <input id="rr-label" className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Filtre à pollen" /></div>
      {isCT ? (
        <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
          Règle française : 1re échéance 4 ans après la mise en circulation (date à renseigner sur la fiche véhicule),
          puis tous les 2 ans à partir du dernier contrôle enregistré.
        </p>
      ) : (
        <div><label className="label" htmlFor="rr-months">Tous les … mois</label>
          <input id="rr-months" className="field" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="12" /></div>
      )}
      {!isCT && (
        <div><label className="label" htmlFor="rr-km">Tous les … km</label>
          <input id="rr-km" className="field" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="15000" /></div>
      )}
      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-semibold">Dernière fois (optionnel)</legend>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Utile sans historique. Si une entrée du même type est plus récente, c'est elle qui est utilisée.
        </p>
        <div><label className="label" htmlFor="rr-bdate">Date</label>
          <input id="rr-bdate" type="date" className="field" value={baseDate} max={todayIso()} onChange={(e) => setBaseDate(e.target.value)} /></div>
        <div><label className="label" htmlFor="rr-bkm">Kilométrage</label>
          <input id="rr-bkm" className="field" inputMode="numeric" value={baseKm} onChange={(e) => setBaseKm(e.target.value)} /></div>
      </fieldset>
      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}
      <button className="btn-primary w-full">Enregistrer</button>
      {rule && <button type="button" className="btn-danger w-full" onClick={remove}>Supprimer</button>}
    </form>
  )
}
