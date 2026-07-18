import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getMyProviderReviews } from '@/lib/server/providerReviews'

function requireProviderRole(roles: string[] | undefined) {
  return Boolean(roles?.includes('prestataire'))
}

// Dashboard prestataire — tous les avis REÇUS (publiés + masqués), voir
// MyProviderReviews (#92).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const reviews = await getMyProviderReviews({ id: session.user.id })
  return NextResponse.json({ ok: true, reviews })
}
