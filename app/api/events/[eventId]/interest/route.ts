import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { markEventInterested, unmarkEventInterested, isEventInterested } from '@/lib/server/eventInterests'

// Marquer / retirer un événement de "mes événements intéressés" — voir
// lib/server/eventInterests.ts. GET expose un simple booléen `interested`,
// utile pour l'état initial du bouton coeur (EventInterestButton) quand une
// page ne le charge pas déjà via une liste plus large.
export async function POST(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await markEventInterested({ id: session.user.id }, { eventId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, interested: result.interested })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await unmarkEventInterested({ id: session.user.id }, { eventId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, interested: result.interested })
}

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await isEventInterested({ id: session.user.id }, { eventId })

  return NextResponse.json({ ok: true, interested: result.interested })
}
