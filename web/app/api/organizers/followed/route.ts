import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listMyFollowedOrganizers } from '@/lib/server/organizerFollows'

// Liste des organisateurs suivis par l'appelant, avec les infos d'affichage
// de base jointes en une seule requête batch — voir
// lib/server/organizerFollows.ts (listMyFollowedOrganizers).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listMyFollowedOrganizers({ id: session.user.id })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, follows: result.follows })
}
