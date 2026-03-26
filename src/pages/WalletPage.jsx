import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { getUserId } from '../utils/messaging'
import { getWallet, addFunds } from '../utils/wallet'

const QUICK_AMOUNTS = [5, 10, 20, 50, 100]

export default function WalletPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const userId = getUserId(user)

  const [wallet, setWallet] = useState({ balance: 0, transactions: [] })
  const [customAmount, setCustomAmount] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (userId) setWallet(getWallet(userId))
  }, [userId])

  function handleAdd(amount) {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    const w = addFunds(userId, amt, 'Rechargement')
    setWallet(w)
    setFlash(true)
    setTimeout(() => setFlash(false), 1200)
    setCustomAmount('')
    setShowCustom(false)
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('fr', { day: '2-digit', month: 'short', year: '2-digit' })
  }

  return (
    <Layout>
      <div className="px-4 py-6 space-y-6 max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-white transition-colors text-2xl leading-none">‹</button>
          <h1 className="text-white font-black text-2xl uppercase tracking-widest" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            Mon Portefeuille
          </h1>
        </div>

        {/* Balance card */}
        <div className={`glass rounded-3xl p-6 text-center space-y-1 transition-all duration-300 ${flash ? 'border-green-500/40 bg-green-500/5' : ''}`}>
          <p className="text-gray-500 text-xs uppercase tracking-widest">Solde disponible</p>
          <p className="text-6xl font-black text-[#d4af37] transition-all" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            {wallet.balance.toFixed(2)}€
          </p>
          {flash && (
            <p className="text-green-400 text-xs font-semibold animate-fade-in">✓ Fonds ajoutés !</p>
          )}
          <p className="text-gray-600 text-[10px] pt-1">Tous tes paiements sont prélevés de ce solde</p>
        </div>

        {/* Recharge */}
        <div className="space-y-3">
          <p className="text-gray-500 text-xs uppercase tracking-widest">Recharger</p>
          <div className="grid grid-cols-5 gap-2">
            {QUICK_AMOUNTS.map(a => (
              <button
                key={a}
                onClick={() => handleAdd(a)}
                className="py-3 rounded-2xl text-sm font-bold border border-[#222] text-white hover:border-[#d4af37] hover:text-[#d4af37] active:scale-95 transition-all"
              >
                {a}€
              </button>
            ))}
          </div>
          {!showCustom ? (
            <button
              onClick={() => setShowCustom(true)}
              className="w-full py-3 rounded-2xl border border-dashed border-[#333] text-gray-500 text-sm hover:border-[#555] transition-colors"
            >
              + Montant personnalisé
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                className="input-dark flex-1 text-sm"
                type="number"
                min="1"
                placeholder="Montant en €"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd(customAmount)}
                autoFocus
              />
              <button
                onClick={() => handleAdd(customAmount)}
                disabled={!customAmount || parseFloat(customAmount) <= 0}
                className="btn-gold px-5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                OK
              </button>
              <button onClick={() => setShowCustom(false)} className="text-gray-500 px-2 hover:text-white transition-colors">✕</button>
            </div>
          )}
        </div>

        {/* Security info */}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 flex gap-3">
          <span className="text-xl flex-shrink-0">🔒</span>
          <div>
            <p className="text-blue-300 text-xs font-bold">Paiements sécurisés — sans carte</p>
            <p className="text-gray-500 text-[10px] leading-relaxed mt-1">
              Réservations, réservations de groupe et enchères sont toutes débitées de ce portefeuille.
              Aucun prélèvement direct sur ta carte bancaire.
            </p>
          </div>
        </div>

        {/* History */}
        <div className="space-y-3">
          <p className="text-gray-500 text-xs uppercase tracking-widest">Historique</p>
          {wallet.transactions.length === 0 ? (
            <div className="text-center py-10 space-y-2 text-gray-600">
              <p className="text-3xl">💳</p>
              <p className="text-sm">Aucune transaction pour l'instant</p>
            </div>
          ) : (
            <div className="space-y-2">
              {wallet.transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 p-3 bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 ${tx.type === 'credit' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {tx.type === 'credit' ? '↓' : '↑'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-semibold truncate">{tx.description}</p>
                    <p className="text-gray-600 text-[10px]">{fmtDate(tx.date)}</p>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{tx.amount.toFixed(2)}€
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
