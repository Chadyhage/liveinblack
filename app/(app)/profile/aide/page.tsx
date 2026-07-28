import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import AideClient from './AideClient'

// Ancien panneau interne "Support / Aide" de ProfilClient.tsx (état local
// `panel==='support'`, #6 phase profil) — maintenant une vraie route,
// accessible via le sous-menu "Mon profil" de la sidebar (dashboardNav.ts).
export const metadata: Metadata = {
  title: 'Support / Aide — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function AidePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return <AideClient />
}
