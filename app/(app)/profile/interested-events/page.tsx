import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listMyEventInterests } from '@/lib/server/eventInterests'
import InterestedEventsClient from './InterestedEventsClient'

// Port de src/pages/InterestedEventsPage.jsx (#6 phase profil).
export const metadata: Metadata = {
  title: 'Événements intéressés — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function InterestedEventsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const result = await listMyEventInterests({ id: session.user.id })
  return <InterestedEventsClient initialItems={result.ok ? result.items : []} />
}
