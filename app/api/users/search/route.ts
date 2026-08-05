import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { searchUsers } from '@/lib/server/friends'

// Recherche nominative sur toute la base d'utilisateurs (pas seulement les
// amis) — voir lib/server/friends.ts:searchUsers. Utilisé par 'Nouveau
// message' / 'Nouveau groupe' (MessagesClient.tsx) pour retrouver quelqu'un
// qui n'est pas encore ami, fidèle à src/utils/messaging.js:searchUsers.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q') ?? ''
  const result = await searchUsers({ id: session.user.id }, q)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, users: result.users })
}
