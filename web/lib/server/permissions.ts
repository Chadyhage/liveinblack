// Port TypeScript de src/utils/permissions.js — même logique, adaptée au
// compte unique multi-rôle (roles[] + activeRole) décidé en réunion. Chaque
// fonction vérifie `activeRole`, jamais `roles` : avoir le rôle organisateur
// dans `roles` ne donne pas accès aux pages organisateur tant que ce n'est
// pas l'interface active (cohérent avec la « séparation stricte des
// interfaces » actée en réunion, §6 du rapport).

export type Role = 'client' | 'organisateur' | 'prestataire' | 'agent'
export type AccountStatus = 'active' | 'pending' | 'rejected'

export interface PermissionUser {
  activeRole: Role
  status: AccountStatus
}

export function canBook(user: PermissionUser | null): boolean {
  if (!user) return false
  if (user.status === 'pending' || user.status === 'rejected') return false
  return user.activeRole === 'client'
}

export function canCreateEvent(user: PermissionUser | null): boolean {
  if (!user) return false
  return (user.activeRole === 'organisateur' || user.activeRole === 'agent') && user.status !== 'pending'
}

export function canProposeServices(user: PermissionUser | null): boolean {
  if (!user) return false
  return user.activeRole === 'prestataire' && user.status !== 'rejected'
}

export function canOrderServices(user: PermissionUser | null): boolean {
  if (!user) return false
  return user.activeRole === 'client' || user.activeRole === 'organisateur' || user.activeRole === 'agent'
}

export function canAdminister(user: PermissionUser | null): boolean {
  if (!user) return false
  return user.activeRole === 'agent'
}

export function getBookingBlockedReason(user: PermissionUser | null): string | null {
  if (!user) return 'Connecte-toi pour réserver une place.'
  if (user.activeRole === 'organisateur') return 'Les organisateurs ne peuvent pas réserver de places. Utilise un compte client.'
  if (user.activeRole === 'prestataire') return 'Les prestataires ne peuvent pas réserver de places. Utilise un compte client.'
  if (user.activeRole === 'agent') return 'Les agents administrateurs ne peuvent pas réserver de places.'
  if (user.status === 'pending') return 'Ton compte est en attente de validation.'
  if (user.status === 'rejected') return 'Ton compte a été rejeté. Contacte le support.'
  return null
}

export function getCreateEventBlockedReason(user: PermissionUser | null): string | null {
  if (!user) return 'Connecte-toi avec un compte organisateur.'
  if (user.activeRole === 'client') return 'Seuls les organisateurs peuvent créer des événements.'
  if (user.activeRole === 'prestataire') return "Les prestataires ne créent pas d'événements. Passe à un compte organisateur."
  if (user.status === 'pending') return 'Ton compte organisateur est en cours de validation.'
  if (user.status === 'rejected') return 'Ton compte a été rejeté. Contacte le support.'
  return null
}

export function canViewMessaging(user: PermissionUser | null): boolean {
  return !!user
}

export function canViewWallet(user: PermissionUser | null): boolean {
  if (!user) return false
  return user.activeRole !== 'agent'
}

export function canScanTickets(user: PermissionUser | null): boolean {
  if (!user) return false
  return user.activeRole === 'organisateur' || user.activeRole === 'agent'
}

const ROLE_LABELS: Record<Role, string> = {
  client: 'Client',
  prestataire: 'Prestataire',
  organisateur: 'Organisateur',
  agent: 'Agent',
}

export function getRoleLabel(role: Role | string): string {
  return ROLE_LABELS[role as Role] || role
}
