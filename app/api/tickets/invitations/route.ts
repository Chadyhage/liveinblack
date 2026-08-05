import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listMyPendingInvitations } from '@/lib/server/seatAssignment'

// Liste des invitations de siège EN ATTENTE adressées à l'appelant (vue
// CIBLE) — voir lib/server/seatAssignment.ts (#37).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listMyPendingInvitations({ id: session.user.id })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, invitations: result.invitations })
}
