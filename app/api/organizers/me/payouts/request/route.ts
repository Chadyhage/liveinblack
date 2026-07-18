import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requestManualPayout } from '@/lib/server/organizerPayouts'

function requireOrganizerRole(role: string | undefined) {
  return role === 'organisateur' || role === 'agent'
}

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireOrganizerRole(session.user.activeRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const result = await requestManualPayout({ id: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, requestId: result.requestId, amountDueCents: result.amountDueCents, amountDueXOF: result.amountDueXOF })
}
