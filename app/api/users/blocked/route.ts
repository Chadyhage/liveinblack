import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listBlockedUsers } from '@/lib/server/messaging'

// Liste des comptes bloqués par l'appelant — vue "Bloqués & signalés" (menu
// de la liste de conversations). Voir lib/server/messaging.ts (listBlockedUsers).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listBlockedUsers({ id: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, blocked: result.blocked })
}
