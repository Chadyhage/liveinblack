import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { saveBoost } from '../utils/ticket'
import { getUserId } from '../utils/messaging'
import { getBalance, deductFunds } from '../utils/wallet'

const BOOST_PLANS = [
  {
    position: 1,
    label: 'Top 1',
    emoji: '🥇',
    desc: 'Position n°1 · Visibilité maximale',
    color: '#FFD700',
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
    emoji: '🥈',
    desc: 'Position n°2 · Très haute visibilité',
    color: '#b0c4d8',
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
    emoji: '🥉',
    desc: 'Position n°3 · Haute visibilité',
    color: '#cd7f32',
    tiers: [
      { label: '1 jour', price: 3.99, days: 1 },
      { label: '3 jours', price: 9.99, days: 3 },
      { label: '1 semaine', price: 19.99, days: 7 },
      { label: '1 mois', price: 59.99, days: 30 },
    ],
  },
]

export default function BoostModal({ event, onClose, onBoostDone }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selectedPlan, setSelectedPlan] = useState(null) // { position, tierIdx }
  const [step, setStep] = useState('pick') // 'pick' | 'pay' | 'done'
  const [paying, setPaying] = useState(false)
  const [walletError, setWalletError] = useState(false)

  if (!event) return null

  const chosen = selectedPlan
    ? BOOST_PLANS.find(p => p.position === selectedPlan.position)
    : null
  const chosenTier = chosen ? chosen.tiers[selectedPlan.tierIdx] : null
  const uid = getUserId(user)
  const walletBalance = getBalance(uid)
  const canAfford = chosenTier ? walletBalance >= chosenTier.price : true

  function confirmBoost() {
    if (!chosen || !chosenTier) return
    const deducted = deductFunds(uid, chosenTier.price, `Boost ${chosen.label} — ${event.name}`)
    if (!deducted) { setWalletError(true); return }
    setPaying(true)
    setTimeout(() => {
      saveBoost(event.id, chosen.position, chosenTier.days, chosenTier.price)
      setPaying(false)
      setStep('done')
    }, 600)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0d0d0d] rounded-t-3xl border-t border-[#1f1f1f] max-h-[90vh] overflow-y-auto">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#333]" />
        </div>

        <div className="px-5 pb-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-5 pt-2">
            <div>
              <h2 className="text-white font-bold text-lg">Booster mon événement</h2>
              <p className="text-gray-500 text-xs mt-0.5 truncate max-w-[200px]">{event.name}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400 text-xl">×</button>
          </div>

          {step === 'done' ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/40 flex items-center justify-center text-4xl mx-auto">🚀</div>
              <p className="text-white text-xl font-bold">Événement boosté !</p>
              <p className="text-gray-400 text-sm">
                <strong className="text-[#d4af37]">{event.name}</strong> apparaît désormais en{' '}
                <strong className="text-white">{chosen?.label}</strong> pendant{' '}
                <strong className="text-white">{chosenTier?.label}</strong>.
              </p>
              <p className="text-gray-600 text-xs">Ton événement sera visible dans le Top 3 de ta région.</p>
              <button onClick={() => { onBoostDone?.(); onClose() }} className="btn-gold w-full mt-2">
                Parfait !
              </button>
            </div>
          ) : step === 'pay' ? (
            <div className="space-y-5">
              <div className="glass p-4 rounded-2xl border border-[#d4af37]/20">
                <p className="text-[#d4af37] text-xs uppercase tracking-widest mb-3">Récapitulatif</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Position</span>
                    <span className="text-white font-semibold">{chosen?.emoji} {chosen?.label}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Durée</span>
                    <span className="text-white font-semibold">{chosenTier?.label}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-[#222] pt-2 mt-1">
                    <span className="text-white font-bold">Total</span>
                    <span className="text-[#d4af37] font-bold text-lg">{chosenTier?.price}€</span>
                  </div>
                </div>
              </div>

              <div className={`glass p-4 rounded-2xl space-y-3 ${!canAfford ? 'border border-red-500/30' : ''}`}>
                <p className="text-gray-500 text-xs uppercase tracking-widest">Paiement via portefeuille</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💰</span>
                    <p className="text-gray-400 text-sm">Solde disponible</p>
                  </div>
                  <p className={`font-bold ${canAfford ? 'text-green-400' : 'text-red-400'}`}>{walletBalance.toFixed(2)}€</p>
                </div>
                {!canAfford && (
                  <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1">
                    <p>Solde insuffisant — il te manque {(chosenTier.price - walletBalance).toFixed(2)}€</p>
                    <button onClick={() => { onClose(); navigate('/portefeuille') }} className="underline">Recharger →</button>
                  </div>
                )}
                {walletError && canAfford && (
                  <p className="text-red-400 text-xs">Erreur lors du paiement. Réessaie.</p>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep('pick')} className="btn-outline flex-1 text-sm">← Retour</button>
                <button
                  onClick={confirmBoost}
                  disabled={paying || !canAfford}
                  className="btn-gold flex-1 text-sm disabled:opacity-50"
                >
                  {paying ? '⏳ Traitement...' : `Payer ${chosenTier?.price}€`}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-gray-400 text-sm">Choisis la position et la durée de ton boost dans le Top 3 régional.</p>

              {BOOST_PLANS.map(plan => (
                <div key={plan.position}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{plan.emoji}</span>
                    <div>
                      <p className="text-white text-sm font-bold">{plan.label}</p>
                      <p className="text-gray-500 text-xs">{plan.desc}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {plan.tiers.map((tier, idx) => {
                      const isSelected = selectedPlan?.position === plan.position && selectedPlan?.tierIdx === idx
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedPlan({ position: plan.position, tierIdx: idx })}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'border-[#d4af37] bg-[#d4af37]/10'
                              : 'border-[#222] hover:border-[#333]'
                          }`}
                        >
                          <p className="text-white text-sm font-semibold">{tier.label}</p>
                          <p style={{ color: isSelected ? '#d4af37' : plan.color }} className="font-bold text-lg">
                            {tier.price}€
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <button
                onClick={() => selectedPlan && setStep('pay')}
                disabled={!selectedPlan}
                className="btn-gold w-full disabled:opacity-40"
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
