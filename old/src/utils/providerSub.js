// Helpers UI pour l'abonnement prestataire FCFA (renouvellement manuel).
// Réutilise la logique PURE serveur (lib/providerSubscription.js) comme source
// de vérité — pas de duplication du calcul de statut/dates.
import { PROVIDER_SUB, deriveSubStatus, daysUntil } from '../../lib/providerSubscription.js'
import { fmtMoney } from './money.js'

export { PROVIDER_SUB, deriveSubStatus, daysUntil }

export function subPriceLabel() {
  return `${fmtMoney(PROVIDER_SUB.price, PROVIDER_SUB.currency)} / ${PROVIDER_SUB.periodDays} jours`
}

// Statut → présentation (libellé, couleur, message dashboard).
export function subPresentation(sub, nowMs = Date.now()) {
  const status = deriveSubStatus(sub, nowMs)
  const exp = Number(sub?.subscriptionExpiresAt) || 0
  const grace = Number(sub?.gracePeriodEndsAt) || 0
  const daysLeft = exp ? Math.max(0, daysUntil(exp, nowMs)) : 0
  const graceDaysLeft = grace ? Math.max(0, daysUntil(grace, nowMs)) : 0

  switch (status) {
    case 'active':
      return {
        status, daysLeft, tone: 'ok', color: '#4ee8c8',
        title: 'Abonnement actif',
        message: `Ton profil est visible sur LIVEINBLACK. Il te reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`,
        cta: 'Renouveler à l\'avance',
      }
    case 'expiring_soon':
      return {
        status, daysLeft, tone: 'warn', color: '#c8a96e',
        title: 'Ton abonnement expire bientôt',
        message: `Il te reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''} de visibilité. Renouvelle pour rester en ligne.`,
        cta: 'Renouveler mon abonnement',
      }
    case 'grace':
      return {
        status, daysLeft: 0, graceDaysLeft, tone: 'warn', color: '#e05aaa',
        title: 'Abonnement expiré — période de grâce',
        message: `Ton profil reste visible encore ${graceDaysLeft} jour${graceDaysLeft > 1 ? 's' : ''}. Renouvelle vite pour ne pas être masqué.`,
        cta: 'Renouveler mon abonnement',
      }
    case 'expired':
      return {
        status, daysLeft: 0, tone: 'off', color: '#e05aaa',
        title: 'Abonnement expiré',
        message: 'Ton profil n\'est plus visible publiquement. Renouvelle ton abonnement pour le remettre en ligne.',
        cta: 'Renouveler mon abonnement',
      }
    default: // 'none'
      return {
        status, daysLeft: 0, tone: 'off', color: 'rgba(255,255,255,0.5)',
        title: 'Aucun abonnement actif',
        message: `Active ton abonnement pour rendre ton profil visible sur LIVEINBLACK pendant ${PROVIDER_SUB.periodDays} jours.`,
        cta: 'Activer mon abonnement',
      }
  }
}
