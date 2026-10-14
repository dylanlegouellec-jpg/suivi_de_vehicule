import type { Env } from './types'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

export const mailConfigured = (env: Env) => !!(env.BREVO_API_KEY && env.MAIL_FROM)

/** Envoi via l'API HTTP de Brevo (offre gratuite : 300 e-mails/jour, l'expéditeur doit être vérifié chez Brevo). */
export async function sendMail(env: Env, mail: Mail): Promise<'sent' | 'not_configured'> {
  if (!mailConfigured(env)) return 'not_configured'
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: env.MAIL_FROM_NAME || 'AutoSuivi', email: env.MAIL_FROM },
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
    }),
  })
  if (!res.ok) throw new Error(`Envoi d'e-mail refusé (${res.status})`)
  return 'sent'
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function resetPasswordMail(to: string, link: string): Mail {
  return {
    to,
    subject: 'AutoSuivi : réinitialisation de votre mot de passe',
    text:
      `Bonjour,\n\nVous avez demandé à réinitialiser votre mot de passe AutoSuivi.\n` +
      `Ouvrez ce lien dans les 30 minutes pour choisir un nouveau mot de passe :\n\n${link}\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.\n`,
    html:
      `<p>Bonjour,</p><p>Vous avez demandé à réinitialiser votre mot de passe AutoSuivi.</p>` +
      `<p><a href="${esc(link)}">Choisir un nouveau mot de passe</a> (lien valable 30 minutes, à usage unique).</p>` +
      `<p>Si le lien ne s'ouvre pas, copiez cette adresse dans votre navigateur :<br>${esc(link)}</p>` +
      `<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>`,
  }
}
