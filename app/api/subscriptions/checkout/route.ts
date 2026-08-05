import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createStripeSubscriptionCheckout, confirmStripeSubscriptionCheckout } from '@/lib/server/providerSubscriptions'

function requireProviderRole(roles: string[] | undefined) {
  return Boolean(roles?.includes('prestataire'))
}

// Remplace la branche POST (rail EUR) de api/create-subscription.js.
export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const result = await createStripeSubscriptionCheckout({ id: session.user.id, email: session.user.email })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  if ('alreadyActive' in result) return NextResponse.json({ alreadyActive: true, status: result.status })
  return NextResponse.json({ url: result.url })
}

// Remplace la branche GET (confirmation synchrone au retour Checkout) de
// api/create-subscription.js.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const sessionId = url.searchParams.get('session_id')
  if (!sessionId) return NextResponse.json({ error: 'missing_session_id' }, { status: 400 })

  const result = await confirmStripeSubscriptionCheckout({ id: session.user.id }, sessionId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ active: true, status: result.status })
}
