import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import AmbientMusicPlayer from '@/app/components/AmbientMusicPlayer'
import PublicNav from '@/app/(public)/_components/PublicNav'
import DashboardShell from './_components/DashboardShell'
import { COMMON_NAV, ROLE_NAV, CLIENT_UPSELL } from './_components/dashboardNav'

// Zone authentifiée. Le proxy (proxy.ts) fait déjà un premier filtre rapide
// par rôle sur les chemins protégés ; ce layout revérifie côté serveur avant
// de rendre quoi que ce soit (défense en profondeur), et c'est ici que
// l'équivalent d'OnboardingGuard (statut de compte à jour en base) sera
// ajouté quand les pages d'onboarding seront portées.
//
// PublicNav est réutilisée telle quelle : elle lit déjà sa propre session
// (useSession) et affiche AccountMenu (dashboard par rôle, messages,
// déconnexion) dès qu'un utilisateur est connecté. `dashboardLinks` alimente
// le MÊME tiroir mobile que les liens publics (voir commentaire dans
// PublicNav.tsx) — un seul hamburger, pas deux. DashboardShell ajoute la
// sidebar par rôle en dessous (desktop uniquement) — elle se neutralise
// elle-même (passthrough) sur les routes immersives (messages/scanner/
// playlist/...), voir HIDE_SIDEBAR_PREFIXES dans _components/dashboardNav.ts.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) {
    redirect('/login')
  }
  const activeRole = session.user.activeRole
  const dashboardLinks = [
    ...ROLE_NAV[activeRole],
    ...COMMON_NAV,
    ...(activeRole === 'client' ? CLIENT_UPSELL : []),
  ].map((item) => ({ label: item.label, href: item.href }))

  return (
    <>
      <PublicNav dashboardLinks={dashboardLinks} />
      <DashboardShell activeRole={activeRole}>{children}</DashboardShell>
      <AmbientMusicPlayer />
    </>
  )
}
