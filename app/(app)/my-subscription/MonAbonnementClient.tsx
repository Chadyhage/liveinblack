'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { regions } from '@/lib/shared/regions'
import { subPresentation, subPriceLabel, type SubWindow } from '@/lib/shared/providerSubscription'
import type { ProviderProfileView } from '@/lib/server/providerProfile'
import type { getMySubscriptionOverview } from '@/lib/server/providerSubscriptions'

// Port détaillé de MonAbonnementPage.jsx — même mise en page (statut, grille
// d'infos, note du mode de paiement, historique des paiements) que le
// legacy, mais réutilise les fonctions serveur et la logique pure déjà
// utilisées par ProposerServicesClient.tsx (#91) plutôt que d'en dupliquer
// le calcul. L'historique vient du registre webhook Mongo, jamais du client.

type SubscriptionOverview = Awaited<ReturnType<typeof getMySubscriptionOverview>>

const FONT = 'Inter, system-ui, sans-serif'
const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa' }
const card: React.CSSProperties = { background: '#0e0f16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }
const primaryButton: React.CSSProperties = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', border: 'none', borderRadius: 12, cursor: 'pointer', background: C.gold, color: C.obsidian, fontFamily: FONT, fontSize: 14, fontWeight: 700 }
const disabledButton: React.CSSProperties = { opacity: 0.6, cursor: 'wait' }
const spinnerStyle: React.CSSProperties = { width: 14, height: 14, border: '2px solid rgba(4,4,11,0.3)', borderTopColor: '#04040b', borderRadius: '50%', display: 'inline-block', animation: 'lib-spin 0.7s linear infinite' }

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
    <div style={{ flex: '1 1 140px', minWidth: 140, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
      <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', margin: 0 }}>{label}</p>
      <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: accent || '#fff', margin: '5px 0 0' }}>{value}</p>
    </div>
  )
}

export default function MonAbonnementClient({ profile, subscription }: { profile: ProviderProfileView; subscription: SubscriptionOverview }) {
  const router = useRouter()
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
    <>
      <style>{`@keyframes lib-spin { to { transform: rotate(360deg) } }`}</style>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '22px 16px 110px' }}>
        <button
          onClick={() => router.push('/offer-services')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', fontFamily: FONT, fontSize: 12.5, cursor: 'pointer', padding: 0, marginBottom: 14 }}
        >
          ← Mon espace
        </button>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, letterSpacing: '-.5px', margin: '0 0 4px' }}>Mon abonnement</h1>
        <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.55)', margin: 0 }}>Ce qui rend ton profil visible sur LIVEINBLACK.</p>

        <section style={{ ...card, padding: 18, marginTop: 20, borderLeft: `3px solid ${color}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <h2 style={{ fontFamily: FONT, fontSize: 17, fontWeight: 800, margin: 0, color }}>{title}</h2>
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color, background: `${color}24`, border: `1px solid ${color}59`, borderRadius: 8, padding: '4px 10px' }}>{statusLabel}</span>
          </div>
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.6)', margin: '10px 0 0', lineHeight: 1.5 }}>{message}</p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <InfoTile label={currency === 'EUR' ? 'Prochain prélèvement' : 'Jours restants'} value={currency === 'EUR' ? (expiresAt ? fmtDate(expiresAt) : '—') : expiresAt ? `${daysLeft} j` : '—'} accent={currency === 'XOF' && daysLeft > 0 ? C.teal : currency === 'XOF' ? C.pink : undefined} />
            {currency === 'XOF' && <InfoTile label="Expire le" value={fmtDate(expiresAt)} />}
            <InfoTile label="Zone" value={zone ? `${zone.flag} ${zone.name}` : '—'} />
            <InfoTile label="Tarif" value={currency === 'XOF' ? subPriceLabel() : '9,99 € / mois'} />
          </div>

          <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '12px 0 0' }}>
            {currency === 'XOF' ? 'Paiement Mobile Money / carte (FedaPay) · renouvellement manuel · aucun prélèvement automatique' : 'Carte bancaire (Stripe) · renouvellement automatique chaque mois'}
          </p>

          {msg && <p style={{ fontFamily: FONT, fontSize: 12, color: C.pink, margin: '12px 0 0' }}>{msg}</p>}

          {showCta && (
            <button onClick={() => void (currency === 'XOF' ? handleFedapaySubscribe() : handleStripeSubscribe())} disabled={renewing} style={{ ...primaryButton, marginTop: 16, ...(renewing ? disabledButton : null) }}>
              {renewing ? (
                <>
                  <span style={spinnerStyle} />
                  Redirection…
                </>
              ) : (
                cta
              )}
            </button>
          )}
        </section>

        <section style={{ ...card, padding: 18, marginTop: 16 }}>
          <h2 style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Historique des paiements</h2>
          <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '0 0 4px' }}>Tes reçus d&rsquo;abonnement.</p>
          {subscription.payments.length === 0 ? (
            <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.5)', margin: '16px 0 0' }}>Aucun paiement confirmé dans cet historique.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {subscription.payments.map((payment) => (
                <div key={payment.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 13px', borderRadius: 11, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)' }}>
                  <div>
                    <p style={{ margin: 0, fontFamily: FONT, fontSize: 13, fontWeight: 700 }}>{fmtPaymentAmount(payment.amountMinor, payment.currency)}</p>
                    <p style={{ margin: '3px 0 0', fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.48)' }}>{fmtDate(payment.paidAt)} · {payment.rail === 'stripe' ? 'Carte bancaire' : 'FedaPay'}</p>
                  </div>
                  {payment.receiptUrl ? <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.teal, fontFamily: FONT, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Voir le reçu</a> : <span style={{ color: C.teal, fontFamily: FONT, fontSize: 10.5, fontWeight: 800 }}>PAYÉ</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
