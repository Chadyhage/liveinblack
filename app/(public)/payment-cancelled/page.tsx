import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Paiement annulé — LIVEINBLACK',
  description: "Le paiement a été annulé et aucun montant n'a été débité.",
}

export default async function PaymentCancelledPage({ searchParams }: { searchParams: Promise<{ event_id?: string }> }) {
  const { event_id: eventId } = await searchParams

  return (
    <main style={{ minHeight: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,.55)', padding: 32, maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px', background: 'rgba(200,169,110,.08)', border: '2px solid rgba(200,169,110,.4)', display: 'grid', placeItems: 'center', color: 'var(--gold)', fontSize: 36 }} aria-hidden="true">
          ×
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.5px', margin: '0 0 10px' }}>Paiement annulé</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Aucun montant n&apos;a été débité. Tu peux retourner à l&apos;événement et réessayer quand tu veux.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
          {eventId && (
            <Link href={`/events/${encodeURIComponent(eventId)}`} style={{ padding: '14px 20px', borderRadius: 12, fontSize: 14.5, fontWeight: 800, background: 'var(--gold)', color: '#181104', textDecoration: 'none' }}>
              Retourner à l&apos;événement
            </Link>
          )}
          <Link href="/events" style={{ padding: '13px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, background: 'rgba(255,255,255,.08)', border: '1px solid var(--border-strong)', color: 'var(--text)', textDecoration: 'none' }}>
            Voir tous les événements
          </Link>
        </div>
      </div>
    </main>
  )
}
