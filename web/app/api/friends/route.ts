import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listFriends } from '@/lib/server/friends'

// Liste des amis de l'appelant — voir lib/server/friends.ts (#43). La
// suppression d'une amitié vit sous POST /api/friends/remove.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listFriends({ id: session.user.id })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, friends: result.friends })
}
