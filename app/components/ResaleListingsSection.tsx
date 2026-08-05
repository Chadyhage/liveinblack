'use client'

import { useEffect, useState } from 'react'
import { fmtMoney } from '@/lib/shared/money'
import { Button } from '@/app/components/ui'

// Bourse de revente officielle — affichée sur la page événement, séparément
// du panneau de réservation classique (EventCheckoutPanel) : une revente n'a
// ni précommande, ni quantité, ni code promo, un flux volontairement à part
// pour ne pas complexifier ce composant déjà volumineux.
interface ResaleListingView {
  id: string
  place: string
  resalePriceMinor: number
  currency: string
  isGroupListing: boolean
  seatCount: number
}

function toMajor(minor: number, currency: string): number {
  return currency === 'XOF' ? minor : minor / 100
}

export default function ResaleListingsSection({ eventId, isAuthenticated }: { eventId: string; isAuthenticated: boolean }) {
  const [listings, setListings] = useState<ResaleListingView[] | null>(null)
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/events/${eventId}/resale-listings`)
        const data = await res.json().catch(() => null)
        if (!cancelled && res.ok && data?.ok) setListings(data.listings)
      } catch {
        if (!cancelled) setListings([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [eventId])

  if (!listings || listings.length === 0) return null

  async function handleBuy(listing: ResaleListingView) {
    setBuyingId(listing.id)
    setError(null)
    try {
      const endpoint = listing.currency === 'XOF' ? '/api/checkout/resale/fedapay' : '/api/checkout/resale'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) {
        window.location.assign(data.url)
      } else {
        setError(RESALE_BUY_ERROR_LABELS[data?.error as string] || 'Achat impossible pour le moment — ce billet a peut-être déjà été vendu.')
        setBuyingId(null)
      }
    } catch {
      setError('Achat impossible pour le moment.')
      setBuyingId(null)
    }
  }

  return (
    <section style={{ padding: '22px 22px 0' }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Revente officielle LIVE IN BLACK</h2>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Billets vérifiés et garantis par la plateforme — jamais d&apos;échange direct entre utilisateurs, jamais d&apos;identité de vendeur communiquée.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {listings.map((listing) => (
          <div
            key={listing.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'var(--surface)', border: '1px solid rgba(139,92,246,0.25)' }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>
                {listing.place}
                {listing.isGroupListing ? ` — groupe (${listing.seatCount} pers.)` : ''}
              </p>
              <p style={{ fontSize: 11, color: 'var(--violet)', margin: '2px 0 0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Revente vérifiée</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(toMajor(listing.resalePriceMinor, listing.currency), listing.currency)}</span>
              {isAuthenticated ? (
                <Button
                  onClick={() => handleBuy(listing)}
                  disabled={buyingId === listing.id}
                  style={{ padding: '9px 16px', borderRadius: 999, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12.5 }}
                >
                  {buyingId === listing.id ? 'Redirection…' : 'Acheter'}
                </Button>
              ) : (
                <a href="/login" style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--violet)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                  Se connecter
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <p style={{ fontSize: 11.5, color: '#e05aaa', margin: '8px 0 0' }}>{error}</p>}
    </section>
  )
}

const RESALE_BUY_ERROR_LABELS: Record<string, string> = {
  not_active: 'Ce billet vient d’être vendu ou retiré de la vente.',
  cannot_buy_own_listing: 'Tu ne peux pas acheter ton propre billet en revente.',
  resale_window_closed: 'La revente est fermée pour cet événement.',
}
