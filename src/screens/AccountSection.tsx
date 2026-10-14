import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAuth, useSyncStatus } from '../sync/hooks'
import { acceptInvite, changePassword, deleteAccount, logout, syncNow } from '../sync/session'
import { ApiError, NetworkError } from '../sync/api'

const msg = (e: unknown) => (e instanceof NetworkError ? 'Hors ligne : connexion au serveur impossible.' : e instanceof ApiError || e instanceof Error ? e.message : 'Erreur.')

export default function AccountSection({ onLogin }: { onLogin: (mode: 'login' | 'register') => void }) {
  const { user, notice } = useAuth()
  const sync = useSyncStatus()
  const lastSync = useLiveQuery(async () => (await db.settings.get('sync.lastSyncAt'))?.value as number | undefined, [], undefined)
  const [panel, setPanel] = useState<null | 'password' | 'delete' | 'logout' | 'join'>(null)
  const [wipe, setWipe] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setResult(null)
    try {
      const text = await fn()
      if (text) setResult({ ok: true, text })
    } catch (e) { setResult({ ok: false, text: msg(e) }) } finally { setBusy(false) }
  }
  const open = (p: typeof panel) => { setPanel(p); setA(''); setB(''); setResult(null); setWipe(false) }

  if (!user)
    return (
      <section className="card space-y-3" aria-label="Compte">
        <h2 className="font-semibold">Compte et synchronisation</h2>
        {notice && <p role="status" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">{notice}</p>}
        <p className="text-sm">
          Sans compte, vos données restent uniquement sur cet appareil. Avec un compte, elles se synchronisent entre vos appareils
          (l'app fonctionne toujours hors ligne) et vous pouvez partager un véhicule.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => onLogin('login')}>Se connecter</button>
          <button className="btn-secondary" onClick={() => onLogin('register')}>Créer un compte</button>
        </div>
      <details className="text-xs text-slate-600 dark:text-slate-400">
        <summary className="min-h-[44px] cursor-pointer py-3">Données personnelles et confidentialité</summary>
        <div className="space-y-1">
          <p>Avec un compte, sont enregistrés sur les serveurs Cloudflare (base D1 et stockage R2, de votre propre déploiement) : votre e-mail, votre nom affiché, un mot de passe haché (jamais en clair), vos véhicules, entrées, pleins, rappels et documents joints.</p>
          <p>Aucun suivi, aucune publicité, aucun service tiers d'analyse. Les personnes avec qui vous partagez un véhicule voient les données de ce véhicule, leur adresse e-mail et leur nom affiché.</p>
          <p>« Supprimer le compte » efface vos données en ligne ; vous pouvez aussi exporter une sauvegarde complète (Réglages).</p>
        </div>
      </details>
      </section>
    )

  const stateLabel =
    sync.state === 'syncing' ? 'Synchronisation…'
    : sync.state === 'offline' ? 'Hors ligne : les modifications partiront au retour du réseau'
    : sync.state === 'error' ? 'Erreur de synchronisation'
    : 'À jour'

  return (
    <section className="card space-y-3" aria-label="Compte">
      <h2 className="font-semibold">Compte et synchronisation</h2>
      <p className="text-sm">Connecté : <strong>{user.name || user.email}</strong>{user.name && <span className="text-slate-600 dark:text-slate-400"> · {user.email}</span>}</p>
      <p className="text-sm" role="status">
        {stateLabel}
        {lastSync != null && sync.state !== 'syncing' && <span className="text-slate-600 dark:text-slate-400"> · dernière synchro {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastSync))}</span>}
        {sync.pending > 0 && <span className="text-slate-600 dark:text-slate-400"> · {sync.pending} modification(s) en attente</span>}
      </p>
      {sync.error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{sync.error}</p>}
      {sync.rejected > 0 && <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">{sync.rejected} modification(s) refusée(s) par le serveur (droits insuffisants, par exemple en lecture seule).</p>}
      <button className="btn-secondary w-full" onClick={() => void syncNow()} disabled={sync.state === 'syncing'}>🔄 Synchroniser maintenant</button>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" onClick={() => open('join')}>Rejoindre un véhicule</button>
        <button className="btn-secondary" onClick={() => open('password')}>Mot de passe</button>
        <button className="btn-secondary" onClick={() => open('logout')}>Déconnexion</button>
        <button className="btn-secondary text-red-700 dark:text-red-400" onClick={() => open('delete')}>Supprimer le compte</button>
      </div>

      {panel === 'join' && (
        <form className="space-y-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-800" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => { await acceptInvite(a); setPanel(null); return 'Véhicule ajouté.' }) }}>
          <label className="label" htmlFor="j-code">Code d'invitation</label>
          <input id="j-code" className="field font-mono uppercase" value={a} onChange={(e) => setA(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" required />
          <button className="btn-primary w-full" disabled={busy}>Rejoindre</button>
        </form>
      )}
      {panel === 'password' && (
        <form className="space-y-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-800" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => { await changePassword(a, b); setPanel(null); return 'Mot de passe modifié.' }) }}>
          <label className="label" htmlFor="p-cur">Mot de passe actuel</label>
          <input id="p-cur" type="password" className="field" value={a} onChange={(e) => setA(e.target.value)} autoComplete="current-password" required />
          <label className="label" htmlFor="p-new">Nouveau mot de passe (10 caractères minimum)</label>
          <input id="p-new" type="password" className="field" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" minLength={10} required />
          <button className="btn-primary w-full" disabled={busy}>Changer le mot de passe</button>
        </form>
      )}
      {panel === 'logout' && (
        <div className="space-y-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
          <p className="text-sm">Vos modifications en attente sont envoyées avant la déconnexion.</p>
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" className="h-6 w-6" checked={wipe} onChange={(e) => setWipe(e.target.checked)} />
            <span>Effacer aussi les données de cet appareil (recommandé sur un appareil partagé)</span>
          </label>
          <button className="btn-primary w-full" disabled={busy} onClick={() => void run(async () => { await logout({ wipe }); setPanel(null) })}>Me déconnecter</button>
        </div>
      )}
      {panel === 'delete' && (
        <form className="space-y-2 rounded-xl bg-red-50 p-3 dark:bg-red-950/40" onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (!window.confirm('Supprimer définitivement votre compte et vos données en ligne ?')) return
          void run(async () => { await deleteAccount(a, { wipe }); setPanel(null) })
        }}>
          <p className="text-sm">Supprime votre compte et vos données sur le serveur. Les véhicules partagés sont transférés à un autre membre s'il y en a un, sinon supprimés.</p>
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" className="h-6 w-6" checked={wipe} onChange={(e) => setWipe(e.target.checked)} />
            <span>Effacer aussi les données de cet appareil</span>
          </label>
          <label className="label" htmlFor="d-pw">Mot de passe</label>
          <input id="d-pw" type="password" className="field" value={a} onChange={(e) => setA(e.target.value)} autoComplete="current-password" required />
          <button className="btn-danger w-full" disabled={busy}>Supprimer mon compte</button>
        </form>
      )}
      <details className="text-xs text-slate-600 dark:text-slate-400">
        <summary className="min-h-[44px] cursor-pointer py-3">Données personnelles et confidentialité</summary>
        <div className="space-y-1">
          <p>Avec un compte, sont enregistrés sur les serveurs Cloudflare (base D1 et stockage R2, de votre propre déploiement) : votre e-mail, votre nom affiché, un mot de passe haché (jamais en clair), vos véhicules, entrées, pleins, rappels et documents joints.</p>
          <p>Aucun suivi, aucune publicité, aucun service tiers d'analyse. Les personnes avec qui vous partagez un véhicule voient les données de ce véhicule, leur adresse e-mail et leur nom affiché.</p>
          <p>« Supprimer le compte » efface vos données en ligne ; vous pouvez aussi exporter une sauvegarde complète (Réglages).</p>
        </div>
      </details>
      {result && <p role={result.ok ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm ${result.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>{result.text}</p>}
    </section>
  )
}
