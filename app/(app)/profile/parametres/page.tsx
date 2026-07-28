import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyProfile } from '@/lib/server/profile'
import ParametresClient from './ParametresClient'

// Ancien panneau interne "Paramètres du compte" de ProfilClient.tsx (état
// local `panel==='settings'`, #6 phase profil) — maintenant une vraie route,
// accessible via le sous-menu "Mon profil" de la sidebar (dashboardNav.ts).
export const metadata: Metadata = {
  title: 'Paramètres du compte — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function ParametresPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const profile = await getMyProfile({ id: session.user.id })
  if (!profile) redirect('/login')

  return <ParametresClient initialUser={profile} />
}
