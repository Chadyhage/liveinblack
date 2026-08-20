import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import DashboardShell from './_components/DashboardShell'

// Zone authentifiée. Le proxy (proxy.ts) fait déjà un premier filtre rapide
// par rôle sur les chemins protégés ; ce layout revérifie côté serveur avant
// de rendre quoi que ce soit (défense en profondeur), et c'est ici que
// l'équivalent d'OnboardingGuard (statut de compte à jour en base) sera
// ajouté quand les pages d'onboarding seront portées.
//
// Dissociation dashboard / site public (demande client 2026-08-11, transcrit
// dans MEMORY.md) : un utilisateur connecté, quel que soit son rôle, ne doit
// PLUS voir la nav publique (Accueil/Événements/Prestataires/Organisateurs)
// une fois dans son espace — PublicNav (avec la recherche, les liens publics
// et l'ancien AccountMenu en haut à droite) n'est donc plus montée ici du
// tout. Tout ce qu'AccountMenu portait (avatar, messages, cloche de
// notifications, switch de rôle, déconnexion) vit maintenant dans l'en-tête
// de DashboardShell (sidebar), avec un lien "Voir la page publique" en pied
// de sidebar pour repartir sur le site public sans jamais réintroduire la
// nav publique dans le dashboard lui-même.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) {
    redirect('/login')
  }
  const activeRole = session.user.activeRole

  return (
    <>
      <DashboardShell activeRole={activeRole}>{children}</DashboardShell>
    </>
  )
}
