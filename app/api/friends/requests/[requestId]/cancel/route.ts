import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { cancelFriendRequest } from '@/lib/server/friends'

// Annulation par l'EXPÉDITEUR de sa propre demande sortante encore en
// attente — capacité absente du legacy (cf. en-tête de
// lib/models/FriendRequest.ts et lib/server/friends.ts, #43). Un tiers,
// y compris le destinataire (qui doit passer par decline), reçoit le même
// 404 générique qu'une demande inexistante.
export async function POST(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { requestId } = await params
  const result = await cancelFriendRequest({ id: session.user.id }, { requestId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
