import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getOrganizerBySlug, getOrganizerEvents } from '@/lib/server/organizer/organizers'
import { isFollowing } from '@/lib/server/organizer/organizerFollows'

// Profil public complet d'un organisateur (studio) en JSON — miroir de
// app/(public)/organizers/[slug]/page.tsx, réutilise getOrganizerBySlug +
// getOrganizerEvents + isFollowing telles quelles.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const organizer = await getOrganizerBySlug(slug)
  if (!organizer) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const session = await auth()
  const isSelf = session?.user?.id === organizer.userId
  const [{ upcoming, past }, followState] = await Promise.all([
    getOrganizerEvents(organizer.userId),
    session?.user && !isSelf ? isFollowing({ id: session.user.id }, { organizerId: organizer.userId }) : Promise.resolve({ ok: true as const, following: false }),
  ])

  return NextResponse.json({
    ok: true,
    organizer,
    upcoming,
    past,
    isSelf,
    isFollowing: followState.following,
  })
}
