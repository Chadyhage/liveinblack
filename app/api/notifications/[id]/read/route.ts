import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { markRead } from '@/lib/server/notifications'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { id } = await params
  await markRead(session.user.id, id)
  return NextResponse.json({ ok: true })
}
