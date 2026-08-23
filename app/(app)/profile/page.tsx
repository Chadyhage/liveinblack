import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyProfile } from '@/lib/server/users/profile'
import ProfilClient from './ProfilClient'

// Server Component : charge le profil complet via un accès base direct —
// même convention que app/(app)/messages/page.tsx. Le composant client, lui,
// ne parle qu'aux routes /api/profil/* pour toute mutation ultérieure. Le
// portefeuille de billets vit maintenant sur sa propre route (voir
// app/(app)/profile/billets/page.tsx), plus besoin de le charger ici.
export const metadata: Metadata = {
  title: 'Profil — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function ProfilPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const profile = await getMyProfile({ id: session.user.id })
  if (!profile) redirect('/login')

  return <ProfilClient initialUser={profile} />
}
