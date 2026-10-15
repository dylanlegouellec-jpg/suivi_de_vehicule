import { useCallback, useEffect, useState } from 'react'
import type { Vehicle } from '../db/schema'
import { ApiError, NetworkError } from '../sync/api'
import { useAuth, useRoles } from '../sync/hooks'
import { api, syncNow } from '../sync/session'

interface Member { id: string; email: string; name: string; role: 'owner' | 'editor' | 'viewer' }
const ROLE_LABEL = { owner: 'Propriétaire', editor: 'Peut modifier', viewer: 'Lecture seule' } as const
const msg = (e: unknown) => (e instanceof NetworkError ? 'Hors ligne : le partage nécessite une connexion.' : e instanceof Error ? e.message : 'Erreur.')

export default function SharingScreen({ vehicle, onBack }: { vehicle: Vehicle; onBack: () => void }) {
  const { user } = useAuth()
  const roles = useRoles()
  const myRole = (vehicle.uid && roles[vehicle.uid]) || 'owner'
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ code: string; role: string; expiresAt: number } | null>(null)
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!vehicle.uid) return
    try {
      setMembers((await api.json<{ members: Member[] }>('GET', `/api/vehicles/${vehicle.uid}/members`)).members)
      setError(null)
    } catch (e) {
      // Véhicule pas encore synchronisé : on le fait, puis on réessaie une fois.
      if (e instanceof ApiError && e.status === 403) {
        try {
          await syncNow()
          setMembers((await api.json<{ members: Member[] }>('GET', `/api/vehicles/${vehicle.uid}/members`)).members)
          setError(null)
          return
        } catch (e2) { setError(msg(e2)); return }
      }
      setError(msg(e))
    }
  }, [vehicle.uid])

  useEffect(() => { void load() }, [load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { setError(msg(e)) } finally { setBusy(false) }
  }

  if (!user)
    return (
      <div className="narrow space-y-3">
        <div className="flex items-center gap-2"><button className="btn-secondary" onClick={onBack} aria-label="Retour">←</button><h2 className="text-xl font-bold">Partager</h2></div>
        <p className="card text-sm">Connectez-vous (Réglages → Compte) pour partager ce véhicule.</p>
      </div>
    )

  return (
    <div className="narrow space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn-secondary" onClick={onBack} aria-label="Retour">←</button>
        <h2 className="text-xl font-bold">Partager « {vehicle.name} »</h2>
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger/15 p-3 text-sm text-fg">{error}</p>}

      <section className="card space-y-2" aria-label="Membres">
        <h3 className="font-semibold">Personnes ayant accès</h3>
        {!members ? <p role="status" className="text-sm">Chargement…</p> : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name || m.email}{m.id === user.id && ' (vous)'}</p>
                  <p className="truncate text-sm text-muted">{m.name ? `${m.email} · ` : ''}{ROLE_LABEL[m.role]}</p>
                </div>
                {m.role !== 'owner' && (myRole === 'owner' || m.id === user.id) && (
                  <button className="btn-secondary" disabled={busy} onClick={() => {
                    const self = m.id === user.id
                    if (!window.confirm(self ? 'Quitter ce véhicule ? Il disparaîtra de vos appareils.' : `Retirer ${m.name || m.email} ?`)) return
                    void run(async () => {
                      await api.json('DELETE', `/api/vehicles/${vehicle.uid}/members/${m.id}`)
                      if (self) { await syncNow(); onBack() } else await load()
                    })
                  }}>{m.id === user.id ? 'Quitter' : 'Retirer'}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {myRole === 'owner' ? (
        <section className="card space-y-3" aria-label="Inviter">
          <h3 className="font-semibold">Inviter quelqu'un</h3>
          <p className="text-sm text-muted">
            Créez un code à usage unique (valable 7 jours) et transmettez-le à la personne : elle le saisit dans AutoSuivi
            (Véhicules → Rejoindre avec un code) après avoir créé son compte.
          </p>
          <div><label className="label" htmlFor="s-role">Droits</label>
            <select id="s-role" className="field" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}>
              <option value="editor">Peut modifier (ajouter, corriger, supprimer des entrées)</option>
              <option value="viewer">Lecture seule</option>
            </select></div>
          <button className="btn-primary w-full" disabled={busy} onClick={() => void run(async () => {
            setInvite(await api.json('POST', `/api/vehicles/${vehicle.uid}/invites`, { role: inviteRole }))
          })}>Créer un code d'invitation</button>
          {invite && (
            <div className="space-y-2 rounded-xl bg-surface2 p-3" role="status">
              <p className="text-center font-mono text-2xl font-bold tracking-widest">{invite.code}</p>
              <p className="text-center text-xs">{ROLE_LABEL[invite.role as 'editor' | 'viewer']} · expire le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(invite.expiresAt))}</p>
              <button className="btn-secondary w-full" onClick={() => {
                const text = `Rejoins mon véhicule « ${vehicle.name} » sur AutoSuivi avec ce code : ${invite.code}`
                if (navigator.share) void navigator.share({ text }).catch(() => {}); else void navigator.clipboard?.writeText(text)
              }}>Partager le code</button>
            </div>
          )}
        </section>
      ) : (
        <p className="card text-sm">Seul le propriétaire peut inviter d'autres personnes.</p>
      )}
    </div>
  )
}
