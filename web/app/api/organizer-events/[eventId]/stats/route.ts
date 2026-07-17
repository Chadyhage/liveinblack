import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getEventStats } from '@/lib/server/eventStats'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range')
  const place = searchParams.get('place')

  const result = await getEventStats(
    { id: session.user.id, roles: session.user.roles },
    eventId,
    { range: range === '7d' || range === '30d' ? range : 'all', place: place || 'all' }
  )
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, ...result.view })
}
