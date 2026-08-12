// Emails d'avis — organisateur et prestataire notifiés d'un nouvel avis.
// Branché depuis lib/server/providerReviews.ts (via notifyUserById).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, button, escapeHtml } from '../layout'

function starsLabel(rating: number): string {
  return '★'.repeat(Math.max(0, Math.min(5, Math.round(rating)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(rating))))
}

export function newReviewReceivedEmail(context: string, rating: number, excerpt: string | null, replyUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Nouvel avis reçu')}
    ${paragraph(`Tu as reçu un nouvel avis sur <strong style="color:#fff;">${escapeHtml(context)}</strong>.`)}
    ${paragraph(`<span style="color:#b8f34a;font-size:16px;">${starsLabel(rating)}</span>${excerpt ? `<br/><em style="color:rgba(255,255,255,0.7);">"${escapeHtml(excerpt)}"</em>` : ''}`)}
    ${button(replyUrl, "Répondre à l'avis", 'outline')}
  `
  return {
    subject: `Nouvel avis sur ${context}`,
    html: wrap(inner, { site, preheader: starsLabel(rating) }),
    inApp: { type: 'review', title: 'Nouvel avis reçu', body: `${context} — ${starsLabel(rating)}`, link: replyUrl, push: true },
  }
}
