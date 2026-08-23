import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, LockKeyhole } from 'lucide-react'
import { getTicketDisplay } from '@/lib/server/events/tickets'
import { fmtMoney } from '@/lib/shared/money'
import TicketQr from './TicketQr'
import TicketRefundRequestButton from './TicketRefundRequestButton'
import { Card } from '@/app/components/ui'

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
            <AlertCircle size={38} strokeWidth={1.8} color="var(--pink)" aria-hidden="true" />
          </div>
          <h1 className="font-display" style={{ fontWeight: 800, fontSize: 25, letterSpacing: '-0.4px', color: 'var(--pink)', margin: '0 0 10px' }}>Billet invalide</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
            Ce QR code n&apos;est pas reconnu, a été falsifié, ou n&apos;est plus à jour.
          </p>
          <Card accent="rgba(224,90,170,0.20)" style={{ padding: '10px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <LockKeyhole size={12} strokeWidth={1.5} color="var(--pink)" aria-hidden="true" />
              <p style={{ fontSize: 11, color: 'rgba(224,90,170,0.75)', margin: 0, letterSpacing: '0.04em' }}>Signature invalide · LIVEINBLACK</p>
            </div>
          </Card>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: 12,
              fontSize: 13.5,
              fontWeight: 700,
              color: 'var(--text)',
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              textDecoration: 'none',
            }}
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    )
  }

  const CARD_SHADOW = '0 8px 24px rgba(0,0,0,0.35)'
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
              background: 'rgba(184, 243, 74,0.10)',
              border: '2.5px solid rgba(184, 243, 74,0.50)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={34} strokeWidth={2.5} color="var(--primary)" aria-hidden="true" />
          </div>
          <h1 className="font-display" style={{ fontWeight: 800, fontSize: 26, color: 'var(--primary)', margin: '0 0 5px', letterSpacing: '-0.4px' }}>Billet valide</h1>
        </div>

        {ticket.guestName && (
          <Card style={{ boxShadow: CARD_SHADOW, padding: '14px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Invité</p>
            <p style={{ fontWeight: 700, fontSize: 21, color: '#fff', margin: 0 }}>{ticket.guestName}</p>
          </Card>
        )}

        <Card style={{ boxShadow: CARD_SHADOW, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ padding: 16, background: '#fff', borderRadius: 12 }}>
            <TicketQr url={qrUrl} />
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.02em', margin: 0 }}>Présente ce QR code à l&apos;entrée</p>
        </Card>

        <Link
          href={`/order/${ticket.eventId}/${ticket.ticketCode}`}
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
            color: 'var(--primary-ink)',
            background: 'var(--primary)',
            textDecoration: 'none',
          }}
        >
          Commander sur place
        </Link>

        {/* Lien sécurisé de remboursement (#H2, Politique Annulation/
            Remboursement §2) — uniquement pour un billet invité (sans
            compte) : un titulaire de compte passe par /profile/billets. */}
        {ticket.guestName && <TicketRefundRequestButton token={token} />}

        <Link
          href={`/playlist/${ticket.eventId}`}
          style={{
            width: '100%',
            padding: '13px 0',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text)',
            background: 'transparent',
            border: '1px solid var(--border-strong)',
            textDecoration: 'none',
          }}
        >
          Playlist de la soirée
        </Link>

        <Card style={{ boxShadow: CARD_SHADOW }}>
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
        </Card>

        {ticket.preorders.length > 0 && (
          <Card style={{ boxShadow: CARD_SHADOW }}>
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
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.name}{item.showLabel && <small style={{ display: 'block', color: 'var(--primary)', marginTop: 3 }}>Show : {item.showLabel}{item.showInfo ? ` · ${item.showInfo}` : ''}</small>}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>×{item.qty}</span>
                  <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>{fmtMoney(item.price * item.qty, ticket.currency)}</span>
                </div>
              </div>
            ))}
          </Card>
        )}

        <Card style={{ boxShadow: CARD_SHADOW, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Total payé</span>
          <span style={{ fontWeight: 800, fontSize: ticket.currency === 'XOF' ? 20 : 24, color: 'var(--gold)' }}>{fmtMoney(ticket.totalPrice, ticket.currency)}</span>
        </Card>

        <Card style={{ boxShadow: CARD_SHADOW, padding: '12px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Code billet</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.08em', margin: 0 }}>{ticket.ticketCode}</p>
        </Card>
      </div>
    </main>
  )
}
