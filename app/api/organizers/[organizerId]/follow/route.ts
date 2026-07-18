import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { followOrganizer, unfollowOrganizer, isFollowing } from '@/lib/server/organizerFollows'

// Suivre / ne plus suivre le profil PUBLIC d'un organisateur — voir
// lib/server/organizerFollows.ts pour le modèle (abonnement ASYMÉTRIQUE,
// DISTINCT des demandes d'ami). `organizerId` est l'ID utilisateur propre à
// l'organisateur (OrganizerProfile.userId), pas le `_id` du profil. GET
// expose un simple booléen `following`, utile pour l'état initial d'un
// bouton Follow/Unfollow sur la page publique de l'organisateur.
export async function POST(_req: Request, { params }: { params: Promise<{ organizerId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { organizerId } = await params
  const result = await followOrganizer({ id: session.user.id }, { organizerId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, alreadyFollowing: result.alreadyFollowing })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ organizerId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { organizerId } = await params
  const result = await unfollowOrganizer({ id: session.user.id }, { organizerId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, wasFollowing: result.wasFollowing })
}

export async function GET(_req: Request, { params }: { params: Promise<{ organizerId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { organizerId } = await params
  const result = await isFollowing({ id: session.user.id }, { organizerId })

  return NextResponse.json({ ok: true, following: result.following })
}
