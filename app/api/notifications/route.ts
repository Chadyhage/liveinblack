import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listNotifications, unreadCount } from '@/lib/server/notifications'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  // `?limit=` optionnel — la page dédiée /notifications (sidebar) demande
  // jusqu'au plafond réel (50, MAX_PER_USER dans lib/server/notifications.ts)
  // ; le poll léger du badge de sidebar continue d'utiliser la valeur par
  // défaut (20), pas besoin de plus pour un simple compteur.
  const limitParam = Number(new URL(req.url).searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(50, Math.floor(limitParam)) : 20

  const [notifications, unread] = await Promise.all([
    listNotifications(session.user.id, { limit }),
    unreadCount(session.user.id),
  ])
  return NextResponse.json({ ok: true, notifications, unreadCount: unread })
}
