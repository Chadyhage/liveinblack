import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listNotifications } from '@/lib/server/notifications'
import NotificationsClient from './NotificationsClient'

// Remplace la cloche de AccountMenu.tsx (dropdown en en-tête) — une vraie
// page de sidebar, plus cohérente avec le reste du dashboard (confirmé en
// réunion live le 12/08/2026). MAX_PER_USER=50 (lib/server/notifications.ts)
// donc pas besoin de pagination serveur : tout tient sur un seul écran.
export const metadata: Metadata = {
  title: 'Notifications — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const notifications = await listNotifications(session.user.id, { limit: 50 })
  return (
    <NotificationsClient
      initialNotifications={notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link ?? null,
        read: n.read,
        createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : '',
      }))}
    />
  )
}
