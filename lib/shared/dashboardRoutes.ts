// Destination "dashboard" par rôle actif — source unique, réutilisée par
// AccountMenu.tsx (switch de rôle) et AuthForm.tsx (destination post-login).
// Un client n'a pas d'espace dédié comme les autres rôles : sa "Vue
// d'ensemble" est /profile (racine de COMMON_NAV dans
// app/(app)/_components/dashboardNav.ts), jamais /home (page publique — même
// connecté, elle vit sous app/(public)/, sans sidebar) ni /profile/parametres
// (confirmé en réunion live le 11/08/2026 : la connexion ne doit jamais
// atterrir sur un écran de paramètres, mais DOIT atterrir sur un vrai
// dashboard, pas sur la page publique).
export const DASHBOARD_BY_ROLE: Record<string, { href: string; label: string }> = {
  organisateur: { href: '/organizer-studio', label: 'Espace organisateur' },
  prestataire: { href: '/offer-services', label: 'Espace prestataire' },
  agent: { href: '/agent', label: 'Espace agent' },
}

export const CLIENT_DASHBOARD_HREF = '/profile'

export function dashboardHrefForRole(activeRole: string | null | undefined): string {
  if (activeRole && DASHBOARD_BY_ROLE[activeRole]) return DASHBOARD_BY_ROLE[activeRole].href
  return CLIENT_DASHBOARD_HREF
}
