export interface Env {
  DB: D1Database
  /** Envoi d'e-mails (Brevo) : secrets à définir dans Cloudflare ; sans eux, la réinitialisation par e-mail est désactivée. */
  BREVO_API_KEY?: string
  MAIL_FROM?: string
  MAIL_FROM_NAME?: string
  /** Développement local uniquement : n'envoie rien et renvoie le lien dans la réponse (ignoré hors localhost). */
  MAIL_DRY_RUN?: string
  ASSETS: Fetcher
}

export interface User {
  id: string
  email: string
  name: string
}

export type Role = 'owner' | 'editor' | 'viewer'
export const KINDS = ['vehicle', 'entry', 'fuel', 'rule', 'document'] as const
export type Kind = (typeof KINDS)[number]

export interface Ctx {
  env: Env
  req: Request
  url: URL
  user: User | null
  ip: string
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
