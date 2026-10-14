import { useState, type FormEvent } from 'react'
import { ApiError, NetworkError } from '../sync/api'
import { MIN_PASSWORD_LENGTH } from '../lib/kdf'
import { completeAuth, confirmAccount, login, logout, register, resetPassword, wipeLocalData, type AuthUser } from '../sync/session'

type Mode = 'login' | 'register' | 'reset'

const msg = (e: unknown) =>
  e instanceof NetworkError ? 'Connexion impossible : vérifiez votre réseau et réessayez.'
  : e instanceof ApiError || e instanceof Error ? e.message : 'Une erreur est survenue.'

export default function AuthScreen({ onClose, initialMode = 'login' }: { onClose: () => void; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [recovery, setRecovery] = useState<{ code: string; user: AuthUser } | null>(null)
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState<AuthUser | null>(null)

  const handle = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try { await fn() } catch (e) { setError(msg(e)) } finally { setBusy(false) }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mode !== 'login' && password.length < MIN_PASSWORD_LENGTH) return setError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
    void handle(async () => {
      if (mode === 'login') {
        const r = await login(email, password)
        if (r.status === 'conflict') setConflict(r.user)
        else onClose()
      } else if (mode === 'register') {
        const r = await register(email, password, name)
        if (r.status === 'ok' && r.recoveryCode) setRecovery({ code: r.recoveryCode, user: r.user })
      } else {
        const r = await resetPassword(email, code, password)
        if (r.user) setRecovery({ code: r.recoveryCode, user: r.user })
      }
    })
  }

  // ── Code de récupération : à noter avant de continuer ──
  if (recovery)
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold">Notez votre code de récupération</h2>
        <p className="text-sm">
          C'est le <strong>seul moyen de récupérer votre compte</strong> si vous oubliez votre mot de passe
          (aucun e-mail n'est envoyé). Conservez-le dans un endroit sûr : gestionnaire de mots de passe, papier…
        </p>
        <p className="card select-all break-all text-center font-mono text-xl font-bold tracking-wider" aria-label="Code de récupération">{recovery.code}</p>
        <button className="btn-secondary w-full" onClick={() => void navigator.clipboard?.writeText(recovery.code)}>📋 Copier le code</button>
        <label className="flex min-h-[44px] items-center gap-3">
          <input type="checkbox" className="h-6 w-6" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>J'ai noté ce code</span>
        </label>
        <button className="btn-primary w-full" disabled={!saved || busy} onClick={() => void handle(async () => {
          const r = await completeAuth(recovery.user)
          if (r.status === 'conflict') { setRecovery(null); setConflict(r.user) } else onClose()
        })}>Continuer</button>
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}
      </div>
    )

  // ── Données d'un autre compte présentes sur l'appareil ──
  if (conflict)
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold">Données d'un autre compte</h2>
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
          Cet appareil contient des données synchronisées avec un autre compte. Pour votre confidentialité, elles ne seront
          pas ajoutées à <strong>{conflict.email}</strong>. Vous pouvez les effacer de cet appareil (elles restent sur le compte
          d'origine) puis charger celles de ce compte.
        </p>
        <button className="btn-danger w-full" disabled={busy} onClick={() => void handle(async () => {
          await wipeLocalData()
          await confirmAccount(conflict)
          onClose()
        })}>Effacer cet appareil et continuer</button>
        <button className="btn-secondary w-full" disabled={busy} onClick={() => void handle(async () => { await logout({ wipe: false }); onClose() })}>Annuler et me déconnecter</button>
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}
      </div>
    )

  const title = mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer un compte' : 'Mot de passe oublié'

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} aria-label="Fermer">←</button>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {mode === 'register'
          ? "Un compte synchronise vos données entre vos appareils et permet de partager un véhicule. Les données déjà présentes sur cet appareil seront ajoutées à votre compte."
          : mode === 'reset'
            ? "Entrez votre e-mail, le code de récupération noté à la création du compte, et un nouveau mot de passe."
            : "Connectez-vous pour retrouver vos véhicules sur cet appareil."}
      </p>
      {mode === 'register' && (
        <div><label className="label" htmlFor="a-name">Prénom ou nom affiché</label>
          <input id="a-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
      )}
      <div><label className="label" htmlFor="a-email">E-mail</label>
        <input id="a-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoCapitalize="none" /></div>
      {mode === 'reset' && (
        <div><label className="label" htmlFor="a-code">Code de récupération</label>
          <input id="a-code" className="field font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} required autoCapitalize="characters" autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" /></div>
      )}
      <div><label className="label" htmlFor="a-pw">{mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}</label>
        <input id="a-pw" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'login' ? 1 : 10}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {mode !== 'login' && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">10 caractères minimum.</p>}</div>
      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Patientez…' : title}</button>
      <div className="flex flex-col items-center gap-1 text-sm">
        {mode !== 'login' && <button type="button" className="min-h-[44px] text-brand underline" onClick={() => { setMode('login'); setError(null) }}>J'ai déjà un compte</button>}
        {mode !== 'register' && <button type="button" className="min-h-[44px] text-brand underline" onClick={() => { setMode('register'); setError(null) }}>Créer un compte</button>}
        {mode === 'login' && <button type="button" className="min-h-[44px] text-brand underline" onClick={() => { setMode('reset'); setError(null) }}>Mot de passe oublié ?</button>}
      </div>
    </form>
  )
}
