// Abonnement prestataire FCFA — RENOUVELLEMENT MANUEL (pas de prélèvement auto :
// le mobile money ne le permet pas). Logique PURE partagée entre le webhook
// FedaPay (prolongation après paiement) et le cron quotidien (rappels + masquage).
// Miroir client léger : src/utils/providerSub.js (affichage dashboard).

export const PROVIDER_SUB = {
  currency: 'XOF',
  price: 9000,        // 9 000 FCFA / période
  periodDays: 30,     // visibilité payée
  graceDays: 3,       // délai de grâce après expiration avant masquage
}

const DAY = 24 * 60 * 60 * 1000

// Calcule la nouvelle fenêtre d'abonnement après un paiement confirmé.
// Renouvellement AVANT expiration → on prolonge depuis la date d'expiration
// actuelle (on ne perd pas les jours restants). APRÈS expiration → depuis
// maintenant. La période de grâce suit toujours l'expiration.
export function computeRenewal(sub, nowMs) {
  const period = PROVIDER_SUB.periodDays * DAY
  const grace = PROVIDER_SUB.graceDays * DAY
  const currentExpiry = Number(sub?.subscriptionExpiresAt) || 0
  const base = currentExpiry > nowMs ? currentExpiry : nowMs
  const expiresAt = base + period
  return {
    subscriptionStartedAt: Number(sub?.subscriptionStartedAt) || nowMs,
    periodStart: base,
    periodEnd: expiresAt,
    subscriptionExpiresAt: expiresAt,
    gracePeriodEndsAt: expiresAt + grace,
  }
}

// Statut dérivé UNIQUEMENT des dates (source de vérité) : 'active' |
// 'expiring_soon' (≤7 j) | 'grace' | 'expired' | 'none'.
export function deriveSubStatus(sub, nowMs) {
  const exp = Number(sub?.subscriptionExpiresAt) || 0
  if (!exp) return 'none'
  const grace = Number(sub?.gracePeriodEndsAt) || (exp + PROVIDER_SUB.graceDays * DAY)
  if (nowMs <= exp) {
    const daysLeft = Math.ceil((exp - nowMs) / DAY)
    return daysLeft <= 7 ? 'expiring_soon' : 'active'
  }
  if (nowMs <= grace) return 'grace'
  return 'expired'
}

// Un abonnement est-il VISIBLE publiquement (statut actif OU en grâce) ?
export function subGrantsVisibility(sub, nowMs) {
  const s = deriveSubStatus(sub, nowMs)
  return s === 'active' || s === 'expiring_soon' || s === 'grace'
}

export function daysUntil(ts, nowMs) {
  return Math.ceil((Number(ts || 0) - nowMs) / DAY)
}

// Milestones de rappel pour le cron. Chaque type est envoyé UNE fois par cycle
// (le cycle est identifié par la date d'expiration : un renouvellement change
// l'expiration → nouveau cycle → rappels réinitialisés). Renvoie la liste des
// types DUS et non encore envoyés, dans l'ordre d'urgence.
//   j7/j3/j1  → avant expiration
//   j0        → jour de l'expiration
//   grace     → en période de grâce (profil encore visible)
//   hidden    → grâce terminée → profil masqué
export function dueReminders(sub, nowMs, sent = {}) {
  const exp = Number(sub?.subscriptionExpiresAt) || 0
  if (!exp) return []
  const grace = Number(sub?.gracePeriodEndsAt) || (exp + PROVIDER_SUB.graceDays * DAY)
  const daysLeft = Math.ceil((exp - nowMs) / DAY)
  const out = []
  const add = k => { if (!sent[k]) out.push(k) }

  if (nowMs < exp) {
    if (daysLeft <= 1) add('j1')
    else if (daysLeft <= 3) add('j3')
    else if (daysLeft <= 7) add('j7')
  } else if (nowMs < grace) {
    add('j0')     // au passage juste après l'expiration, un dernier avertissement
    add('grace')
  } else {
    add('hidden')
  }
  return out
}

// Cycle courant (clé de dédup des rappels) = la date d'expiration en vigueur.
export function cycleKey(sub) {
  return String(Number(sub?.subscriptionExpiresAt) || 0)
}
