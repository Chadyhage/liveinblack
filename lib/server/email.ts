import { Resend } from 'resend'
import type { Email } from './email-templates'

// Réutilise la même intégration Resend que le legacy (api/send-email.js,
// api/send-password-reset.js) — même expéditeur brandé, même service.
const FROM = process.env.EMAIL_FROM || 'LIVEINBLACK <noreply@liveinblack.com>'

export async function sendEmail(to: string, email: Email): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY manquant — email non envoyé:', email.subject)
    return { ok: false, error: 'email-not-configured' }
  }
  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: email.subject,
      html: email.html,
    })
    if (error) {
      console.error('[email] Resend error:', error)
      return { ok: false, error: 'email_provider_error' }
    }
    return { ok: true }
  } catch (err) {
    console.error('[email] send failed:', err)
    return { ok: false, error: 'email_provider_error' }
  }
}
