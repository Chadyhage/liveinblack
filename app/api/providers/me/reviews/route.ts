import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canProposeServices } from '@/lib/server/permissions'
import { getMyProviderReviews } from '@/lib/server/provider/providerReviews'

// Dashboard prestataire — tous les avis REÇUS (publiés + masqués), voir
// MyProviderReviews (#92).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!canProposeServices(session.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const reviews = await getMyProviderReviews({ id: session.user.id })
  return NextResponse.json({ ok: true, reviews })
}
