import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { acceptFriendRequest } from '@/lib/server/friends'

// Acceptation par le DESTINATAIRE d'une demande d'ami en attente — voir
// lib/server/friends.ts (#43) pour le 404 générique (une demande adressée à
// quelqu'un d'autre n'existe jamais, du point de vue de l'appelant) et la
// réclamation atomique protégeant contre une course accept/decline/cancel
// concurrente.
export async function POST(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { requestId } = await params
  const result = await acceptFriendRequest({ id: session.user.id }, { requestId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
