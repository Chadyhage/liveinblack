import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { markAllRead } from '@/lib/server/notifications'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  await markAllRead(session.user.id)
  return NextResponse.json({ ok: true })
}
