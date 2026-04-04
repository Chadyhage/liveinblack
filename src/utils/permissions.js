// ─── Permissions centralisées ──────────────────────────────────────────────
// Définit ce que chaque rôle peut faire dans l'application.
// Toujours importer ces fonctions dans les composants UI pour bloquer les actions.

/**
 * Peut réserver une place (achat de billet standard)
 * Réservé aux clients uniquement
 */
export function canBook(user) {
  if (!user) return false
  return user.role === 'client' || user.role === 'user'
}

/**
 * Peut créer et gérer des événements
 * Réservé aux organisateurs et agents
 */
export function canCreateEvent(user) {
  if (!user) return false
  return (user.role === 'organisateur' || user.role === 'agent') && user.status !== 'pending'
}

/**
 * Peut proposer des services en tant que prestataire
 */
export function canProposeServices(user) {
  if (!user) return false
  return user.role === 'prestataire' && user.status !== 'rejected'
}

/**
 * Peut commander des services (preorder, catalogue prestataires)
 * Clients ET organisateurs peuvent commander
 */
export function canOrderServices(user) {
  if (!user) return false
  return user.role === 'client' || user.role === 'user' || user.role === 'organisateur' || user.role === 'agent'
}

/**
 * Peut valider des dossiers KYC et gérer les comptes
 */
export function canAdminister(user) {
  if (!user) return false
  return user.role === 'agent'
}

/**
 * Retourne un message explicatif si l'utilisateur n'a pas la permission de réserver
 */
export function getBookingBlockedReason(user) {
  if (!user) return 'Connecte-toi pour réserver une place.'
  if (user.role === 'organisateur') return 'Les organisateurs ne peuvent pas réserver de places. Utilise un compte client.'
  if (user.role === 'prestataire') return 'Les prestataires ne peuvent pas réserver de places. Utilise un compte client.'
  if (user.role === 'agent') return 'Les agents administrateurs ne peuvent pas réserver de places.'
  if (user.status === 'pending') return 'Ton compte est en attente de validation.'
  if (user.status === 'rejected') return 'Ton compte a été rejeté. Contacte le support.'
  return null
}

/**
 * Retourne un message explicatif si l'utilisateur ne peut pas créer d'événement
 */
export function getCreateEventBlockedReason(user) {
  if (!user) return 'Connecte-toi avec un compte organisateur.'
  if (user.role === 'client' || user.role === 'user') return 'Seuls les organisateurs peuvent créer des événements.'
  if (user.role === 'prestataire') return 'Les prestataires ne créent pas d\'événements. Passe à un compte organisateur.'
  if (user.status === 'pending') return 'Ton compte organisateur est en cours de validation.'
  if (user.status === 'rejected') return 'Ton compte a été rejeté. Contacte le support.'
  return null
}

/**
 * Peut accéder à la messagerie
 */
export function canViewMessaging(user) {
  return !!user
}

/**
 * Peut accéder au portefeuille
 */
export function canViewWallet(user) {
  if (!user) return false
  return user.role !== 'agent'
}

/**
 * Peut scanner des billets (organisateurs + agents)
 */
export function canScanTickets(user) {
  if (!user) return false
  return user.role === 'organisateur' || user.role === 'agent'
}

/**
 * Retourne le label lisible du rôle
 */
export function getRoleLabel(role) {
  const labels = {
    client: 'Client',
    user: 'Client',
    prestataire: 'Prestataire',
    organisateur: 'Organisateur',
    agent: 'Agent',
  }
  return labels[role] || role
}
