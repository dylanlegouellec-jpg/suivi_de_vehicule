export interface Env {
  DB: D1Database
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
