import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listNotifications, unreadCount } from '@/lib/server/notifications'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const [notifications, unread] = await Promise.all([
    listNotifications(session.user.id, { limit: 20 }),
    unreadCount(session.user.id),
  ])
  return NextResponse.json({ ok: true, notifications, unreadCount: unread })
}
