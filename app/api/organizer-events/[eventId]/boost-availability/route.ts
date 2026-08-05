import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import { getEventBoostAvailability } from '@/lib/server/boostSlots'

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  await getDb()
  const { eventId } = await params
  const result = await getEventBoostAvailability(session.user.id, eventId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, slots: result.slots })
}
