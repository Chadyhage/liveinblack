'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { fmtMoney } from '@/lib/shared/money'
import { computeTicketFeeCents, computeTicketFeeXOF } from '@/lib/shared/fees'
import type { ShowOption } from '@/lib/shared/showOptions'
import AgeGateModal from './AgeGateModal'

// Port INTERACTIF de la section « Réservation » de src/pages/EventDetailPage.jsx
// (sélecteur de place + table/groupe, stepper de quantité, précommande, code
// promo, confirmation, options show et bouton Payer). Les différences
// techniques avec le legacy renforcent les frontières serveur :
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
//  - la sélection tient sur un panneau continu, puis une modale récapitule la
//    commande avant toute redirection vers le moyen de paiement.
//  - les précommandes sont réparties par billet dans `ticketPreorders`, avec
//    un agrégat serveur conservé pour les montants Stripe/FedaPay.
//  - le code promo est prévalidé par un endpoint dédié, puis revérifié lors
//    de la création autoritaire de l'Order pour éviter toute course.

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
  photos: string[]
  included: { name: string; qty: number }[]
}

export interface CheckoutMenuItem {
  name: string
  emoji: string
  imageUrl: string | null
  price: number
  description: string
  hasShow: boolean
  showOptions: ShowOption[]
  excludedPlaces: string[]
}

interface SelectedShow {
  showOptionId: string
  showLabel: string
  showInfo: string
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
  invalid_ticket_preorders: 'La personnalisation des billets est invalide — vérifie les précommandes.',
  invalid_show_option: "Une option show n'est plus disponible pour cette place.",
  show_info_required: "Une information demandée pour le show est manquante.",
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
  const [preordersByTicket, setPreordersByTicket] = useState<Record<number, Record<string, number>>>({ 0: {} })
  const [showsByTicket, setShowsByTicket] = useState<Record<number, Record<string, SelectedShow>>>({})
  const [preorderTicketIndex, setPreorderTicketIndex] = useState(0)
  const [showInfoModal, setShowInfoModal] = useState<{ ticketIndex: number; itemName: string; option: ShowOption } | null>(null)
  const [showInfoInput, setShowInfoInput] = useState('')
  const [promoInput, setPromoInput] = useState('')
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoApplied, setPromoApplied] = useState<string | null>(null)
  const [promoFieldError, setPromoFieldError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoUnitDiscount, setPromoUnitDiscount] = useState(0)
  const [promoLabel, setPromoLabel] = useState('')
  const [showAgeModal, setShowAgeModal] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [ageVerified, setAgeVerified] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [cancelNoticeVisible, setCancelNoticeVisible] = useState(paymentCancelled)
  const [photoGallery, setPhotoGallery] = useState<{ type: string; photos: string[]; index: number } | null>(null)
  const [includedModal, setIncludedModal] = useState<CheckoutPlace | null>(null)

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
  const discountedPlacePrice = Math.max(0, placePrice - promoUnitDiscount)
  const lineQty = isGroup ? 1 : qty
  const ticketCount = selectedPlace ? (isGroup ? Math.max(1, selectedPlace.groupMax) : qty) : 1
  const preorderQty = preordersByTicket[preorderTicketIndex] || {}
  const preorderTotal = Object.values(preordersByTicket).reduce((total, ticketItems) => total + activeMenu.reduce((sum, item) => sum + (ticketItems[item.name] || 0) * item.price, 0), 0)
  const fee = currency === 'XOF' ? computeTicketFeeXOF(discountedPlacePrice, lineQty) : computeTicketFeeCents(Math.round(discountedPlacePrice * 100), lineQty) / 100
  const grandTotal = discountedPlacePrice * lineQty + preorderTotal + fee
  const disabled = Boolean(bookingDisabledReason)

  function selectPlace(id: string) {
    setSelectedPlaceId((cur) => (cur === id ? null : id))
    setQty(1)
    setPreordersByTicket({ 0: {} })
    setShowsByTicket({})
    setPreorderTicketIndex(0)
    setPromoApplied(null)
    setPromoInput('')
    setPromoOpen(false)
    setPromoFieldError('')
    setPromoUnitDiscount(0)
    setPromoLabel('')
    setCheckoutError('')
  }

  function updatePreorder(name: string, delta: number) {
    const ticket = preordersByTicket[preorderTicketIndex] || {}
    const next = Math.min(MAX_PREORDER_ITEM_QTY, Math.max(0, (ticket[name] || 0) + delta))
    setPreordersByTicket((current) => ({ ...current, [preorderTicketIndex]: { ...(current[preorderTicketIndex] || {}), [name]: next } }))
    if (next === 0) {
      setShowsByTicket((current) => ({ ...current, [preorderTicketIndex]: Object.fromEntries(Object.entries(current[preorderTicketIndex] || {}).filter(([itemName]) => itemName !== name)) }))
    }
  }

  function chooseShow(itemName: string, option: ShowOption) {
    const selected = showsByTicket[preorderTicketIndex]?.[itemName]
    if (selected?.showOptionId === option.id) {
      setShowsByTicket((current) => ({ ...current, [preorderTicketIndex]: Object.fromEntries(Object.entries(current[preorderTicketIndex] || {}).filter(([name]) => name !== itemName)) }))
      return
    }
    if (option.requiresInfo) {
      setShowInfoInput('')
      setShowInfoModal({ ticketIndex: preorderTicketIndex, itemName, option })
      return
    }
    setShowsByTicket((current) => ({ ...current, [preorderTicketIndex]: { ...(current[preorderTicketIndex] || {}), [itemName]: { showOptionId: option.id, showLabel: option.label, showInfo: '' } } }))
  }

  function confirmShowInfo() {
    if (!showInfoModal || !showInfoInput.trim()) return
    const { ticketIndex, itemName, option } = showInfoModal
    setShowsByTicket((current) => ({ ...current, [ticketIndex]: { ...(current[ticketIndex] || {}), [itemName]: { showOptionId: option.id, showLabel: option.label, showInfo: showInfoInput.trim().slice(0, 240) } } }))
    setShowInfoModal(null)
    setShowInfoInput('')
  }

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase()
    if (!code || !selectedPlace || promoLoading) return
    setPromoLoading(true)
    setPromoFieldError('')
    try {
      const response = await fetch(`/api/events/${eventId}/promo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, placeId: selectedPlace.id, qty: isGroup ? 1 : qty }) })
      const data = await response.json().catch(() => null) as { code?: string; label?: string; unitDiscount?: number; message?: string; error?: string } | null
      if (!response.ok || !data?.code) {
        setPromoFieldError(data?.message || (data?.error === 'rate_limited' ? 'Trop de tentatives. Réessaie dans quelques minutes.' : data?.error === 'promo_makes_ticket_free' ? ERROR_MESSAGES.promo_makes_ticket_free : 'Code promo invalide.'))
        return
      }
      setPromoApplied(data.code)
      setPromoUnitDiscount(Math.max(0, Number(data.unitDiscount) || 0))
      setPromoLabel(data.label || '')
      setPromoInput('')
      setPromoOpen(false)
    } catch {
      setPromoFieldError('Connexion impossible. Réessaie.')
    } finally {
      setPromoLoading(false)
    }
  }

  function removePromo() {
    setPromoApplied(null)
    setPromoUnitDiscount(0)
    setPromoLabel('')
    setPromoFieldError('')
  }

  function changeQty(next: number) {
    setQty(next)
    setPreordersByTicket((current) => Object.fromEntries(Object.entries(current).filter(([index]) => Number(index) < next)))
    setShowsByTicket((current) => Object.fromEntries(Object.entries(current).filter(([index]) => Number(index) < next)))
    setPreorderTicketIndex((current) => Math.min(current, next - 1))
    if (promoApplied) removePromo()
  }

  function handleBuyClick() {
    if (!selectedPlace || disabled || !canBook || submitting) return
    if (eventMinAge >= 18 && !ageVerified) {
      setShowAgeModal(true)
      return
    }
    setShowConfirmation(true)
  }

  function confirmAge() {
    setAgeVerified(true)
    setShowAgeModal(false)
    setShowConfirmation(true)
  }

  async function doCheckout() {
    if (!selectedPlace) return
    setShowConfirmation(false)
    setSubmitting(true)
    setCheckoutError('')
    setPromoFieldError('')

    const ticketPreorders = Array.from({ length: ticketCount }, (_, ticketIndex) => ({
      ticketIndex,
      items: activeMenu.filter((item) => (preordersByTicket[ticketIndex]?.[item.name] || 0) > 0).map((item) => {
        const show = showsByTicket[ticketIndex]?.[item.name]
        return { name: item.name, qty: preordersByTicket[ticketIndex][item.name], ...(show ? { showOptionId: show.showOptionId, showInfo: show.showInfo } : {}) }
      }),
    })).filter((group) => group.items.length > 0)

    // Sélection réellement gratuite (place non-groupe à prix 0, sans
    // précommande payante) : /api/checkout/free émet le billet SYNCHRONE côté
    // serveur (lib/server/freeCheckout.ts) — pas de Stripe/FedaPay. Le serveur
    // revérifie ce total de façon autoritaire (jamais confiance au calcul
    // client) : toute autre sélection passe par le tunnel payant normal.
    const isFreeSelection = grandTotal === 0 && !isGroup

    const body = isFreeSelection
      ? { eventId, placeId: selectedPlace.id, qty, isTable: false, preorders: [], ticketPreorders }
      : {
          eventId,
          placeId: selectedPlace.id,
          qty: isGroup ? 1 : qty,
          isTable: isGroup,
          promoCode: promoApplied || null,
          preorders: [],
          ticketPreorders,
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
    : `Vérifier ma commande · ${fmtMoney(grandTotal, currency)}`

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
            <div
              key={place.id}
              onClick={() => !placeDisabled && selectPlace(place.id)}
              onKeyDown={(event) => {
                if (!placeDisabled && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  selectPlace(place.id)
                }
              }}
              role="button"
              tabIndex={placeDisabled ? -1 : 0}
              aria-disabled={placeDisabled}
              aria-pressed={isSelected}
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
              {(place.photos.length > 0 || place.included.length > 0) && (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                  {place.photos.length > 0 && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setPhotoGallery({ type: place.type, photos: place.photos, index: 0 })
                      }}
                      style={detailButton}
                    >
                      Voir la place · {place.photos.length} photo{place.photos.length > 1 ? 's' : ''}
                    </button>
                  )}
                  {place.included.length > 0 && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setIncludedModal(place)
                      }}
                      style={detailButton}
                    >
                      Ce qui est inclus · {place.included.length}
                    </button>
                  )}
                </div>
              )}
              <span style={{ display: 'inline-block', marginTop: 10, fontSize: 10.5, fontWeight: 700, color: isSelected ? 'var(--gold)' : 'var(--text-faint)' }}>
                {isSelected ? '✓ Choisi' : soldOut ? 'Complet' : 'Choisir'}
              </span>
            </div>
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
                  <StepperButton onClick={() => changeQty(Math.max(1, qty - 1))} disabled={qty <= 1} label="−" ariaLabel={`Diminuer la quantité de ${selectedPlace.type}`} variant="ghost" />
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold)', width: 18, textAlign: 'center' }}>{qty}</span>
                  <StepperButton onClick={() => changeQty(Math.min(maxQty, qty + 1))} disabled={qty >= maxQty} label="+" ariaLabel={`Augmenter la quantité de ${selectedPlace.type}`} variant="solid" />
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
                    Code {promoApplied} {promoLabel && `· ${promoLabel}`}
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
                        if (e.key === 'Enter') void applyPromo()
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
                      onClick={() => void applyPromo()}
                      disabled={!promoInput.trim() || promoLoading}
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
                      {promoLoading ? 'Vérification…' : 'Appliquer'}
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

            {promoApplied && promoUnitDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--teal)' }}>Réduction</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>− {fmtMoney(promoUnitDiscount * lineQty, currency)}</span>
              </div>
            )}

            {fee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Frais de service</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(fee, currency)}</span>
              </div>
            )}

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
                <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Optionnel · choisis les consommations de chaque billet.</p>
              </div>
              {ticketCount > 1 && (
                <div role="tablist" aria-label="Billet à personnaliser" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                  {Array.from({ length: ticketCount }, (_, index) => {
                    const count = Object.values(preordersByTicket[index] || {}).reduce((sum, value) => sum + value, 0)
                    const active = preorderTicketIndex === index
                    return <button key={index} type="button" role="tab" aria-selected={active} onClick={() => setPreorderTicketIndex(index)} style={{ flexShrink: 0, padding: '8px 11px', borderRadius: 9, border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`, background: active ? 'rgba(200,169,110,.12)' : 'var(--surface-2)', color: active ? 'var(--gold)' : 'var(--text-muted)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>Billet {index + 1}{count > 0 ? ` · ${count}` : ''}</button>
                  })}
                </div>
              )}
              {activeMenu.map((item) => {
                const q = preorderQty[item.name] || 0
                const availableShows = item.hasShow ? item.showOptions.filter((option) => !option.excludedPlaces.includes(selectedPlace.type)) : []
                const selectedShow = showsByTicket[preorderTicketIndex]?.[item.name]
                return (
                  <div
                    key={item.name}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${q > 0 ? 'rgba(200,169,110,0.3)' : 'var(--border)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        {item.imageUrl ? <Image src={item.imageUrl} alt="" width={42} height={42} style={{ borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} /> : item.emoji ? <span aria-hidden="true" style={{ width: 34, textAlign: 'center', fontSize: 22 }}>{item.emoji}</span> : null}
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{item.name}</p>
                          {item.description && <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</p>}
                          <p style={{ fontSize: 12, color: 'var(--gold)', margin: '2px 0 0' }}>{fmtMoney(item.price, currency)}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <StepperButton onClick={() => updatePreorder(item.name, -1)} disabled={q === 0} label="−" ariaLabel={`Diminuer la quantité de ${item.name}`} variant="ghost" />
                        <span style={{ fontSize: 14, fontWeight: 700, color: q > 0 ? 'var(--gold)' : 'var(--text-faint)', width: 16, textAlign: 'center' }}>{q}</span>
                        <StepperButton onClick={() => updatePreorder(item.name, 1)} disabled={q >= MAX_PREORDER_ITEM_QTY} label="+" ariaLabel={`Augmenter la quantité de ${item.name}`} variant="solid" />
                      </div>
                    </div>
                    {q > 0 && availableShows.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                        <p style={{ margin: '0 0 7px', color: 'var(--text-faint)', fontSize: 10.5, fontWeight: 700 }}>Ajouter un show à la livraison (optionnel)</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {availableShows.map((option) => {
                            const active = selectedShow?.showOptionId === option.id
                            return <button key={option.id} type="button" onClick={() => chooseShow(item.name, option)} aria-pressed={active} style={{ padding: '6px 9px', borderRadius: 8, border: `1px solid ${active ? 'var(--teal)' : 'var(--border-strong)'}`, background: active ? 'rgba(78,232,200,.1)' : 'var(--surface-2)', color: active ? 'var(--teal)' : 'var(--text-muted)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{option.label}{option.requiresInfo && !active ? ' · à préciser' : ''}</button>
                          })}
                        </div>
                        {selectedShow && <p style={{ margin: '7px 0 0', color: 'var(--teal)', fontSize: 10.5 }}>Show choisi : {selectedShow.showLabel}{selectedShow.showInfo ? ` · ${selectedShow.showInfo}` : ''}</p>}
                      </div>
                    )}
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

      {photoGallery && (
        <div role="dialog" aria-modal="true" aria-label={`Photos de la place ${photoGallery.type}`} onClick={() => setPhotoGallery(null)} style={modalBackdrop}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 760, position: 'relative' }}>
            <button type="button" onClick={() => setPhotoGallery(null)} aria-label="Fermer la galerie" style={modalClose}>×</button>
            <div style={{ aspectRatio: '4/3', borderRadius: 18, overflow: 'hidden', background: '#090a10', border: '1px solid var(--border-strong)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoGallery.photos[photoGallery.index]} alt={`${photoGallery.type}, photo ${photoGallery.index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
              <button type="button" onClick={() => setPhotoGallery((current) => current && ({ ...current, index: (current.index - 1 + current.photos.length) % current.photos.length }))} disabled={photoGallery.photos.length < 2} style={galleryButton}>Précédente</button>
              <p style={{ margin: 0, color: '#fff', fontSize: 13, fontWeight: 700 }}>{photoGallery.type} · {photoGallery.index + 1}/{photoGallery.photos.length}</p>
              <button type="button" onClick={() => setPhotoGallery((current) => current && ({ ...current, index: (current.index + 1) % current.photos.length }))} disabled={photoGallery.photos.length < 2} style={galleryButton}>Suivante</button>
            </div>
          </div>
        </div>
      )}

      {includedModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="included-modal-title" onClick={() => setIncludedModal(null)} style={modalBackdrop}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 430, padding: 22, borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 24px 64px rgba(0,0,0,.55)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div><p style={{ margin: 0, color: 'var(--gold)', fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' }}>Inclus dans ce billet</p><h3 id="included-modal-title" style={{ margin: '3px 0 0', fontSize: 20 }}>{includedModal.type}</h3></div>
              <button type="button" onClick={() => setIncludedModal(null)} aria-label="Fermer" style={{ ...modalClose, position: 'static' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
              <IncludedRow label="1 entrée à la soirée" />
              {includedModal.included.map((item) => {
                const menuItem = menu.find((entry) => entry.name === item.name)
                return <IncludedRow key={item.name} label={`${item.qty || 1}× ${item.name}`} emoji={menuItem?.emoji} />
              })}
            </div>
            <p style={{ margin: '16px 0 0', color: 'var(--text-faint)', fontSize: 12, lineHeight: 1.55 }}>Ces options seront servies sur place et validées par le staff depuis ton billet.</p>
          </div>
        </div>
      )}

      {showInfoModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="show-info-title" onClick={() => setShowInfoModal(null)} style={modalBackdrop}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 430, padding: 24, borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 24px 64px rgba(0,0,0,.55)' }}>
            <p style={{ margin: 0, color: 'var(--gold)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>Personnaliser le show</p>
            <h3 id="show-info-title" style={{ margin: '5px 0 4px', fontSize: 20 }}>{showInfoModal.option.label}</h3>
            <p style={{ margin: '0 0 14px', color: 'var(--text-faint)', fontSize: 12 }}>Pour {showInfoModal.itemName} · billet {showInfoModal.ticketIndex + 1}</p>
            <label htmlFor="show-info-input" style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{showInfoModal.option.infoPrompt || 'Information à transmettre au staff'}</label>
            <textarea id="show-info-input" autoFocus rows={3} maxLength={240} value={showInfoInput} onChange={(event) => setShowInfoInput(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 11, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', padding: '11px 12px', font: 'inherit' }} />
            <p style={{ margin: '5px 0 0', color: 'var(--text-faint)', textAlign: 'right', fontSize: 10 }}>{showInfoInput.length}/240</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}><button type="button" onClick={() => setShowInfoModal(null)} style={{ ...secondaryAction, flex: 1 }}>Annuler</button><button type="button" onClick={confirmShowInfo} disabled={!showInfoInput.trim()} style={{ ...primaryAction, flex: 1, opacity: showInfoInput.trim() ? 1 : .45 }}>Valider</button></div>
          </div>
        </div>
      )}

      {showConfirmation && selectedPlace && (
        <div role="dialog" aria-modal="true" aria-labelledby="checkout-confirm-title" onClick={() => !submitting && setShowConfirmation(false)} style={modalBackdrop}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 470, padding: 24, borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 24px 64px rgba(0,0,0,.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div><p style={{ margin: 0, color: 'var(--teal)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>Dernière vérification</p><h3 id="checkout-confirm-title" style={{ margin: '4px 0 0', fontSize: 22 }}>Récapitulatif</h3></div><button type="button" onClick={() => setShowConfirmation(false)} aria-label="Fermer" style={{ ...modalClose, position: 'static' }}>×</button></div>
            <div style={{ display: 'grid', gap: 9, marginTop: 20 }}>
              <SummaryRow label="Place" value={selectedPlace.type} />
              <SummaryRow label="Quantité" value={String(lineQty)} />
              {Array.from({ length: ticketCount }, (_, ticketIndex) => {
                const entries = Object.entries(preordersByTicket[ticketIndex] || {}).filter(([, count]) => count > 0)
                if (!entries.length) return null
                return <div key={ticketIndex} style={{ padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,.035)' }}><p style={{ margin: '0 0 6px', color: 'var(--gold)', fontSize: 11, fontWeight: 800 }}>Billet {ticketIndex + 1}</p>{entries.map(([name, count]) => { const show = showsByTicket[ticketIndex]?.[name]; return <div key={name} style={{ marginBottom: 4 }}><SummaryRow label={name} value={`${count}×`} />{show && <p style={{ margin: '2px 0 0', color: 'var(--teal)', fontSize: 10.5 }}>{show.showLabel}{show.showInfo ? ` · ${show.showInfo}` : ''}</p>}</div> })}</div>
              })}
              {promoApplied && <SummaryRow label={`Code ${promoApplied}`} value={`− ${fmtMoney(promoUnitDiscount * lineQty, currency)}`} accent />}
              {fee > 0 && <SummaryRow label="Frais de service" value={fmtMoney(fee, currency)} />}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 3, paddingTop: 12 }}><SummaryRow label="Total à payer" value={fmtMoney(grandTotal, currency)} strong /></div>
            </div>
            <p style={{ margin: '16px 0 0', color: 'var(--text-faint)', fontSize: 11.5, lineHeight: 1.5 }}>{grandTotal > 0 ? `Paiement sécurisé par ${currency === 'XOF' ? 'FedaPay' : 'Stripe'}.` : 'Aucun moyen de paiement ne sera demandé.'}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><button type="button" onClick={() => setShowConfirmation(false)} disabled={submitting} style={{ ...secondaryAction, flex: 1 }}>Modifier</button><button type="button" onClick={() => void doCheckout()} disabled={submitting} style={{ ...primaryAction, flex: 1 }}>{submitting ? 'Redirection…' : grandTotal > 0 ? `Payer ${fmtMoney(grandTotal, currency)}` : 'Confirmer'}</button></div>
          </div>
        </div>
      )}

      {showAgeModal && <AgeGateModal minAge={eventMinAge} onConfirm={confirmAge} onCancel={() => setShowAgeModal(false)} />}
    </section>
  )
}

function IncludedRow({ label, emoji }: { label: string; emoji?: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11, border: '1px solid rgba(78,232,200,.22)', background: 'rgba(78,232,200,.05)' }}><span aria-hidden="true" style={{ width: 20, textAlign: 'center' }}>{emoji || '✓'}</span><span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{label}</span><span style={{ color: 'var(--teal)', fontSize: 10, fontWeight: 800 }}>INCLUS</span></div>
}

function SummaryRow({ label, value, accent, strong }: { label: string; value: string; accent?: boolean; strong?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span style={{ color: strong ? 'var(--text)' : 'var(--text-muted)', fontSize: strong ? 14 : 12.5, fontWeight: strong ? 800 : 500 }}>{label}</span><span style={{ color: accent ? 'var(--teal)' : strong ? 'var(--gold)' : 'var(--text)', fontSize: strong ? 18 : 12.5, fontWeight: strong ? 900 : 700, textAlign: 'right' }}>{value}</span></div>
}

const detailButton: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(200,169,110,.32)', background: 'rgba(200,169,110,.08)', color: 'var(--gold)', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(0,0,0,.88)', backdropFilter: 'blur(8px)' }
const modalClose: React.CSSProperties = { position: 'absolute', zIndex: 2, top: 12, right: 12, width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,.2)', background: 'rgba(4,4,11,.78)', color: '#fff', fontSize: 21, cursor: 'pointer' }
const galleryButton: React.CSSProperties = { minWidth: 92, padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const primaryAction: React.CSSProperties = { minHeight: 46, border: 0, borderRadius: 11, background: 'var(--gold)', color: '#181104', fontWeight: 800, cursor: 'pointer' }
const secondaryAction: React.CSSProperties = { minHeight: 46, border: '1px solid var(--border-strong)', borderRadius: 11, background: 'transparent', color: 'var(--text)', fontWeight: 700, cursor: 'pointer' }

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
