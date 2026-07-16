import type { Metadata } from 'next'
import Link from 'next/link'
import { getTicketDisplay } from '@/lib/server/tickets'
import { fmtMoney } from '@/lib/shared/money'
import TicketQr from './TicketQr'

// Page volontairement PUBLIQUE (pas de vérification de session) : posséder le
// jeton (donc avoir vu le QR) suffit à afficher le billet — exactement le
// modèle d'un billet papier montré à l'entrée. L'autorité anti-fraude reste
// l'API de check-in (verrouillée serveur), jamais cette page d'affichage.
export const metadata: Metadata = {
  title: 'Billet — LIVEINBLACK',
  robots: { index: false, follow: false },
}

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ticket = await getTicketDisplay(token)

  if (!ticket) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              margin: '0 auto 24px',
              background: 'rgba(224,90,170,0.08)',
              border: '2px solid rgba(224,90,170,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--pink)" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p style={{ fontWeight: 800, fontSize: 25, letterSpacing: '-0.4px', color: 'var(--pink)', margin: '0 0 10px' }}>Billet invalide</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
            Ce QR code n&apos;est pas reconnu, a été falsifié, ou n&apos;est plus à jour.
          </p>
          <div style={{ background: 'var(--surface)', border: '1px solid rgba(224,90,170,0.20)', borderRadius: 16, padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--pink)" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <p style={{ fontSize: 11, color: 'rgba(224,90,170,0.75)', margin: 0, letterSpacing: '0.04em' }}>Signature invalide · LIVEINBLACK</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  }
  const qrUrl = `${SITE}/ticket/${token}`

  return (
    <main style={{ minHeight: '100vh', padding: '36px 16px 48px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              margin: '0 auto 14px',
              background: 'rgba(78,232,200,0.10)',
              border: '2.5px solid rgba(78,232,200,0.50)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p style={{ fontWeight: 800, fontSize: 26, color: 'var(--teal)', margin: '0 0 5px', letterSpacing: '-0.4px' }}>Billet valide</p>
        </div>

        {ticket.guestName && (
          <div style={{ ...cardStyle, padding: '14px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Invité</p>
            <p style={{ fontWeight: 700, fontSize: 21, color: '#fff', margin: 0 }}>{ticket.guestName}</p>
          </div>
        )}

        <div style={{ ...cardStyle, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ padding: 16, background: '#fff', borderRadius: 12 }}>
            <TicketQr url={qrUrl} />
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.02em', margin: 0 }}>Présente ce QR code à l&apos;entrée</p>
        </div>

        <Link
          href={`/commander/${ticket.eventId}/${ticket.ticketCode}`}
          style={{
            width: '100%',
            padding: '15px 0',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            fontSize: 14.5,
            fontWeight: 700,
            color: '#04120e',
            background: 'var(--teal-solid)',
            textDecoration: 'none',
          }}
        >
          Commander sur place
        </Link>

        <div style={{ ...cardStyle, padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Événement</p>
          <p style={{ fontWeight: 800, fontSize: 24, color: '#fff', textTransform: 'uppercase', lineHeight: 1.2, margin: '0 0 5px', letterSpacing: '0.01em' }}>
            {ticket.eventName}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{ticket.eventDate}</p>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type de place</p>
              <p style={{ fontWeight: 700, fontSize: 17, color: '#fff', margin: 0 }}>{ticket.place}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prix de la place</p>
              <p style={{ fontWeight: 700, fontSize: 20, color: 'var(--gold)', margin: 0 }}>{fmtMoney(ticket.placePrice, ticket.currency)}</p>
            </div>
          </div>
        </div>

        {ticket.preorders.length > 0 && (
          <div style={{ ...cardStyle, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Précommande</p>
            </div>
            {ticket.preorders.map((item, i) => (
              <div
                key={`${item.name}-${i}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: i < ticket.preorders.length - 1 ? 10 : 0,
                  paddingBottom: i < ticket.preorders.length - 1 ? 10 : 0,
                  borderBottom: i < ticket.preorders.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>×{item.qty}</span>
                  <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>{fmtMoney(item.price * item.qty, ticket.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ ...cardStyle, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Total payé</span>
          <span style={{ fontWeight: 800, fontSize: ticket.currency === 'XOF' ? 20 : 24, color: 'var(--gold)' }}>{fmtMoney(ticket.totalPrice, ticket.currency)}</span>
        </div>

        <div style={{ ...cardStyle, padding: '12px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Code billet</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.08em', margin: 0 }}>{ticket.ticketCode}</p>
        </div>
      </div>
    </main>
  )
}
