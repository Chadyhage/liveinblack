// Port TypeScript de lib/providerSubscription.js — logique PURE de
// l'abonnement prestataire FCFA (#8 phase prestataire), à RENOUVELLEMENT
// MANUEL (le mobile money ne permet pas de prélèvement automatique). Partagée
// entre le webhook FedaPay (prolongation après paiement), le cron quotidien
// (rappels + masquage) et l'affichage dashboard (miroir léger de
// src/utils/providerSub.js, ici fusionné — plus besoin d'un fichier séparé
// puisque tout est déjà pur/isomorphe TypeScript).
import { SUBSCRIPTION } from './fees'
import { fmtMoney } from './money'

export const PROVIDER_SUB = {
  currency: 'XOF' as const,
  price: SUBSCRIPTION.PRESTATAIRE_XOF.amount,
  periodDays: 30,
  graceDays: 3,
}

const DAY = 24 * 60 * 60 * 1000

export interface SubWindow {
  subscriptionStartedAt?: number | Date | null
  subscriptionExpiresAt?: number | Date | null
  gracePeriodEndsAt?: number | Date | null
}

function toMs(value: number | Date | null | undefined): number {
  if (value == null) return 0
  return value instanceof Date ? value.getTime() : Number(value) || 0
}

export interface RenewalWindow {
  subscriptionStartedAt: number
  periodStart: number
  periodEnd: number
  subscriptionExpiresAt: number
  gracePeriodEndsAt: number
}

// Renouvellement AVANT expiration → prolonge depuis l'expiration actuelle (les
// jours restants ne sont jamais perdus). APRÈS expiration → repart de
// maintenant. La grâce suit toujours la nouvelle expiration.
export function computeRenewal(sub: SubWindow | null | undefined, nowMs: number): RenewalWindow {
  const period = PROVIDER_SUB.periodDays * DAY
  const grace = PROVIDER_SUB.graceDays * DAY
  const currentExpiry = toMs(sub?.subscriptionExpiresAt)
  const base = currentExpiry > nowMs ? currentExpiry : nowMs
  const expiresAt = base + period
  return {
    subscriptionStartedAt: toMs(sub?.subscriptionStartedAt) || nowMs,
    periodStart: base,
    periodEnd: expiresAt,
    subscriptionExpiresAt: expiresAt,
    gracePeriodEndsAt: expiresAt + grace,
  }
}

export type SubStatus = 'none' | 'active' | 'expiring_soon' | 'grace' | 'expired'

// Statut dérivé UNIQUEMENT des dates (source de vérité) — jamais un champ
// booléen séparé qui pourrait diverger.
export function deriveSubStatus(sub: SubWindow | null | undefined, nowMs: number): SubStatus {
  const exp = toMs(sub?.subscriptionExpiresAt)
  if (!exp) return 'none'
  const grace = toMs(sub?.gracePeriodEndsAt) || exp + PROVIDER_SUB.graceDays * DAY
  if (nowMs <= exp) {
    const daysLeft = Math.ceil((exp - nowMs) / DAY)
    return daysLeft <= 7 ? 'expiring_soon' : 'active'
  }
  if (nowMs <= grace) return 'grace'
  return 'expired'
}

// Visible publiquement (actif OU en grâce) ?
export function subGrantsVisibility(sub: SubWindow | null | undefined, nowMs: number): boolean {
  const s = deriveSubStatus(sub, nowMs)
  return s === 'active' || s === 'expiring_soon' || s === 'grace'
}

export function daysUntil(ts: number | Date | null | undefined, nowMs: number): number {
  return Math.ceil((toMs(ts) - nowMs) / DAY)
}

export type ReminderKey = 'j7' | 'j3' | 'j1' | 'j0' | 'grace' | 'hidden'

// Jalons DUS et non encore envoyés pour ce cycle, dans l'ordre d'urgence.
export function dueReminders(sub: SubWindow | null | undefined, nowMs: number, sent: Partial<Record<ReminderKey, number>> = {}): ReminderKey[] {
  const exp = toMs(sub?.subscriptionExpiresAt)
  if (!exp) return []
  const grace = toMs(sub?.gracePeriodEndsAt) || exp + PROVIDER_SUB.graceDays * DAY
  const daysLeft = Math.ceil((exp - nowMs) / DAY)
  const out: ReminderKey[] = []
  const add = (k: ReminderKey) => {
    if (!sent[k]) out.push(k)
  }

  if (nowMs < exp) {
    if (daysLeft <= 1) add('j1')
    else if (daysLeft <= 3) add('j3')
    else if (daysLeft <= 7) add('j7')
  } else if (nowMs < grace) {
    add('j0')
    add('grace')
  } else {
    add('hidden')
  }
  return out
}

// Cycle courant (clé de dédup des rappels) = la date d'expiration en vigueur.
export function cycleKey(sub: SubWindow | null | undefined): string {
  return String(toMs(sub?.subscriptionExpiresAt))
}

export function subPriceLabel(): string {
  return `${fmtMoney(PROVIDER_SUB.price, PROVIDER_SUB.currency)} / ${PROVIDER_SUB.periodDays} jours`
}

export interface SubPresentation {
  status: SubStatus
  daysLeft: number
  graceDaysLeft?: number
  tone: 'ok' | 'warn' | 'off'
  color: string
  title: string
  message: string
  cta: string
}

// Statut → présentation (libellé/couleur/message) — utilisé par le dashboard
// prestataire (rail XOF uniquement ; le rail EUR/Stripe a son propre bloc,
// jamais dérivé de cette fonction, voir ProposerServicesPage.jsx legacy).
export function subPresentation(sub: SubWindow | null | undefined, nowMs: number = Date.now()): SubPresentation {
  const status = deriveSubStatus(sub, nowMs)
  const exp = toMs(sub?.subscriptionExpiresAt)
  const grace = toMs(sub?.gracePeriodEndsAt)
  const daysLeft = exp ? Math.max(0, daysUntil(exp, nowMs)) : 0
  const graceDaysLeft = grace ? Math.max(0, daysUntil(grace, nowMs)) : 0

  switch (status) {
    case 'active':
      return {
        status,
        daysLeft,
        tone: 'ok',
        color: '#4ee8c8',
        title: 'Abonnement actif',
        message: `Ton profil est visible sur LIVEINBLACK. Il te reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`,
        cta: "Renouveler à l'avance",
      }
    case 'expiring_soon':
      return {
        status,
        daysLeft,
        tone: 'warn',
        color: '#c8a96e',
        title: 'Ton abonnement expire bientôt',
        message: `Il te reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''} de visibilité. Renouvelle pour rester en ligne.`,
        cta: 'Renouveler mon abonnement',
      }
    case 'grace':
      return {
        status,
        daysLeft: 0,
        graceDaysLeft,
        tone: 'warn',
        color: '#e05aaa',
        title: 'Abonnement expiré — période de grâce',
        message: `Ton profil reste visible encore ${graceDaysLeft} jour${graceDaysLeft > 1 ? 's' : ''}. Renouvelle vite pour ne pas être masqué.`,
        cta: 'Renouveler mon abonnement',
      }
    case 'expired':
      return {
        status,
        daysLeft: 0,
        tone: 'off',
        color: '#e05aaa',
        title: 'Abonnement expiré',
        message: "Ton profil n'est plus visible publiquement. Renouvelle ton abonnement pour le remettre en ligne.",
        cta: 'Renouveler mon abonnement',
      }
    default:
      return {
        status,
        daysLeft: 0,
        tone: 'off',
        color: 'rgba(255,255,255,0.5)',
        title: 'Aucun abonnement actif',
        message: `Active ton abonnement pour rendre ton profil visible sur LIVEINBLACK pendant ${PROVIDER_SUB.periodDays} jours.`,
        cta: 'Activer mon abonnement',
      }
  }
}
