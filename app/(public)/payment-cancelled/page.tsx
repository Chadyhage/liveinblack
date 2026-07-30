import { redirect } from 'next/navigation'

// Ancienne page statique, fusionnée dans /payment-success (qui gère
// maintenant aussi l'état "annulé" via ?cancelled=1&event_id=, voir
// PaymentSuccessClient::isStripeCancelled) — redirect de compatibilité pour
// les sessions Stripe déjà créées avant ce changement (cancel_url figé au
// moment de la création de la session).
export default async function PaymentCancelledRedirect({
  searchParams,
}: {
  searchParams: Promise<{ event_id?: string }>
}) {
  const { event_id: eventId } = await searchParams
  redirect(`/payment-success?cancelled=1${eventId ? `&event_id=${encodeURIComponent(eventId)}` : ''}`)
}
