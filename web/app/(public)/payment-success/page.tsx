import PaymentSuccessClient from '@/app/components/PaymentSuccessClient'

export const dynamic = 'force-dynamic'

// Cible de app/api/checkout/route.ts (success_url, Stripe : ?session_id=&order_id=)
// et de app/api/checkout/fedapay/route.ts (callbackUrl, FedaPay : FedaPay
// ajoute lui-même ?id=&status=&close= sur ce retour unique — succès ET abandon).
// Toute la logique de vérification/état est dans PaymentSuccessClient (port de
// src/pages/PaiementReussiPage.jsx + src/pages/PaiementAnnulePage.jsx).
export default async function PaiementReussiPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; id?: string; status?: string; close?: string }>
}) {
  const params = await searchParams
  const sessionId = params.session_id || null
  const fedapayTxnId = !sessionId ? params.id || null : null
  const fedapayClose = params.close === 'true'

  return <PaymentSuccessClient sessionId={sessionId} fedapayTxnId={fedapayTxnId} fedapayClose={fedapayClose} />
}
