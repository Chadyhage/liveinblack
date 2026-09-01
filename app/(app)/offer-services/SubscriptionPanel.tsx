'use client'

import { useState } from 'react'
import { Button, Card } from '@/app/components/ui'
import { regions } from '@/lib/shared/regions'
import { subPresentation, subPriceLabel, type SubWindow } from '@/lib/shared/providerSubscription'
import type { ProviderProfileView } from '@/lib/server/provider/providerProfile'
import type { getMySubscriptionOverview } from '@/lib/server/provider/providerSubscriptions'

// Port détaillé de MonAbonnementPage.jsx — même mise en page (statut, grille
// d'infos, note du mode de paiement, historique des paiements) que le
// legacy, mais réutilise les fonctions serveur et la logique pure déjà
// utilisées par ProposerServicesClient.tsx (#91) plutôt que d'en dupliquer
// le calcul. L'historique vient du registre webhook Mongo, jamais du client.

type SubscriptionOverview = Awaited<ReturnType<typeof getMySubscriptionOverview>>
const C = { obsidian: 'var(--obsidian)', teal: 'var(--teal)', gold: 'var(--gold)', pink: 'var(--pink)' }
const CARD_SHADOW = '0 18px 46px rgba(var(--black-rgb), .22)'
const primaryButton: React.CSSProperties = { background: 'var(--primary)', color: 'var(--primary-ink)', fontSize: 'var(--font-size-body-sm)', fontWeight: 500, textTransform: 'none', letterSpacing: 'normal' }

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return '—'
  }
}

function daysUntil(value: string | null | undefined): number {
  if (!value) return 0
  const ms = new Date(value).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

function fmtPaymentAmount(amountMinor: number, currency: 'EUR' | 'XOF'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: currency === 'XOF' ? 0 : 2 }).format(currency === 'EUR' ? amountMinor / 100 : amountMinor)
}

function InfoTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: 140, padding: '12px 14px', borderRadius: 12, background: 'var(--fill-secondary)', border: '1px solid var(--border)' }}>
      <p style={{ fontSize: 'var(--font-size-caption)', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 'var(--font-size-headline-lg)', fontWeight: 700, color: accent || 'var(--text)', margin: '5px 0 0' }}>{value}</p>
    </div>
  )
}

export default function SubscriptionPanel({ profile, subscription }: { profile: ProviderProfileView; subscription: SubscriptionOverview }) {
  const [renewing, setRenewing] = useState(false)
  const [msg, setMsg] = useState('')

  const currency = subscription.currency
  const zone = regions.find((r) => r.id === subscription.billingRegionId) || null

  async function handleStripeSubscribe() {
    if (renewing) return
    setRenewing(true)
    try {
      const res = await fetch('/api/subscriptions/checkout', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.alreadyActive) {
        setRenewing(false)
        setMsg('Ton abonnement est déjà actif.')
        return
      }
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setRenewing(false)
      setMsg(data.error || 'Impossible de démarrer le paiement. Réessaie.')
    } catch {
      setRenewing(false)
      setMsg('Erreur réseau. Réessaie dans un instant.')
    }
  }

  async function handleFedapaySubscribe() {
    if (renewing) return
    setRenewing(true)
    try {
      const res = await fetch('/api/subscriptions/checkout/fedapay', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setRenewing(false)
        setMsg(typeof data.error === 'string' ? data.error : 'Impossible de démarrer le paiement. Réessaie.')
        return
      }
      window.location.href = data.url
    } catch {
      setRenewing(false)
      setMsg('Erreur réseau. Réessaie dans un instant.')
    }
  }

  let title: string
  let message: string
  let color: string
  let statusLabel: string
  let showCta: boolean
  let cta: string
  let daysLeft = 0
  let expiresAt: string | null = null

  if (currency === 'EUR') {
    const active = profile.subscriptionActive
    color = active ? C.teal : C.pink
    title = active ? 'Abonnement actif' : 'Abonnement inactif'
    statusLabel = active ? 'Actif' : 'Inactif'
    message = active ? 'Ton profil est visible. Renouvellement automatique chaque mois par carte bancaire.' : "Ton profil n'est pas visible publiquement. Active ton abonnement pour le mettre en ligne."
    showCta = !active
    cta = 'Activer mon abonnement'
    expiresAt = subscription.prestataireSubEnd
    daysLeft = daysUntil(expiresAt)
  } else {
    const subWindow: SubWindow = {
      subscriptionExpiresAt: profile.subscriptionExpiresAt ? new Date(profile.subscriptionExpiresAt) : null,
      gracePeriodEndsAt: profile.gracePeriodEndsAt ? new Date(profile.gracePeriodEndsAt) : null,
    }
    const p = subPresentation(subWindow)
    color = p.color
    title = p.title
    statusLabel = p.status === 'active' ? 'Actif' : p.status === 'expiring_soon' ? 'Expire bientôt' : p.status === 'grace' ? 'Période de grâce' : p.status === 'expired' ? 'Expiré' : 'Inactif'
    message = p.message
    showCta = true
    cta = p.cta
    expiresAt = profile.subscriptionExpiresAt
    daysLeft = p.daysLeft
  }

  return (
    <section aria-labelledby="provider-subscription-title">
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, color: 'var(--gold)', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Visibilité et facturation</p>
          <h2 id="provider-subscription-title" className="font-display" style={{ margin: '7px 0 0', fontSize: 'clamp(28px,4vw,40px)', lineHeight: 1 }}>Mon abonnement</h2>
          <p className="lb-dashboard-description" style={{ marginTop: 9 }}>Gère la visibilité de ton profil et retrouve l’historique de tes paiements.</p>
        </div>

        <Card style={{ padding: 18, marginTop: 20, boxShadow: CARD_SHADOW, borderLeft: `3px solid ${color}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <h2 style={{ fontSize: 'var(--font-size-title-5)', fontWeight: 800, margin: 0, color }}>{title}</h2>
            <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color, background: `${color}24`, border: `1px solid ${color}59`, borderRadius: 8, padding: '4px 10px' }}>{statusLabel}</span>
          </div>
          <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>{message}</p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <InfoTile label={currency === 'EUR' ? 'Prochain prélèvement' : 'Jours restants'} value={currency === 'EUR' ? (expiresAt ? fmtDate(expiresAt) : '—') : expiresAt ? `${daysLeft} j` : '—'} accent={currency === 'XOF' && daysLeft > 0 ? C.teal : currency === 'XOF' ? C.pink : undefined} />
            {currency === 'XOF' && <InfoTile label="Expire le" value={fmtDate(expiresAt)} />}
            <InfoTile label="Zone" value={zone ? `${zone.flag} ${zone.name}` : '—'} />
            <InfoTile label="Tarif" value={currency === 'XOF' ? subPriceLabel() : '9,99 € / mois'} />
          </div>

          <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', margin: '12px 0 0' }}>
            {currency === 'XOF' ? 'Paiement Mobile Money / carte (FedaPay) · renouvellement manuel · aucun prélèvement automatique' : 'Carte bancaire (Stripe) · renouvellement automatique chaque mois'}
          </p>

          {msg && <p style={{ fontSize: 'var(--font-size-footnote)', color: C.pink, margin: '12px 0 0' }}>{msg}</p>}

          {showCta && (
            <Button
              onClick={() => void (currency === 'XOF' ? handleFedapaySubscribe() : handleStripeSubscribe())}
              disabled={renewing}
              loading={renewing}
              loadingText="Redirection…"
              style={{ ...primaryButton, marginTop: 16 }}
            >
              {cta}
            </Button>
          )}
        </Card>

        <Card style={{ padding: 18, marginTop: 16, boxShadow: CARD_SHADOW }}>
          <h2 style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 4px' }}>Historique des paiements</h2>
          <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', margin: '0 0 4px' }}>Tes reçus d&rsquo;abonnement.</p>
          {subscription.payments.length === 0 ? (
            <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-faint)', margin: '16px 0 0' }}>Aucun paiement confirmé dans cet historique.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {subscription.payments.map((payment) => (
                <div key={payment.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 13px', borderRadius: 11, background: 'var(--fill-secondary)', border: '1px solid var(--border)' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-callout)', fontWeight: 700 }}>{fmtPaymentAmount(payment.amountMinor, payment.currency)}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)' }}>{fmtDate(payment.paidAt)} · {payment.rail === 'stripe' ? 'Carte bancaire' : 'FedaPay'}</p>
                  </div>
                  {payment.receiptUrl ? <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.teal, fontSize: 'var(--font-size-footnote)', fontWeight: 700, textDecoration: 'none' }}>Voir le reçu</a> : <span style={{ color: C.teal, fontSize: 'var(--font-size-caption-2-lg)', fontWeight: 800 }}>PAYÉ</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
    </section>
  )
}
