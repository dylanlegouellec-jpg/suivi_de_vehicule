import { afterEach, describe, expect, it, vi } from 'vitest'
import { mailConfigured, resetPasswordMail, sendMail } from './mail'
import type { Env } from './types'

const env = (o: Partial<Env> = {}) => ({ DB: {} as D1Database, ...o }) as Env

afterEach(() => vi.unstubAllGlobals())

describe('envoi d\'e-mails', () => {
  it('désactivé sans clé ni expéditeur', async () => {
    expect(mailConfigured(env())).toBe(false)
    expect(mailConfigured(env({ BREVO_API_KEY: 'k' }))).toBe(false)
    expect(await sendMail(env(), resetPasswordMail('a@b.fr', 'https://x/?reset=1'))).toBe('not_configured')
  })

  it('appelle l\'API Brevo avec la clé et l\'expéditeur configurés', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const mail = resetPasswordMail('alice@example.com', 'https://site.workers.dev/?reset=abc&email=alice%40example.com')
    expect(await sendMail(env({ BREVO_API_KEY: 'secret-key', MAIL_FROM: 'moi@gmail.com', MAIL_FROM_NAME: 'AutoSuivi' }), mail)).toBe('sent')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect((init.headers as Record<string, string>)['api-key']).toBe('secret-key')
    const body = JSON.parse(init.body as string)
    expect(body.sender).toEqual({ name: 'AutoSuivi', email: 'moi@gmail.com' })
    expect(body.to).toEqual([{ email: 'alice@example.com' }])
    expect(body.textContent).toContain('https://site.workers.dev/?reset=abc')
  })

  it('signale un refus du service sans divulguer la clé', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"bad key"}', { status: 401 })))
    await expect(sendMail(env({ BREVO_API_KEY: 'secret-key', MAIL_FROM: 'a@b.fr' }), resetPasswordMail('a@b.fr', 'l'))).rejects.toThrow(/401/)
    await sendMail(env({ BREVO_API_KEY: 'secret-key', MAIL_FROM: 'a@b.fr' }), resetPasswordMail('a@b.fr', 'l')).catch((e: Error) => expect(e.message).not.toContain('secret-key'))
  })

  it('le message protège le lien dans le HTML', () => {
    const m = resetPasswordMail('a@b.fr', 'https://x/?a=1&b="2"<script>')
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&amp;')
    expect(m.text).toContain('30 minutes')
  })
})
