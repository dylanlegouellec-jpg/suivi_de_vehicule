import { authConfig, changePassword, currentUser, deleteAccount, forgotPassword, login, logout, me, register, resetPassword, resetWithToken } from './auth'
import { getBlobChunk, getBlobMeta, putBlobChunk } from './blobs'
import { ensureSchema } from './db'
import { acceptInvite, createInvite, listMembers, removeMember } from './sharing'
import { sync } from './sync'
import { HttpError, type Ctx, type Env } from './types'
import { json } from './util'

type Handler = (ctx: Ctx, match: RegExpMatchArray) => Promise<Response> | Response

const routes: { method: string; path: RegExp; handler: Handler }[] = [
  { method: 'POST', path: /^\/api\/auth\/register$/, handler: register },
  { method: 'POST', path: /^\/api\/auth\/login$/, handler: login },
  { method: 'POST', path: /^\/api\/auth\/logout$/, handler: logout },
  { method: 'POST', path: /^\/api\/auth\/reset-password$/, handler: resetPassword },
  { method: 'POST', path: /^\/api\/auth\/change-password$/, handler: changePassword },
  { method: 'POST', path: /^\/api\/auth\/forgot$/, handler: forgotPassword },
  { method: 'POST', path: /^\/api\/auth\/reset-with-token$/, handler: resetWithToken },
  { method: 'GET', path: /^\/api\/auth\/config$/, handler: authConfig },
  { method: 'GET', path: /^\/api\/auth\/me$/, handler: me },
  { method: 'POST', path: /^\/api\/account\/delete$/, handler: deleteAccount },
  { method: 'POST', path: /^\/api\/sync$/, handler: sync },
  { method: 'PUT', path: /^\/api\/blobs\/([^/]+)\/([^/]+)\/(\d+)$/, handler: putBlobChunk },
  { method: 'GET', path: /^\/api\/blobs\/([^/]+)\/([^/]+)\/(\d+)$/, handler: getBlobChunk },
  { method: 'GET', path: /^\/api\/blobs\/([^/]+)\/([^/]+)$/, handler: getBlobMeta },
  { method: 'GET', path: /^\/api\/vehicles\/([^/]+)\/members$/, handler: listMembers },
  { method: 'POST', path: /^\/api\/vehicles\/([^/]+)\/invites$/, handler: createInvite },
  { method: 'DELETE', path: /^\/api\/vehicles\/([^/]+)\/members\/([^/]+)$/, handler: removeMember },
  { method: 'POST', path: /^\/api\/invites\/accept$/, handler: acceptInvite },
]

function withSecurityHeaders(res: Response): Response {
  const h = new Headers(res.headers)
  h.set('x-content-type-options', 'nosniff')
  h.set('referrer-policy', 'no-referrer')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

    try {
      // Protection CSRF : toute requête modifiante doit venir de notre propre origine.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.headers.get('origin')
        if (!origin || origin !== url.origin) throw new HttpError(403, 'Origine non autorisée.')
      }
      await ensureSchema(env)
      const route = routes.find((r) => r.method === req.method && r.path.test(url.pathname))
      if (!route) {
        const known = routes.some((r) => r.path.test(url.pathname))
        throw new HttpError(known ? 405 : 404, known ? 'Méthode non autorisée.' : 'Introuvable.')
      }
      const ctx: Ctx = { env, req, url, user: await currentUser({ env, req }), ip: req.headers.get('cf-connecting-ip') ?? 'local' }
      return withSecurityHeaders(await route.handler(ctx, url.pathname.match(route.path)!))
    } catch (e) {
      if (e instanceof HttpError) return withSecurityHeaders(json({ error: e.message }, e.status))
      console.error('API error', e instanceof Error ? e.stack : e)
      return withSecurityHeaders(json({ error: 'Erreur serveur.' }, 500))
    }
  },
}
