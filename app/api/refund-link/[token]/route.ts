import { NextResponse } from 'next/server'
import { requestClientRefundByTicketToken } from '@/lib/server/clientRefunds'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

// Public — pas de session requise, volontairement : c'est le point d'entrée
// "lien sécurisé reçu avec son billet" (Politique Annulation/Remboursement
// §2) pour un acheteur SANS compte (billet vendu par un agent, jamais
// rattaché à un vrai compte). Le token du billet lui-même (même signature
// HMAC que le QR d'entrée) est la preuve de possession — voir
// lib/server/clientRefunds.ts::requestClientRefundByTicketToken. Rate-limitée
// par IP comme les autres endpoints publics non authentifiés (même pattern
// que app/api/contact/route.ts) — défense en profondeur, le token lui-même
// n'est de toute façon pas devinable (HMAC serveur).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const rateLimit = await checkRateLimit({
    scope: 'refund-link-ip',
    identifier: getRequestIp(req),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const result = await requestClientRefundByTicketToken(token)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, refunded: result.refunded })
}
