import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUserId, getConversations, sendMessage, getInitials, saveGroupAuctionBid } from '../utils/messaging'
import { IconCrown } from './icons'
// Note : enchères en mode "réservation" — le paiement réel sera ajouté en V2
// via Stripe (capture différée jusqu'à fin d'enchère). Pour la démo, l'enchère
// est enregistrée sans débit immédiat.

function loadBidsForPlace(eventId, placeType, basePriceFromEvent) {
  try {
    const saved = JSON.parse(localStorage.getItem('lib_bids') || '[]')
    const filtered = saved
      .filter((b) => b.eventId === eventId && b.placeType === placeType)
      .sort((a, b) => b.amount - a.amount)
    if (filtered.length > 0) {
      return {
        bids: filtered.map((b, i) => ({ user: b.userName || 'Utilisateur', amount: b.amount, time: b.time, crown: i === 0 })),
        currentBid: filtered[0].amount,
      }
    }
  } catch {}
  return { bids: [], currentBid: basePriceFromEvent || 0 }
}

export default function AuctionSystem({ event, initialPlace }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const userId = getUserId(user)

  const auctionPlaces = event.places.filter((p) => p.auctionEnabled)
  const [selectedAuction, setSelectedAuction] = useState(
    (initialPlace && auctionPlaces.find(p => p.type === initialPlace)) ? initialPlace : (auctionPlaces[0]?.type || null)
  )

  const getBasePrice = (placeType) => auctionPlaces.find(p => p.type === placeType)?.price || 0

  const initialData = loadBidsForPlace(event.id, selectedAuction, getBasePrice(selectedAuction))
  const [currentBid, setCurrentBid] = useState(initialData.currentBid)
  const [myBid, setMyBid] = useState('')
  const [bids, setBids] = useState(initialData.bids)
  const [timeLeft, setTimeLeft] = useState(15 * 60)
  const [bidFlash, setBidFlash] = useState(false)
  const intervalRef = useRef(null)

  // Bid confirmation modal
  const [showBidModal, setShowBidModal] = useState(false)
  const [walletError, setWalletError] = useState(false)
  // Group bid picker
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const [groupConvId, setGroupConvId] = useState(null)
  const [groupSentFlash, setGroupSentFlash] = useState(false)

  const INCREMENT = 20 // minimum increment

  // Reload bids when switching between auction places
  useEffect(() => {
    if (!selectedAuction) return
    const { bids: loaded, currentBid: loaded2 } = loadBidsForPlace(event.id, selectedAuction, getBasePrice(selectedAuction))
    setBids(loaded)
    setCurrentBid(loaded2)
  }, [selectedAuction])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 0) {
          clearInterval(intervalRef.current)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [])

  // Anti-sniping: add extra time if bid in last 10 min
  function applyAntiSnipe(currentTime) {
    const minutesLeft = currentTime / 60
    if (minutesLeft <= 10 && minutesLeft > 9) return currentTime + 60
    if (minutesLeft <= 9 && minutesLeft > 8) return currentTime + 120
    if (minutesLeft <= 8 && minutesLeft > 7) return currentTime + 180
    if (minutesLeft <= 7 && minutesLeft > 6) return currentTime + 240
    if (minutesLeft <= 6 && minutesLeft > 5) return currentTime + 300
    return currentTime
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  function handleBid() {
    const amount = parseInt(myBid)
    if (!amount || amount < currentBid + INCREMENT) return
    setWalletError(false)
    setShowBidModal(true)
  }

  function confirmBid() {
    const amount = parseInt(myBid)
    // Note : enchère enregistrée sans débit immédiat. Le paiement réel sera
    // capturé via Stripe en fin d'enchère pour le gagnant uniquement (V2).
    setShowBidModal(false)
    setWalletError(false)
    setBidFlash(true)
    setTimeout(() => setBidFlash(false), 500)

    const newBid = {
      user: user?.name?.split(' ')[0] || 'Toi',
      amount,
      time: new Date().toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' }),
      crown: true,
    }
    setBids([newBid, ...bids.map((b) => ({ ...b, crown: false }))])
    setCurrentBid(amount)
    setMyBid('')
    try {
      const saved = JSON.parse(localStorage.getItem('lib_bids') || '[]')
      saved.unshift({ eventId: event.id, eventName: event.name, placeType: selectedAuction, amount, userName: user?.name?.split(' ')[0] || 'Toi', time: newBid.time, date: new Date().toLocaleDateString('fr-FR') })
      localStorage.setItem('lib_bids', JSON.stringify(saved))
    } catch {}
    setTimeLeft((t) => applyAntiSnipe(t))
  }

  function sendGroupBid() {
    if (!groupConvId) return
    const amount = parseInt(myBid)
    const bidId = 'gab_' + Date.now()
    const groupConvs = getConversations(userId)
    const conv = groupConvs.find(c => c.id === groupConvId)
    saveGroupAuctionBid({
      id: bidId,
      eventId: event.id,
      eventName: event.name,
      placeName: selectedAuction,
      bidAmount: amount,
      priceAtProposal: currentBid,
      proposerId: userId,
      proposerName: user?.name || 'Toi',
      convId: groupConvId,
      convMemberCount: conv?.members?.length || 2,
      status: 'pending',
      approvals: { [userId]: true },
      createdAt: Date.now(),
    })
    sendMessage(groupConvId, userId, user?.name || 'Toi', 'group_auction_bid', bidId)
    setShowBidModal(false)
    setShowGroupPicker(false)
    setMyBid('')
    setGroupConvId(null)
    setGroupSentFlash(true)
    setTimeout(() => { setGroupSentFlash(false); navigate('/messagerie') }, 1200)
  }

  const isEnded = timeLeft <= 0
  const minutesLeft = timeLeft / 60

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-white font-semibold">Système d'enchères</h3>
        <p className="text-gray-500 text-xs mt-1">
          Incrément minimum : {INCREMENT}€ · Anti-sniping actif
        </p>
      </div>

      {/* Select auction place */}
      {auctionPlaces.length > 1 && (
        <div className="flex gap-2">
          {auctionPlaces.map((p) => (
            <button
              key={p.type}
              onClick={() => setSelectedAuction(p.type)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                selectedAuction === p.type
                  ? 'border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]'
                  : 'border-[#222] text-gray-500'
              }`}
            >
              {p.icon} {p.type}
            </button>
          ))}
        </div>
      )}

      {/* Timer */}
      <div
        className={`rounded-2xl p-4 text-center border transition-all ${
          isEnded
            ? 'border-red-500/30 bg-red-500/5'
            : minutesLeft <= 10
            ? 'border-orange-500/30 bg-orange-500/5'
            : 'border-[#222] bg-[#111]'
        }`}
      >
        <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">
          {isEnded ? 'Enchère terminée' : 'Temps restant'}
        </p>
        <p
          className={`text-4xl font-black tracking-wider ${
            isEnded ? 'text-red-400' : minutesLeft <= 10 ? 'text-orange-400' : 'text-white'
          }`}
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          {formatTime(timeLeft)}
        </p>
        {minutesLeft <= 10 && !isEnded && (
          <p className="text-orange-400 text-xs mt-1">⚠ Anti-sniping actif — le temps peut augmenter</p>
        )}
      </div>

      {/* Current best bid */}
      <div
        className={`glass p-4 rounded-2xl text-center transition-all ${
          bidFlash ? 'bg-[#d4af37]/10 border-[#d4af37]/30' : ''
        }`}
      >
        <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Meilleure offre</p>
        <p className="text-3xl font-black text-[#d4af37]" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          {currentBid}€
        </p>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="animate-crown" style={{ display: 'inline-flex' }}>
            <IconCrown size={14} color="#d4af37" />
          </span>
          <span className="text-gray-400 text-xs">{bids[0]?.user}</span>
        </div>
      </div>

      {/* Bid input */}
      {!isEnded && (
        <div className="space-y-3">
          <p className="text-gray-500 text-xs">
            Enchère minimum : <span className="text-white font-semibold">{currentBid + INCREMENT}€</span>
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              className="input-dark flex-1"
              placeholder={`Min. ${currentBid + INCREMENT}€`}
              value={myBid}
              onChange={(e) => setMyBid(e.target.value)}
              min={currentBid + INCREMENT}
            />
            <button
              onClick={handleBid}
              disabled={!myBid || parseInt(myBid) < currentBid + INCREMENT}
              className="btn-gold px-5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Enchérir
            </button>
          </div>
        </div>
      )}

      {/* Group sent flash */}
      {groupSentFlash && (
        <div className="glass p-3 rounded-2xl border border-blue-500/30 text-center text-blue-300 text-sm font-semibold animate-fade-in">
          ✓ Proposition envoyée au groupe — redirection…
        </div>
      )}

      {/* Bid confirmation modal */}
      {showBidModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setShowBidModal(false); setShowGroupPicker(false) }} />
          <div className="relative w-full max-w-md bg-[#0d0d0d] border border-[#1a1a1a] rounded-t-3xl p-5 space-y-4 pb-8">
            <div className="w-10 h-1 bg-[#333] rounded-full mx-auto" />

            {!showGroupPicker ? (
              <>
                <div className="text-center space-y-1">
                  <span className="text-3xl">🔨</span>
                  <h3 className="text-white font-bold">Confirmer l'enchère</h3>
                  <p className="text-[#d4af37] text-2xl font-black" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{myBid}€</p>
                  <p className="text-gray-500 text-xs">{event.name} · {selectedAuction}</p>
                </div>


                <div className="space-y-2">
                  <button
                    onClick={confirmBid}
                    className="w-full py-3.5 rounded-2xl bg-[#d4af37] text-black font-bold text-sm active:scale-95 transition-all"
                  >
                    💰 Enchérir en solo — {myBid}€
                  </button>
                  <button
                    onClick={() => { setShowGroupPicker(true); setGroupConvId(null) }}
                    className="w-full py-3.5 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-300 font-bold text-sm active:scale-95 transition-all"
                  >
                    👥 Proposer au groupe →
                  </button>
                  <button onClick={() => { setShowBidModal(false); setWalletError(false) }} className="w-full py-2 text-gray-600 text-xs hover:text-gray-400">
                    Annuler
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-white font-bold">Proposer au groupe</h3>
                  <p className="text-gray-500 text-xs mt-0.5">Enchère de <span className="text-[#d4af37] font-bold">{myBid}€</span> — valide tant que le prix n'a pas dépassé ce montant</p>
                </div>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {getConversations(userId).filter(c => c.type === 'group').length === 0 ? (
                    <p className="text-gray-600 text-xs text-center py-4">Aucun groupe trouvé dans Messages.</p>
                  ) : getConversations(userId).filter(c => c.type === 'group').map(c => (
                    <button
                      key={c.id}
                      onClick={() => setGroupConvId(c.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${groupConvId === c.id ? 'border-blue-500 bg-blue-500/10' : 'border-[#222] hover:border-[#333]'}`}
                    >
                      <div className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-xs font-bold text-[#d4af37] flex-shrink-0">
                        {getInitials(c.name || '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{c.name}</p>
                        <p className="text-gray-600 text-[10px]">{c.members?.length || 0} membres</p>
                      </div>
                      {groupConvId === c.id && <span className="text-blue-400">✓</span>}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowGroupPicker(false)} className="btn-outline flex-1 text-sm">‹ Retour</button>
                  <button
                    onClick={sendGroupBid}
                    disabled={!groupConvId}
                    className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${groupConvId ? 'bg-blue-600 text-white active:scale-95' : 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'}`}
                  >
                    Envoyer →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bid history */}
      <div>
        <h4 className="text-gray-500 text-xs uppercase tracking-widest mb-3">Historique des enchères</h4>
        <div className="space-y-2">
          {bids.map((bid, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-xl border ${
                i === 0 ? 'border-[#d4af37]/30 bg-[#d4af37]/5' : 'border-[#1a1a1a]'
              }`}
            >
              <div className="flex items-center gap-2">
                {i === 0 && (
                  <span className="animate-crown" style={{ display: 'inline-flex' }}>
                    <IconCrown size={12} color="#d4af37" />
                  </span>
                )}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-black"
                  style={{ background: i === 0 ? '#d4af37' : '#333', color: i === 0 ? '#000' : '#888' }}
                >
                  {bid.user[0]}
                </div>
                <span className={`text-sm ${i === 0 ? 'text-white font-semibold' : 'text-gray-400'}`}>
                  {bid.user}
                </span>
              </div>
              <div className="text-right">
                <p className={`font-bold ${i === 0 ? 'text-[#d4af37]' : 'text-gray-500'}`}>
                  {bid.amount}€
                </p>
                <p className="text-gray-700 text-xs">{bid.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isEnded && (
        <div className="glass p-4 rounded-2xl border border-[#d4af37]/30 text-center">
          <p className="text-[#d4af37] font-bold">🏆 Enchère terminée</p>
          <p className="text-white text-sm mt-1">
            Gagnant : <strong>{bids[0]?.user}</strong> — {bids[0]?.amount}€
          </p>
          <p className="text-gray-500 text-xs mt-1">Paiement Stripe déclenché à la clôture</p>
        </div>
      )}
    </div>
  )
}
