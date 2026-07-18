import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { declineFriendRequest } from '@/lib/server/friends'

// Refus par le DESTINATAIRE d'une demande d'ami en attente — voir
// lib/server/friends.ts (#43). Ne touche jamais à Friendship : contrairement
// à accept, decline ne crée rien.
export async function POST(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { requestId } = await params
  const result = await declineFriendRequest({ id: session.user.id }, { requestId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
