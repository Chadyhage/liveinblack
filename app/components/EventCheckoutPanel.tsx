'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtMoney } from '@/lib/shared/money'
import AgeGateModal from './AgeGateModal'

// Port INTERACTIF de la section « Réservation » de src/pages/EventDetailPage.jsx
// (sélecteur de place + table/groupe, stepper de quantité, précommande, code
// promo, bouton Payer). Ce que ce composant NE reproduit PAS du legacy, et
// pourquoi :
//  - le flux « billet gratuit » (création directe côté client, sans Stripe) EST
//    reproduit, mais via un endpoint serveur dédié plutôt qu'une écriture
//    client directe : quand le total calculé pour la sélection courante est
//    0 (place non-groupe à prix 0, sans précommande payante), le bouton
//    Payer appelle /api/checkout/free (lib/server/freeCheckout.ts) au lieu de
//    /api/checkout(/fedapay) — le billet est émis SYNCHRONE côté serveur
//    (createOrder() + fulfillOrder() directement, sans Stripe/FedaPay), avec
//    les mêmes gardes que le legacy (1 place gratuite par compte et par
//    événement, table de groupe gratuite refusée). Le tunnel payant normal
//    reste inchangé pour toute sélection dont le total est non nul.
//  - le pas-à-pas « place → précommande → confirmation » en 3 écrans + la
//    modale de récap final : ici tout tient sur un seul panneau (place,
//    précommande, promo, total) et le bouton Payer déclenche directement
//    /api/checkout — la modale de récap du legacy n'ajoutait aucune donnée
//    que ce panneau n'affiche déjà avant le clic.
//  - la précommande PAR BILLET (un menu différent pour billet 1 et billet 2) —
//    l'API serveur (lib/server/orders.ts createOrder) n'accepte qu'une seule
//    liste agrégée `preorders: [{name, qty}]` pour toute la commande, donc la
//    précommande est ici globale à la commande, pas billet par billet.
//  - la galerie photo / modale "ce qui est inclus" par place — hors périmètre
//    (checkout, pas présentation).
//  - le code promo n'a plus d'endpoint de validation dédié (route Firestore
//    `event-stock action:'validate_promo'` disparue) → « Appliquer » retient
//    le code localement ; la validation réelle (et la réduction) se fait
//    serveur, au moment du Payer. Une erreur de code promo revient alors
//    inline sur le champ plutôt qu'en bandeau général.

type GroupType = 'solo' | 'group'

export interface CheckoutPlace {
  id: string
  type: string
  price: number
  available: number
  total: number
  maxPerAccount: number
  groupType: GroupType
  groupMin: number
  groupMax: number
  included: { name: string; qty: number }[]
}

export interface CheckoutMenuItem {
  name: string
  emoji: string
  price: number
  description: string
  excludedPlaces: string[]
}

interface EventCheckoutPanelProps {
  eventId: string
  eventMinAge: number
  currency: 'EUR' | 'XOF'
  places: CheckoutPlace[]
  menu: CheckoutMenuItem[]
  preorderEnabled: boolean
  bookingDisabledReason: string | null
  canBook: boolean
  blockedReason: string | null
  loginHref: string
  paymentCancelled: boolean
}

// Codes d'erreur STABLES renvoyés par createOrder()/les routes checkout — le
// reste (message de code promo, garde-fou "1 place de groupe par compte")
// arrive déjà en texte français lisible directement depuis le serveur (voir
// lib/server/promos.ts / lib/server/groupTicketGuard.ts) : on les affiche tels
// quels plutôt que de les remapper.
const ERROR_MESSAGES: Record<string, string> = {
  event_not_found: 'Cet événement est introuvable.',
  event_cancelled: 'Cet événement a été annulé.',
  event_ended: 'Cet événement est déjà terminé.',
  event_not_published: "Cet événement n'est pas encore publié.",
  private_event_locked: 'Cet événement est privé — déverrouille-le avant de réserver.',
  place_not_found: "Cette place n'existe plus. Réactualise la page.",
  not_a_group_place: "Cette place n'est pas une place de groupe.",
  max_per_account_exceeded: 'Tu as atteint la limite autorisée pour cette place sur ce compte.',
  insufficient_stock: 'Il ne reste plus assez de places disponibles.',
  wrong_rail_for_currency: 'Erreur de configuration de paiement — réessaye.',
  wrong_rail_use_stripe: 'Erreur de configuration de paiement — réessaye.',
  promo_makes_ticket_free: 'Ce code promo rendrait le billet gratuit, ce qui n’est pas autorisé.',
  nothing_to_pay: 'Rien à payer pour cette sélection.',
  amount_below_minimum: 'Le montant total est trop faible pour être payé.',
  invalid_body: 'Requête invalide — réessaye.',
  stripe_error: 'Le paiement par carte est momentanément indisponible. Réessaye plus tard.',
  fedapay_error: 'Le paiement Mobile Money est momentanément indisponible. Réessaye plus tard.',
  order_creation_failed: 'Une erreur est survenue — réessaye dans un instant.',
  internal_error: 'Une erreur est survenue — réessaye dans un instant.',
  auth_required: 'Ta session a expiré — reconnecte-toi pour continuer.',
  // /api/checkout/free (lib/server/freeCheckout.ts) uniquement :
  already_free: 'Tu as déjà réservé ta place gratuite pour cet événement — une seule par compte.',
  free_qty_exceeds_one: 'Une seule place gratuite par compte et par événement.',
  free_table_not_supported: "Cette place de groupe n'a pas de tarif — contacte l'organisateur.",
  not_free: "Cette sélection n'est en réalité pas gratuite — réessaye pour continuer avec le paiement.",
  refunded_cancelled_event: 'Cet événement a été annulé.',
}
const GENERIC_ERROR = 'Une erreur est survenue — réessaye dans un instant.'

function resolveErrorMessage(code: string | null | undefined): string {
  if (!code) return GENERIC_ERROR
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  // Messages déjà en français lisible renvoyés tels quels par le serveur
  // (code promo, garde-fou place de groupe) : ils contiennent des espaces,
  // contrairement aux codes machine ci-dessus.
  if (code.includes(' ')) return code
  return GENERIC_ERROR
}

function isPromoRelatedError(code: string | null | undefined): boolean {
  if (!code) return false
  return code === 'promo_makes_ticket_free' || code.toLowerCase().includes('promo')
}

const MAX_PREORDER_ITEM_QTY = 20

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(4,18,14,0.25)" strokeWidth={3} />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="#04120e" strokeWidth={3} strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

export default function EventCheckoutPanel({
  eventId,
  eventMinAge,
  currency,
  places,
  menu,
  preorderEnabled,
  bookingDisabledReason,
  canBook,
  blockedReason,
  loginHref,
  paymentCancelled,
}: EventCheckoutPanelProps) {
  const router = useRouter()
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [preorderQty, setPreorderQty] = useState<Record<string, number>>({})
  const [promoInput, setPromoInput] = useState('')
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoApplied, setPromoApplied] = useState<string | null>(null)
  const [promoFieldError, setPromoFieldError] = useState('')
  const [showAgeModal, setShowAgeModal] = useState(false)
  const [ageVerified, setAgeVerified] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [cancelNoticeVisible, setCancelNoticeVisible] = useState(paymentCancelled)

  const selectedPlace = places.find((p) => p.id === selectedPlaceId) || null
  const isGroup = selectedPlace?.groupType === 'group'
  const maxPerAccount = selectedPlace?.maxPerAccount || 0
  const maxQty = selectedPlace
    ? Math.max(
        1,
        Math.min(
          selectedPlace.available > 0 ? selectedPlace.available : 1,
          maxPerAccount > 0 ? maxPerAccount : Infinity,
          selectedPlace.price === 0 ? 1 : Infinity
        )
      )
    : 1
  const activeMenu = selectedPlace ? menu.filter((item) => !item.excludedPlaces.includes(selectedPlace.type)) : []
  const placePrice = selectedPlace?.price || 0
  const lineQty = isGroup ? 1 : qty
  const preorderTotal = activeMenu.reduce((sum, item) => sum + (preorderQty[item.name] || 0) * item.price, 0)
  const grandTotal = placePrice * lineQty + preorderTotal
  const disabled = Boolean(bookingDisabledReason)

  function selectPlace(id: string) {
    setSelectedPlaceId((cur) => (cur === id ? null : id))
    setQty(1)
    setPreorderQty({})
    setPromoApplied(null)
    setPromoInput('')
    setPromoOpen(false)
    setPromoFieldError('')
    setCheckoutError('')
  }

  function updatePreorder(name: string, delta: number) {
    setPreorderQty((prev) => ({ ...prev, [name]: Math.min(MAX_PREORDER_ITEM_QTY, Math.max(0, (prev[name] || 0) + delta)) }))
  }

  function applyPromo() {
    const code = promoInput.trim().toUpperCase()
    if (!code) return
    setPromoApplied(code)
    setPromoInput('')
    setPromoOpen(false)
    setPromoFieldError('')
  }

  function removePromo() {
    setPromoApplied(null)
    setPromoFieldError('')
  }

  function handleBuyClick() {
    if (!selectedPlace || disabled || !canBook || submitting) return
    if (eventMinAge >= 18 && !ageVerified) {
      setShowAgeModal(true)
      return
    }
    void doCheckout()
  }

  function confirmAge() {
    setAgeVerified(true)
    setShowAgeModal(false)
    void doCheckout()
  }

  async function doCheckout() {
    if (!selectedPlace) return
    setSubmitting(true)
    setCheckoutError('')
    setPromoFieldError('')

    const preorders = activeMenu
      .filter((item) => (preorderQty[item.name] || 0) > 0)
      .map((item) => ({ name: item.name, qty: preorderQty[item.name] }))

    // Sélection réellement gratuite (place non-groupe à prix 0, sans
    // précommande payante) : /api/checkout/free émet le billet SYNCHRONE côté
    // serveur (lib/server/freeCheckout.ts) — pas de Stripe/FedaPay. Le serveur
    // revérifie ce total de façon autoritaire (jamais confiance au calcul
    // client) : toute autre sélection passe par le tunnel payant normal.
    const isFreeSelection = grandTotal === 0 && !isGroup

    const body = isFreeSelection
      ? { eventId, placeId: selectedPlace.id, qty, isTable: false, preorders }
      : {
          eventId,
          placeId: selectedPlace.id,
          qty: isGroup ? 1 : qty,
          isTable: isGroup,
          promoCode: promoApplied || null,
          preorders,
        }
    const endpoint = isFreeSelection ? '/api/checkout/free' : currency === 'XOF' ? '/api/checkout/fedapay' : '/api/checkout'

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => null)) as { url?: string; orderId?: string; error?: string } | null
      const success = isFreeSelection ? Boolean(data?.orderId) : Boolean(data?.url)
      if (!res.ok || !success) {
        setSubmitting(false)
        const code = data?.error
        if (code === 'auth_required') {
          router.push(loginHref)
          return
        }
        const message = resolveErrorMessage(code)
        if (promoApplied && isPromoRelatedError(code)) {
          setPromoFieldError(message)
          setPromoApplied(null)
          setPromoOpen(true)
        } else {
          setCheckoutError(message)
        }
        return
      }
      if (isFreeSelection) {
        // Billet déjà émis — direction la page de confirmation, qui reconnaît
        // order_id + free=true et affiche l'état "success" sans interroger
        // Stripe/FedaPay (voir GET /api/checkout et PaymentSuccessClient.tsx).
        router.push(`/payment-success?order_id=${encodeURIComponent(data!.orderId as string)}&free=true`)
        return
      }
      window.location.assign(data!.url as string)
    } catch {
      setSubmitting(false)
      setCheckoutError('Connexion impossible — réessaye dans un instant.')
    }
  }

  const buyLabel = submitting
    ? 'Redirection vers le paiement…'
    : isGroup
      ? `Réserver la table · ${fmtMoney(placePrice, currency)}`
      : `Réserver · ${fmtMoney(grandTotal, currency)}`

  const buyDisabled = disabled || !canBook || submitting

  return (
    <section style={{ padding: '22px 22px 0' }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>Réservation</h2>

      {cancelNoticeVisible && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(200,169,110,0.08)',
            border: '1px solid rgba(200,169,110,0.3)',
            borderLeft: '3px solid var(--gold)',
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
            Paiement annulé — aucun montant n&apos;a été débité. Tu peux réessayer quand tu veux.
          </p>
          <button
            onClick={() => setCancelNoticeVisible(false)}
            aria-label="Fermer"
            style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0 }}
          >
            ×
          </button>
        </div>
      )}

      {blockedReason && (
        <div
          style={{
            marginBottom: 14,
            padding: '14px 16px',
            background: 'rgba(200,169,110,0.07)',
            border: '1px solid rgba(200,169,110,0.22)',
            borderRadius: 14,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: 0, lineHeight: 1.4 }}>{blockedReason}</p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '4px 0 0', lineHeight: 1.45 }}>Pour réserver des places, utilise un compte client.</p>
        </div>
      )}

      {disabled && (
        <div style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.28)', borderRadius: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pink)', margin: 0 }}>{bookingDisabledReason}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {places.map((place) => {
          const isSelected = selectedPlaceId === place.id
          const soldOut = place.available <= 0
          const placeDisabled = soldOut || Boolean(blockedReason)
          return (
            <button
              key={place.id}
              type="button"
              onClick={() => !placeDisabled && selectPlace(place.id)}
              disabled={placeDisabled}
              style={{
                textAlign: 'left',
                cursor: placeDisabled ? 'not-allowed' : 'pointer',
                background: 'var(--surface)',
                border: `1px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                borderRadius: 12,
                padding: 16,
                opacity: placeDisabled ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{place.type}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(place.price, currency)}</span>
              </div>
              {place.groupType === 'group' && (
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: 6,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: 'var(--violet)',
                    background: 'rgba(139,92,246,.14)',
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  Place de groupe · {place.groupMin}-{place.groupMax} pers.
                </span>
              )}
              <p style={{ fontSize: 12, color: soldOut ? 'var(--pink)' : 'var(--text-faint)', margin: '8px 0 0' }}>
                {soldOut ? 'Complet' : `${place.available}/${place.total} restantes`}
              </p>
              {place.included?.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {place.included.map((inc) => (
                    <li key={inc.name} style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                      {inc.qty > 1 ? `${inc.qty}× ` : ''}
                      {inc.name}
                    </li>
                  ))}
                </ul>
              )}
              <span style={{ display: 'inline-block', marginTop: 10, fontSize: 10.5, fontWeight: 700, color: isSelected ? 'var(--gold)' : 'var(--text-faint)' }}>
                {isSelected ? '✓ Choisi' : soldOut ? 'Complet' : 'Choisir'}
              </span>
            </button>
          )
        })}
      </div>

      {selectedPlace && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Place sélectionnée</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{selectedPlace.type}</span>
            </div>

            {!isGroup ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Quantité</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StepperButton onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} label="−" ariaLabel={`Diminuer la quantité de ${selectedPlace.type}`} variant="ghost" />
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold)', width: 18, textAlign: 'center' }}>{qty}</span>
                  <StepperButton onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} label="+" ariaLabel={`Augmenter la quantité de ${selectedPlace.type}`} variant="solid" />
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                Vendue comme place de groupe entière, pour {selectedPlace.groupMin}-{selectedPlace.groupMax} personnes.
              </p>
            )}
            {!isGroup && maxPerAccount > 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-4px 0 0', textAlign: 'right' }}>Max {maxPerAccount} par compte</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{qty > 1 && !isGroup ? `Prix (${fmtMoney(placePrice, currency)} × ${qty})` : 'Prix'}</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(placePrice * lineQty, currency)}</span>
            </div>

            {placePrice > 0 &&
              (promoApplied ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    Code {promoApplied} — sera vérifié au paiement
                    <button
                      onClick={removePromo}
                      style={{ background: 'none', border: 'none', color: 'var(--pink)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}
                    >
                      Retirer
                    </button>
                  </span>
                </div>
              ) : promoOpen ? (
                <div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value.toUpperCase())
                        setPromoFieldError('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyPromo()
                      }}
                      placeholder="TON CODE"
                      aria-label="Code promo"
                      autoFocus
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '10px 12px',
                        borderRadius: 9,
                        border: `1px solid ${promoFieldError ? 'var(--pink)' : 'var(--border-strong)'}`,
                        background: 'var(--obsidian)',
                        color: 'var(--text)',
                        fontSize: 13,
                        letterSpacing: '0.06em',
                        outline: 'none',
                        textTransform: 'uppercase',
                      }}
                    />
                    <button
                      onClick={applyPromo}
                      disabled={!promoInput.trim()}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 9,
                        border: 'none',
                        background: !promoInput.trim() ? 'var(--surface-2)' : 'var(--teal-solid)',
                        color: !promoInput.trim() ? 'var(--text-faint)' : '#04120e',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: !promoInput.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Appliquer
                    </button>
                  </div>
                  {promoFieldError && <p style={{ margin: '7px 0 0', color: 'var(--pink)', fontSize: 12 }}>{promoFieldError}</p>}
                </div>
              ) : (
                <button
                  onClick={() => setPromoOpen(true)}
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Ajouter un code promo
                </button>
              ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Points fidélité</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>+1 par billet scanné à l&apos;entrée</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Paiement</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>
                {grandTotal > 0 ? (currency === 'XOF' ? 'Sécurisé · Mobile Money (FedaPay)' : 'Sécurisé · Stripe') : 'Gratuit'}
              </span>
            </div>
          </div>

          {preorderEnabled && activeMenu.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Précommande de consommations</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Optionnel · récupère ta commande à l&apos;entrée sans attendre.</p>
              </div>
              {activeMenu.map((item) => {
                const q = preorderQty[item.name] || 0
                return (
                  <div
                    key={item.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${q > 0 ? 'rgba(200,169,110,0.3)' : 'var(--border)'}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                        {item.emoji ? `${item.emoji} ` : ''}
                        {item.name}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--gold)', margin: '2px 0 0' }}>{fmtMoney(item.price, currency)}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <StepperButton onClick={() => updatePreorder(item.name, -1)} disabled={q === 0} label="−" ariaLabel={`Diminuer la quantité de ${item.name}`} variant="ghost" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: q > 0 ? 'var(--gold)' : 'var(--text-faint)', width: 16, textAlign: 'center' }}>{q}</span>
                      <StepperButton onClick={() => updatePreorder(item.name, 1)} disabled={q >= MAX_PREORDER_ITEM_QTY} label="+" ariaLabel={`Augmenter la quantité de ${item.name}`} variant="solid" />
                    </div>
                  </div>
                )
              })}
              {preorderTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Total précommande</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(preorderTotal, currency)}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 2px' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)' }}>{fmtMoney(grandTotal, currency)}</span>
          </div>

          {eventMinAge >= 18 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(200,169,110,0.07)', border: '1px solid rgba(200,169,110,0.22)', borderRadius: 12, padding: '11px 14px' }}>
              <span
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: '1px solid rgba(200,169,110,0.4)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--gold)',
                }}
              >
                {eventMinAge}+
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Événement {eventMinAge}+ · une pièce d&apos;identité pourra être demandée à l&apos;entrée.
              </span>
            </div>
          )}

          {checkoutError && (
            <div role="alert" style={{ background: 'rgba(224,90,170,0.10)', border: '1px solid rgba(224,90,170,0.30)', borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 13, color: 'var(--pink)', margin: 0, lineHeight: 1.5 }}>{checkoutError}</p>
            </div>
          )}

          <button
            onClick={handleBuyClick}
            disabled={buyDisabled}
            style={{
              padding: '16px',
              borderRadius: 14,
              border: 'none',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              fontSize: 15.5,
              fontWeight: 700,
              color: buyDisabled ? 'var(--text-faint)' : '#04120e',
              background: buyDisabled ? 'var(--surface-2)' : 'linear-gradient(135deg,#c8a96e,#e0c48a)',
              boxShadow: buyDisabled ? 'none' : '0 8px 26px rgba(200,169,110,0.32)',
              cursor: buyDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting && <Spinner />}
            {disabled ? bookingDisabledReason : buyLabel}
          </button>
        </div>
      )}

      {showAgeModal && <AgeGateModal minAge={eventMinAge} onConfirm={confirmAge} onCancel={() => setShowAgeModal(false)} />}
    </section>
  )
}

function StepperButton({ onClick, disabled, label, ariaLabel, variant }: { onClick: () => void; disabled?: boolean; label: string; ariaLabel: string; variant: 'ghost' | 'solid' }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        border: variant === 'ghost' ? '1px solid var(--border-strong)' : 'none',
        background: variant === 'ghost' ? 'var(--surface-2)' : 'var(--gold)',
        color: variant === 'ghost' ? 'var(--text-muted)' : '#1a1206',
      }}
    >
      {label}
    </button>
  )
}
