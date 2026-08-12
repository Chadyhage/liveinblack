// Emails d'avis — organisateur et prestataire notifiés d'un nouvel avis.
// ⚠️ Pas encore branchés — voir lib/server/reviews.ts.
import type { Email } from '../types'
import { DEFAULT_SITE, EMAIL_COLORS as C } from '../theme'
import { wrap, heading, paragraph, button, escapeHtml } from '../layout'

function starsLabel(rating: number): string {
  return '★'.repeat(Math.max(0, Math.min(5, Math.round(rating)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(rating))))
}

export function newReviewReceivedEmail(context: string, rating: number, excerpt: string | null, replyUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Nouvel avis reçu')}
    ${paragraph(`Tu as reçu un nouvel avis sur <strong style="color:${C.text};">${escapeHtml(context)}</strong>.`)}
    ${paragraph(`<span style="color:${C.warning};font-size:18px;letter-spacing:2px;">${starsLabel(rating)}</span>${excerpt ? `<span style="display:block;margin-top:10px;padding:14px 16px;background:${C.surfaceSecondary};border-radius:12px;color:${C.textMuted};font-style:italic;">“${escapeHtml(excerpt)}”</span>` : ''}`)}
    ${button(replyUrl, "Répondre à l'avis", 'outline')}
  `
  return {
    subject: `Nouvel avis sur ${context}`,
    html: wrap(inner, { site, preheader: starsLabel(rating) }),
    inApp: { type: 'review', title: 'Nouvel avis reçu', body: `${context} — ${starsLabel(rating)}`, link: replyUrl },
  }
}
