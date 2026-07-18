import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createFedapaySubscriptionCheckout } from '@/lib/server/providerSubscriptions'

function requireProviderRole(roles: string[] | undefined) {
  return Boolean(roles?.includes('prestataire'))
}

// Remplace la branche `action:'subscribe'` de api/fedapay.js (rail XOF).
export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const result = await createFedapaySubscriptionCheckout({ id: session.user.id, email: session.user.email })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  // Paiement PONCTUEL (renouvellement manuel) : jamais de garde "déjà actif" —
  // contrairement au rail Stripe, repayer avant expiration prolonge la fenêtre.
  return NextResponse.json({ url: result.url, transactionId: result.transactionId })
}
