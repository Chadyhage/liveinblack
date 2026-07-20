'use client'

import { useEffect, useMemo, useState } from 'react'
import { BOOST_PLANS, getBoostPlan } from '@/lib/shared/boosts'
import { fmtMoney } from '@/lib/shared/money'

interface BoostModalProps {
  event: { id: string; name: string; region: string }
  onClose: () => void
}

type SlotStatus = 'available' | 'held' | 'active'

interface BoostAvailabilitySlot {
  position: number
  status: SlotStatus
}

interface BoostAvailabilityResponse {
  ok: true
  slots: BoostAvailabilitySlot[]
}

interface CheckoutSuccessResponse {
  url: string
}

interface ApiErrorResponse {
  error?: string
}

interface SelectedPlan {
  position: number
  tierIdx: number
}

type Step = 'pick' | 'pay' | 'error'

const CHECKOUT_ERROR_MESSAGES: Record<string, string> = {
  slot_taken: "Ce créneau vient d'être pris. Choisis une autre position.",
  event_cancelled: 'Cet événement a été annulé.',
  boost_outlasts_event: 'Cette durée dépasse la date de fin de cet événement.',
  invalid_offer: 'Offre de boost invalide.',
  forbidden: "Tu n'as pas accès à ce boost.",
  event_not_found: 'Événement introuvable.',
}

// Les boosts sont réglés uniquement en euros (rail Stripe) quelle que soit la
// devise de l'événement — voir CHECKOUT_ERROR_MESSAGES et le commentaire sur
// BOOST_PLANS. On réutilise `fmtMoney` partagé plutôt qu'un formateur local.
function formatPrice(price: number): string {
  return fmtMoney(price, 'EUR')
}

function RankIcon({ position, size = 20 }: { position: number; size?: number }) {
  const color = position === 1 ? '#c8a96e' : position === 2 ? 'rgba(255,255,255,0.72)' : 'rgba(200,169,110,0.65)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill={color} />
      <text x="12" y="15" textAnchor="middle" fontSize={8} fill="#090a10" fontFamily="Inter, sans-serif" fontWeight="bold">
        {position}
      </text>
    </svg>
  )
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth={3} />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

export default function BoostModal({ event, onClose }: BoostModalProps) {
  const [activePosition, setActivePosition] = useState(1)
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null)
  const [step, setStep] = useState<Step>('pick')
  const [paying, setPaying] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [slots, setSlots] = useState<BoostAvailabilitySlot[]>([])
  const [checkingSlots, setCheckingSlots] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/organizer-events/${event.id}/boost-availability`)
      .then((res) => res.json().catch(() => null))
      .then((data: (BoostAvailabilityResponse & ApiErrorResponse) | null) => {
        if (!cancelled && data?.ok) setSlots(data.slots)
      })
      .finally(() => {
        if (!cancelled) setCheckingSlots(false)
      })
    return () => {
      cancelled = true
    }
  }, [event.id])

  const activePlan = useMemo(() => BOOST_PLANS.find((plan) => plan.position === activePosition) ?? BOOST_PLANS[0], [activePosition])
  const chosen = selectedPlan ? BOOST_PLANS.find((plan) => plan.position === selectedPlan.position) ?? null : null
  const chosenTier = chosen && selectedPlan ? chosen.tiers[selectedPlan.tierIdx] ?? null : null

  function slotStatus(position: number): SlotStatus {
    const slot = slots.find((s) => Number(s.position) === position)
    return slot?.status ?? 'available'
  }
  function positionBlocked(position: number): boolean {
    return slotStatus(position) === 'active' || slotStatus(position) === 'held'
  }
  function positionLabel(position: number): string {
    const status = slotStatus(position)
    if (status === 'held') return 'Réservé temporairement'
    if (status === 'active') return 'Occupé'
    return checkingSlots ? 'Vérification…' : 'Disponible'
  }
  function positionColor(position: number): string {
    const status = slotStatus(position)
    if (status === 'held') return 'var(--gold)'
    if (status === 'active') return 'var(--pink)'
    return 'var(--teal)'
  }

  async function confirmBoost() {
    if (!chosen || !chosenTier) return
    if (positionBlocked(chosen.position)) {
      setErrorMsg('Ce créneau est déjà pris ou temporairement réservé. Choisis une autre position.')
      setStep('error')
      return
    }
    const offer = getBoostPlan(chosen.position, chosenTier.days)
    if (!offer) {
      setErrorMsg('Offre de boost invalide.')
      setStep('error')
      return
    }
    setPaying(true)
    const random = new Uint32Array(2)
    crypto.getRandomValues(random)
    const boostId = `${random[0].toString(36)}${random[1].toString(36)}`.slice(0, 16).toUpperCase()
    try {
      const res = await fetch('/api/checkout/boost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          position: chosen.position,
          days: chosenTier.days,
          boostId,
          region: event.region,
        }),
      })
      const data = (await res.json().catch(() => null)) as (CheckoutSuccessResponse & ApiErrorResponse) | null
      if (!res.ok || !data?.url) {
        setPaying(false)
        setErrorMsg(CHECKOUT_ERROR_MESSAGES[data?.error ?? ''] ?? 'Impossible de réserver ce créneau de boost.')
        setStep('error')
        return
      }
      window.location.assign(data.url)
    } catch {
      setPaying(false)
      setErrorMsg('Impossible de réserver ce créneau de boost.')
      setStep('error')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 660,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#12131c',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}
        >
          ×
        </button>

        <div style={{ marginBottom: 20, paddingRight: 24 }}>
          <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 25, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Booster mon événement</h2>
          <p
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
              margin: '7px 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {event.name}
          </p>
        </div>

        {step === 'error' ? (
          <div style={{ textAlign: 'center', padding: '28px 0' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#ee9bb7', lineHeight: 1.7, marginBottom: 20 }}>{errorMsg}</p>
            <button
              onClick={() => setStep('pick')}
              style={{
                padding: '14px 22px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.9)',
                fontFamily: 'Inter, sans-serif',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retour aux options
            </button>
          </div>
        ) : step === 'pay' && chosen && chosenTier ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ padding: 18, border: '1px solid rgba(200,169,110,0.3)', borderRadius: 14, background: 'rgba(255,255,255,0.04)' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 10px' }}>
                Récapitulatif avant paiement
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                <span>Position</span>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#fff', fontWeight: 600 }}>
                  <RankIcon position={chosen.position} size={17} />
                  {chosen.label}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                <span>Durée</span>
                <strong style={{ color: '#fff', fontWeight: 600 }}>{chosenTier.label}</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 0 8px',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.55)',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  marginTop: 5,
                }}
              >
                <span>Total</span>
                <strong style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 25, color: 'var(--gold)' }}>{formatPrice(chosenTier.price)}</strong>
              </div>
            </div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>
              Paiement sécurisé via Stripe. Le créneau est confirmé uniquement après validation du paiement.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 9 }}>
              <button
                onClick={() => setStep('pick')}
                style={{
                  minHeight: 50,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.9)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retour
              </button>
              <button
                onClick={confirmBoost}
                disabled={paying}
                style={{
                  minHeight: 52,
                  width: '100%',
                  borderRadius: 12,
                  border: 'none',
                  background: paying ? 'rgba(255,255,255,0.07)' : 'var(--gold)',
                  color: paying ? 'rgba(255,255,255,0.35)' : '#181206',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: paying ? 'not-allowed' : 'pointer',
                  boxShadow: paying ? 'none' : '0 6px 20px rgba(200,169,110,0.25)',
                }}
              >
                {paying ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Spinner size={14} />
                    Redirection vers Stripe…
                  </span>
                ) : (
                  `Payer ${formatPrice(chosenTier.price)}`
                )}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '0 0 10px' }}>
                1. Choisis ta position
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9 }}>
                {BOOST_PLANS.map((plan) => {
                  const blocked = positionBlocked(plan.position)
                  const active = activePosition === plan.position
                  return (
                    <button
                      key={plan.position}
                      onClick={() => {
                        setActivePosition(plan.position)
                        setSelectedPlan(null)
                      }}
                      style={{
                        minHeight: 76,
                        padding: '12px 11px',
                        borderRadius: 12,
                        textAlign: 'left',
                        color: '#fff',
                        cursor: 'pointer',
                        border: active ? '1px solid rgba(200,169,110,0.65)' : '1px solid rgba(255,255,255,0.08)',
                        background: active ? 'rgba(200,169,110,0.14)' : 'rgba(255,255,255,0.04)',
                        opacity: blocked ? 0.78 : 1,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13 }}>
                        <RankIcon position={plan.position} />
                        {plan.label}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 700,
                          fontSize: 11,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          marginTop: 9,
                          color: positionColor(plan.position),
                        }}
                      >
                        {positionLabel(plan.position)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 10 }}>
                <div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '0 0 5px' }}>
                    2. Choisis la durée
                  </p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>{activePlan.description}</p>
                </div>
                {positionBlocked(activePosition) && (
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 700,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: positionColor(activePosition),
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {positionLabel(activePosition)}
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9 }}>
                {activePlan.tiers.map((tier, index) => {
                  const selected = selectedPlan?.position === activePosition && selectedPlan?.tierIdx === index
                  const disabled = positionBlocked(activePosition)
                  return (
                    <button
                      key={tier.days}
                      disabled={disabled}
                      title={disabled ? 'Emplacement indisponible pour le moment' : ''}
                      onClick={() => setSelectedPlan({ position: activePosition, tierIdx: index })}
                      style={{
                        minHeight: 96,
                        padding: '14px 12px',
                        borderRadius: 12,
                        textAlign: 'left',
                        border: selected ? '1px solid rgba(78,232,200,0.7)' : '1px solid rgba(255,255,255,0.08)',
                        background: selected ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.04)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.38 : 1,
                      }}
                    >
                      <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: selected ? 'var(--teal)' : 'rgba(255,255,255,0.48)' }}>
                        {tier.label}
                      </span>
                      <strong style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 22, marginTop: 10, whiteSpace: 'nowrap', color: selected ? '#fff' : activePlan.color }}>
                        {formatPrice(tier.price)}
                      </strong>
                    </button>
                  )
                })}
              </div>
              {positionBlocked(activePosition) && (
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.5)', margin: '10px 0 0' }}>
                  Cette place est déjà prise ou en cours de paiement dans cette région. Choisis une autre position.
                </p>
              )}
            </div>

            <button
              disabled={!selectedPlan || positionBlocked(selectedPlan.position)}
              onClick={() => selectedPlan && setStep('pay')}
              style={{
                minHeight: 52,
                width: '100%',
                borderRadius: 12,
                border: 'none',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                fontSize: 14,
                background: !selectedPlan || positionBlocked(selectedPlan.position) ? 'rgba(255,255,255,0.07)' : 'var(--gold)',
                color: !selectedPlan || positionBlocked(selectedPlan.position) ? 'rgba(255,255,255,0.35)' : '#181206',
                cursor: !selectedPlan || positionBlocked(selectedPlan.position) ? 'not-allowed' : 'pointer',
                boxShadow: !selectedPlan || positionBlocked(selectedPlan.position) ? 'none' : '0 6px 20px rgba(200,169,110,0.25)',
              }}
            >
              {selectedPlan && chosenTier ? `Continuer · ${formatPrice(chosenTier.price)}` : 'Sélectionne une durée'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
