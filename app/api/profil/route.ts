import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getMyProfile } from '@/lib/server/users/profile'

// Profil complet en JSON — app/(app)/profile/page.tsx appelle getMyProfile()
// directement depuis un composant serveur (pas besoin de hop API pour le
// web) ; cette route donne le même accès à l'app mobile.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const profile = await getMyProfile({ id: session.user.id })
  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, profile })
}
