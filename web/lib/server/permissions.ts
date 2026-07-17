// Port TypeScript de src/utils/permissions.js — même logique, adaptée au
// compte unique multi-rôle (roles[] + activeRole) décidé en réunion. Chaque
// fonction vérifie `activeRole`, jamais `roles` : avoir le rôle organisateur
// dans `roles` ne donne pas accès aux pages organisateur tant que ce n'est
// pas l'interface active (cohérent avec la « séparation stricte des
// interfaces » actée en réunion, §6 du rapport).

export type Role = 'client' | 'organisateur' | 'prestataire' | 'agent'
export type AccountStatus = 'active' | 'pending' | 'rejected'
// Statut d'approbation PAR RÔLE (#7 phase organisateur — dossiers
// candidature) — distinct du statut de compte global ci-dessus. Sans ce
// champ par rôle, un organisateur déjà actif qui candidate en plus comme
// prestataire se retrouverait bloqué de SES DEUX interfaces le temps de la
// review du second dossier (bug corrigé côté legacy, cf. audit #7 de
// applications.js) — jamais reproduit ici : canCreateEvent/canProposeServices
// lisent `orgStatus`/`prestStatus` quand disponible, et ne retombent sur le
// statut de compte global que pour les appelants qui ne le fournissent pas
// encore (rétro-compatibilité des tests/appels existants).
export type RoleApprovalStatus = 'none' | 'pending' | 'active' | 'rejected'

export interface PermissionUser {
  activeRole: Role
  status: AccountStatus
  orgStatus?: RoleApprovalStatus
  prestStatus?: RoleApprovalStatus
}

export function canBook(user: PermissionUser | null): boolean {
  if (!user) return false
  if (user.status === 'pending' || user.status === 'rejected') return false
  return user.activeRole === 'client'
}

export function canCreateEvent(user: PermissionUser | null): boolean {
  if (!user) return false
  if (user.activeRole === 'agent') return true
  if (user.activeRole !== 'organisateur') return false
  const effective = user.orgStatus ?? user.status
  return effective !== 'pending'
}

export function canProposeServices(user: PermissionUser | null): boolean {
  if (!user) return false
  if (user.activeRole !== 'prestataire') return false
  const effective = user.prestStatus ?? user.status
  return effective !== 'rejected'
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
  if (user.activeRole === 'organisateur') {
    const effective = user.orgStatus ?? user.status
    if (effective === 'pending') return 'Ton compte organisateur est en cours de validation.'
    if (effective === 'rejected') return 'Ton compte a été rejeté. Contacte le support.'
  }
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
