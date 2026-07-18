import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import AmbientMusicPlayer from '@/app/components/AmbientMusicPlayer'

// Zone authentifiée. Le proxy (proxy.ts) fait déjà un premier filtre rapide
// par rôle sur les chemins protégés ; ce layout revérifie côté serveur avant
// de rendre quoi que ce soit (défense en profondeur), et c'est ici que
// l'équivalent d'OnboardingGuard (statut de compte à jour en base) sera
// ajouté quand les pages d'onboarding seront portées.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) {
    redirect('/login')
  }
  return (
    <>
      {children}
      <AmbientMusicPlayer />
    </>
  )
}
