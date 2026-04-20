import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { saveBoost, isBoostSlotTaken, getActiveBoostsByRegion } from '../utils/ticket'
import { getUserId } from '../utils/messaging'
// wallet: paiement fictif — Stripe à venir

const BOOST_PLANS = [
  {
    position: 1,
    label: 'Top 1',
    desc: 'Position n°1 · Visibilité maximale',
    color: '#c8a96e',
    tiers: [
      { label: '1 jour', price: 9.99, days: 1 },
      { label: '3 jours', price: 24.99, days: 3 },
      { label: '1 semaine', price: 49.99, days: 7 },
      { label: '1 mois', price: 149.99, days: 30 },
    ],
  },
  {
    position: 2,
    label: 'Top 2',
    desc: 'Position n°2 · Très haute visibilité',
    color: 'rgba(255,255,255,0.65)',
    tiers: [
      { label: '1 jour', price: 6.99, days: 1 },
      { label: '3 jours', price: 16.99, days: 3 },
      { label: '1 semaine', price: 34.99, days: 7 },
      { label: '1 mois', price: 99.99, days: 30 },
    ],
  },
  {
    position: 3,
    label: 'Top 3',
    desc: 'Position n°3 · Haute visibilité',
    color: 'rgba(200,169,110,0.6)',
    tiers: [
      { label: '1 jour', price: 3.99, days: 1 },
      { label: '3 jours', price: 9.99, days: 3 },
      { label: '1 semaine', price: 19.99, days: 7 },
      { label: '1 mois', price: 59.99, days: 30 },
    ],
  },
]

// SVG rank badge icons
function RankIcon({ position, size = 20 }) {
  const colors = {
    1: '#c8a96e',
    2: 'rgba(255,255,255,0.65)',
    3: 'rgba(200,169,110,0.6)',
  }
  const color = colors[position] || '#c8a96e'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill={color} stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="12" y="15" textAnchor="middle" fontSize="8" fill={position === 2 ? '#111' : '#111'} fontFamily="monospace" fontWeight="bold">{position}</text>
    </svg>
  )
}

// SVG rocket icon
function RocketIcon({ size = 40, color = '#4ee8c8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
    </svg>
  )
}

// SVG wallet icon
function WalletIcon({ size = 18, color = '#c8a96e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/>
      <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/>
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>
    </svg>
  )
}

const S = {
  card: {
    background: 'rgba(8,10,20,0.55)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    padding: '16px',
  },
  btnGold: {
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
    border: '1px solid rgba(200,169,110,0.45)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#c8a96e',
    cursor: 'pointer',
    width: '100%',
  },
  btnGhost: {
    padding: '12px 20px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
  },
  label: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.42)',
  },
}

export default function BoostModal({ event, onClose, onBoostDone }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selectedPlan, setSelectedPlan] = useState(null) // { position, tierIdx }
  const [step, setStep] = useState('pick') // 'pick' | 'pay' | 'done'
  const [paying, setPaying] = useState(false)

  if (!event) return null

  const chosen = selectedPlan
    ? BOOST_PLANS.find(p => p.position === selectedPlan.position)
    : null
  const chosenTier = chosen ? chosen.tiers[selectedPlan.tierIdx] : null

  function confirmBoost() {
    if (!chosen || !chosenTier) return
    // paiement fictif — Stripe à venir
    setPaying(true)
    setTimeout(() => {
      saveBoost(event.id, chosen.position, chosenTier.days, chosenTier.price, event.region || '')
      setPaying(false)
      setStep('done')
    }, 600)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 512,
        background: 'rgba(4,5,12,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.10)',
        borderLeft: '1px solid rgba(255,255,255,0.07)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '16px 16px 0 0',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div style={{ padding: '4px 20px 36px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 24, color: 'white', margin: 0 }}>
                Booster mon événement
              </h2>
              <p style={{ ...S.label, marginTop: 4, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {event.name}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'DM Mono', monospace",
                fontSize: 16,
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>

          {step === 'done' ? (
            <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'rgba(78,232,200,0.08)',
                border: '1px solid rgba(78,232,200,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <RocketIcon size={36} color="#4ee8c8" />
              </div>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 26, color: 'white', margin: 0 }}>
                Événement boosté !
              </p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, letterSpacing: '0.05em' }}>
                <span style={{ color: '#c8a96e' }}>{event.name}</span> apparaît désormais en{' '}
                <span style={{ color: 'white' }}>{chosen?.label}</span> pendant{' '}
                <span style={{ color: 'white' }}>{chosenTier?.label}</span>.
              </p>
              <p style={{ ...S.label, marginTop: -8 }}>
                Ton événement sera visible dans le Top 3 de ta région.
              </p>
              <button onClick={() => { onBoostDone?.(); onClose() }} style={{ ...S.btnGold, marginTop: 8 }}>
                Parfait
              </button>
            </div>

          ) : step === 'pay' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Summary */}
              <div style={{ ...S.card, borderColor: 'rgba(200,169,110,0.20)' }}>
                <p style={{ ...S.label, marginBottom: 14, color: '#c8a96e' }}>Récapitulatif</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>Position</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <RankIcon position={chosen?.position} size={16} />
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'white' }}>{chosen?.label}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>Durée</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'white' }}>{chosenTier?.label}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    paddingTop: 10,
                    marginTop: 4,
                  }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'white', letterSpacing: '0.1em' }}>Total</span>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 24, color: '#c8a96e' }}>
                      {chosenTier?.price}€
                    </span>
                  </div>
                </div>
              </div>

              {/* Paiement fictif */}
              <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🧪</span>
                <div>
                  <p style={{ ...S.label, color: '#4ee8c8', margin: 0 }}>Mode test — paiement fictif</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>
                    Stripe sera intégré prochainement. Aucun débit réel.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setStep('pick')} style={{ ...S.btnGhost, flex: 1 }}>
                  ← Retour
                </button>
                <button
                  onClick={confirmBoost}
                  disabled={paying}
                  style={{
                    ...S.btnGold,
                    flex: 1,
                    width: 'auto',
                    opacity: paying ? 0.4 : 1,
                    cursor: paying ? 'not-allowed' : 'pointer',
                  }}
                >
                  {paying ? 'Traitement…' : `Confirmer — ${chosenTier?.price}€`}
                </button>
              </div>
            </div>

          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', letterSpacing: '0.05em', margin: 0 }}>
                Choisis la position et la durée de ton boost dans le Top 3 régional.
              </p>

              {BOOST_PLANS.map(plan => {
                const slotTaken = isBoostSlotTaken(plan.position, event.region || '', event.id)
                return (
                <div key={plan.position}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: slotTaken ? 6 : 10 }}>
                    <RankIcon position={plan.position} size={20} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'white', margin: 0, letterSpacing: '0.1em' }}>
                        {plan.label}
                      </p>
                      <p style={{ ...S.label, marginTop: 2 }}>{plan.desc}</p>
                    </div>
                    {slotTaken && (
                      <span style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 8,
                        letterSpacing: '0.15em',
                        color: 'rgba(220,100,100,0.8)',
                        background: 'rgba(220,50,50,0.08)',
                        border: '1px solid rgba(220,50,50,0.22)',
                        padding: '2px 7px',
                        borderRadius: 3,
                        flexShrink: 0,
                      }}>OCCUPÉ</span>
                    )}
                  </div>
                  {slotTaken && (
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', marginBottom: 8, lineHeight: 1.6 }}>
                      Ce slot est actuellement occupé. Ton boost le remplacera immédiatement à l'achat.
                    </p>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {plan.tiers.map((tier, idx) => {
                      const isSelected = selectedPlan?.position === plan.position && selectedPlan?.tierIdx === idx
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedPlan({ position: plan.position, tierIdx: idx })}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 4,
                            border: isSelected ? '1px solid rgba(200,169,110,0.45)' : '1px solid rgba(255,255,255,0.08)',
                            background: isSelected
                              ? 'linear-gradient(135deg, rgba(200,169,110,0.15), rgba(200,169,110,0.04))'
                              : 'rgba(255,255,255,0.03)',
                            textAlign: 'left',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: isSelected ? 'white' : 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            {tier.label}
                          </p>
                          <p style={{
                            fontFamily: "'Cormorant Garamond', serif",
                            fontWeight: 300,
                            fontSize: 22,
                            color: isSelected ? '#c8a96e' : plan.color,
                            margin: '4px 0 0',
                          }}>
                            {tier.price}€
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )})}


              <button
                onClick={() => selectedPlan && setStep('pay')}
                disabled={!selectedPlan}
                style={{
                  ...S.btnGold,
                  opacity: !selectedPlan ? 0.4 : 1,
                  cursor: !selectedPlan ? 'not-allowed' : 'pointer',
                }}
              >
                {selectedPlan
                  ? `Booster en ${BOOST_PLANS.find(p => p.position === selectedPlan.position)?.label} — ${BOOST_PLANS.find(p => p.position === selectedPlan.position)?.tiers[selectedPlan.tierIdx]?.price}€`
                  : 'Sélectionne une option'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
