import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import Layout from '../components/Layout'
import { events } from '../data/events'
import AuctionSystem from '../components/AuctionSystem'
import PlaylistSystem from '../components/PlaylistSystem'
import { useAuth } from '../context/AuthContext'
import { generateTicketToken } from '../utils/ticket'
import { getConversations, sendMessage, getUserId, formatTime, getInitials, saveGroupBooking, getGroupBookings, getCurrentAuctionPrice } from '../utils/messaging'
import { deductFunds, getBalance } from '../utils/wallet'

function getAllEvents() {
  try {
    const created = JSON.parse(localStorage.getItem('lib_created_events') || '[]')
    return [...events, ...created]
  } catch { return events }
}

const PREORDER_ITEMS = [
  { name: 'Bouteille Champagne', price: 90, emoji: '🍾' },
  { name: 'Pack Cocktails x5', price: 55, emoji: '🍹' },
  { name: 'Chicha Premium', price: 40, emoji: '💨' },
  { name: 'Pack Bières x6', price: 25, emoji: '🍺' },
  { name: 'Shot Pack x10', price: 35, emoji: '🥃' },
  { name: 'Pack Soft x4', price: 15, emoji: '🥤' },
]

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, setUser } = useAuth()
  const event = getAllEvents().find((e) => e.id === parseInt(id))

  const hasAuction = event.places.some((p) => p.auctionEnabled)
  const hasPlaylist = !!event.playlist
  const TABS = ['Réservation', ...(hasAuction ? ['Enchères'] : []), ...(hasPlaylist ? ['Playlist'] : []), 'Info']

  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab')
    return t && TABS.includes(t) ? t : 'Réservation'
  })
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [ticketQty, setTicketQty] = useState(1)
  const [bookingStep, setBookingStep] = useState('place') // 'place' | 'preorder' | 'confirmed'
  const [activePreorderTicket, setActivePreorderTicket] = useState(0)
  const [perTicketOrders, setPerTicketOrders] = useState([]) // [{ items: {itemName:qty}, shows: {} }]
  const [showInfoModal, setShowInfoModal] = useState(null) // { itemName, opt } — popup for requiresInfo
  const [showInfoInput, setShowInfoInput] = useState('')
  const [descModal, setDescModal] = useState(null) // item description to display
  const [bookedTickets, setBookedTickets] = useState([]) // tickets for the LAST confirmed booking
  const [allBookedThisSession, setAllBookedThisSession] = useState([]) // { place, tickets, preorderSummary, totalPrice }
  const [showShareModal, setShowShareModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showGroupSendModal, setShowGroupSendModal] = useState(false)
  const [groupSendConvId, setGroupSendConvId] = useState(null)
  const [insufficientFunds, setInsufficientFunds] = useState(false)
  const [showPointsToast, setShowPointsToast] = useState(false)

  if (!event) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
          <p className="text-4xl mb-3">🔎</p>
          <p>Événement introuvable</p>
          <button onClick={() => navigate('/evenements')} className="mt-4 btn-outline text-sm py-2">
            Retour
          </button>
        </div>
      </Layout>
    )
  }

  const selectedPlaceObj = event.places.find((p) => p.type === selectedPlace)
  const isAuctionPlace = selectedPlaceObj?.auctionEnabled
  const isGroupPlace = selectedPlaceObj?.groupType === 'group'

  // Use event's custom menu if available, else default items; filter by place exclusions
  const baseMenu = (event.menu && event.menu.length > 0) ? event.menu : PREORDER_ITEMS
  const activeMenu = baseMenu.filter(item => !item.excludedPlaces?.includes(selectedPlace))

  // maxPerAccount for selected place (0 = unlimited)
  const maxPerAccount = selectedPlaceObj?.maxPerAccount || 0

  const placePrice = selectedPlaceObj?.price || 0
  // Current ticket's orders
  const curTicketOrder = perTicketOrders[activePreorderTicket] || { items: {}, shows: {} }
  // Total preorder across all tickets
  const preorderTotal = perTicketOrders.reduce((total, t) =>
    total + activeMenu.reduce((sum, item) => sum + (t.items[item.name] || 0) * item.price, 0), 0)
  const totalPrice = placePrice + preorderTotal
  const walletBalance = getBalance(getUserId(user))
  const canAfford = walletBalance >= totalPrice
  const currentAuctionPrice = isAuctionPlace ? getCurrentAuctionPrice(event.id, selectedPlace) : 0

  function updatePreorder(name, delta) {
    setPerTicketOrders(prev => prev.map((t, i) =>
      i === activePreorderTicket
        ? { ...t, items: { ...t.items, [name]: Math.max(0, (t.items[name] || 0) + delta) } }
        : t
    ))
  }

  function confirmBooking() {
    // Deduct from wallet
    const uid = getUserId(user)
    const deducted = deductFunds(uid, totalPrice, `${event.name} — ${selectedPlace}`)
    if (!deducted) {
      setInsufficientFunds(true)
      setShowConfirmModal(false)
      return
    }
    setInsufficientFunds(false)

    const newTickets = []
    try {
      const prev = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      const newBookings = []

      for (let n = 0; n < ticketQty; n++) {
        const code = Math.random().toString(36).slice(2, 8).toUpperCase()
        const fullCode = `LIB-${event.id.toString().padStart(3, '0')}-${code}`
        const tOrder = perTicketOrders[n] || { items: {}, shows: {} }
        const tSummary = activeMenu.filter(i => (tOrder.items[i.name] || 0) > 0)
        const tPreorderTotal = activeMenu.reduce((sum, i) => sum + (tOrder.items[i.name] || 0) * i.price, 0)
        const booking = {
          id: code,
          ticketCode: fullCode,
          eventId: event.id,
          eventName: event.name,
          eventDate: event.dateDisplay,
          place: selectedPlace,
          placePrice,
          preorderItems: { ...tOrder.items },
          preorderSummary: tSummary.map(i => ({ ...i })),
          preorderShowSelections: { ...tOrder.shows },
          totalPrice: placePrice + tPreorderTotal,
          bookedAt: new Date().toISOString(),
          userName: user?.name || null,
          userEmail: user?.email || null,
        }
        const token = generateTicketToken(booking)
        booking.token = token
        newTickets.push({ ticketCode: fullCode, ticketToken: token, id: code })
        newBookings.push(booking)
      }

      localStorage.setItem('lib_bookings', JSON.stringify([...prev, ...newBookings]))
    } catch {}

    setBookedTickets(newTickets)
    // Increment user points + show toast
    if (user) {
      setUser({ ...user, points: (user.points || 0) + 1 })
      setShowPointsToast(true)
      setTimeout(() => setShowPointsToast(false), 2500)
    }
    // Track this booking in session
    setAllBookedThisSession(prev => [...prev, {
      place: selectedPlace,
      tickets: newTickets,
      totalPrice,
    }])
    setBookingStep('confirmed')
  }

  function resetBooking() {
    setBookingStep('place')
    setSelectedPlace(null)
    setPerTicketOrders([])
    setActivePreorderTicket(0)
    setTicketQty(1)
  }

  function selectShowOption(itemName, opt) {
    if (opt.requiresInfo) {
      setShowInfoModal({ itemName, opt })
      setShowInfoInput('')
    } else {
      setPerTicketOrders(prev => prev.map((t, i) =>
        i === activePreorderTicket
          ? { ...t, shows: { ...t.shows, [itemName]: { showOptionId: opt.id, showLabel: opt.label, showInfo: '' } } }
          : t
      ))
    }
  }

  function confirmShowInfo() {
    if (!showInfoModal) return
    setPerTicketOrders(prev => prev.map((t, i) =>
      i === activePreorderTicket
        ? { ...t, shows: { ...t.shows, [showInfoModal.itemName]: { showOptionId: showInfoModal.opt.id, showLabel: showInfoModal.opt.label, showInfo: showInfoInput } } }
        : t
    ))
    setShowInfoModal(null)
    setShowInfoInput('')
  }

  return (
    <Layout>
      <div>
        {/* Hero Banner */}
        <div
          className="relative h-52 overflow-hidden"
          style={event.imageUrl ? {} : { background: `linear-gradient(135deg, ${event.color}44 0%, #000 100%)` }}
        >
          {event.imageUrl ? (
            <img src={event.imageUrl} alt={event.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <span className="text-8xl font-black uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif', color: event.color }}>
                {event.name}
              </span>
            </div>
          )}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #080808 0%, transparent 60%)' }} />
          <button
            onClick={() => navigate('/evenements')}
            className="absolute top-4 left-4 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/80 transition-all"
          >
            ‹
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/80 transition-all text-sm"
            title="Partager"
          >
            ↗
          </button>
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="flex gap-2 mb-2">
              {event.tags?.map((t) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: event.accentColor, borderColor: event.color + '55', background: event.color + '11' }}>
                  {t}
                </span>
              ))}
            </div>
            <h1 className="text-4xl font-black uppercase leading-none" style={{ fontFamily: 'Bebas Neue, sans-serif', color: event.accentColor }}>
              {event.name}
            </h1>
            <p className="text-gray-400 text-sm">{event.subtitle}</p>
          </div>
        </div>

        {/* Quick info strip */}
        <div className="flex px-4 py-3 gap-4 border-b border-[#1a1a1a] overflow-x-auto">
          {[
            { icon: '📅', val: event.dateDisplay },
            { icon: '🕐', val: `${event.time} → ${event.endTime}` },
            { icon: '📍', val: event.location },
          ].map((item) => (
            <div key={item.icon} className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-sm">{item.icon}</span>
              <span className="text-gray-400 text-xs whitespace-nowrap">{item.val}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1a1a1a] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
                activeTab === tab ? 'border-[#d4af37] text-[#d4af37]' : 'border-transparent text-gray-600 hover:text-gray-400'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="px-4 py-5">

          {/* ── RÉSERVATION ── */}
          {activeTab === 'Réservation' && (
            <div className="space-y-4">

              {/* Step 1: choose place */}
              {bookingStep === 'place' && (
                <>
                  <h3 className="text-white font-semibold">Choisir ton type de place</h3>
                  {event.places.map((place) => {
                    const alreadyBooked = allBookedThisSession.filter(b => b.place === place.type)
                    const bookedCount = alreadyBooked.reduce((sum, b) => sum + b.tickets.length, 0)
                    return (
                    <div
                      key={place.type}
                      onClick={() => setSelectedPlace(place.type === selectedPlace ? null : place.type)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                        selectedPlace === place.type ? 'border-[#d4af37] bg-[#d4af37]/5' : 'border-[#222] hover:border-[#333]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{place.icon}</span>
                          <div>
                            <p className="font-semibold text-white">{place.type}</p>
                            <p className="text-gray-500 text-xs">{place.available}/{place.total} restantes</p>
                            {place.groupType === 'group' && (
                              <p className="text-blue-400 text-[10px] font-semibold mt-0.5">👥 {place.groupMin || '?'}–{place.groupMax || '?'} pers.</p>
                            )}
                            {bookedCount > 0 && (
                              <p className="text-green-400 text-[10px] font-semibold">✓ {bookedCount} billet{bookedCount > 1 ? 's' : ''} réservé{bookedCount > 1 ? 's' : ''}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[#d4af37] font-bold text-lg">{place.price}€</p>
                          {place.auctionEnabled && (
                            <p className="text-purple-400 text-[10px]">🔨 Enchère uniquement</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(place.available / place.total) * 100}%`, background: place.available < 10 ? '#ff4444' : event.color }}
                        />
                      </div>
                    </div>
                    )
                  })}

                  {insufficientFunds && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 space-y-1">
                      <p className="text-red-400 text-xs font-bold">💳 Solde insuffisant</p>
                      <p className="text-gray-500 text-[10px]">Solde : {getBalance(getUserId(user)).toFixed(2)}€ · Requis : {totalPrice}€</p>
                      <button
                        onClick={() => navigate('/portefeuille')}
                        className="text-[#d4af37] text-xs underline"
                      >
                        Recharger mon portefeuille →
                      </button>
                    </div>
                  )}

                  {selectedPlace && (
                    <div className="pt-2 space-y-3">
                      <div className="glass p-4 rounded-2xl space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Place sélectionnée</span>
                          <span className="text-white font-semibold">{selectedPlace}</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-[#1a1a1a] pt-2">
                          <span className="text-gray-400">
                            {isAuctionPlace ? (currentAuctionPrice > 0 ? 'Enchère actuelle' : 'Prix de base') : 'Prix'}
                          </span>
                          <span className="text-[#d4af37] font-bold">
                            {isAuctionPlace ? (currentAuctionPrice > 0 ? currentAuctionPrice : placePrice) : placePrice}€
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Points gagnés</span>
                          <span className="text-green-400">+1 point</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-[#1a1a1a] pt-2">
                          <span className="text-gray-400">Ton solde</span>
                          <span className={`font-bold ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                            {walletBalance.toFixed(2)}€
                          </span>
                        </div>
                      </div>

                      {!isGroupPlace && !isAuctionPlace && !canAfford && (
                        <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 rounded-2xl p-3">
                          <span className="text-red-400 text-lg flex-shrink-0">💳</span>
                          <div className="flex-1">
                            <p className="text-red-400 text-xs font-bold">Solde insuffisant</p>
                            <p className="text-gray-400 text-[10px] mt-0.5">
                              Il te manque <span className="text-white font-semibold">{(totalPrice - walletBalance).toFixed(2)}€</span> pour réserver cette place.
                            </p>
                            <button
                              onClick={() => navigate('/portefeuille')}
                              className="mt-1.5 text-[#d4af37] text-xs font-semibold underline underline-offset-2"
                            >
                              Recharger mon portefeuille →
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Auction place → switch to Enchères tab */}
                      {isAuctionPlace ? (
                        <button
                          className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-95"
                          style={{ background: 'linear-gradient(135deg, #7b2fff, #b980ff)' }}
                          onClick={() => setActiveTab('Enchères')}
                        >
                          🔨 Enchérir sur cette place
                        </button>
                      ) : event.preorder ? (
                        <button
                          className="btn-gold w-full"
                          onClick={() => {
                            setPerTicketOrders([{ items: {}, shows: {} }])
                            setActivePreorderTicket(0)
                            setBookingStep('preorder')
                          }}
                        >
                          Continuer →
                        </button>
                      ) : isGroupPlace ? (
                        <button className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 bg-blue-600 text-white" onClick={() => { setGroupSendConvId(null); setShowGroupSendModal(true) }}>
                          👥 Proposer au groupe →
                        </button>
                      ) : (
                        <button className="btn-gold w-full" onClick={() => setShowConfirmModal(true)}>
                          Confirmer la réservation
                        </button>
                      )}
                    </div>
                  )}

                  {/* Session bookings summary */}
                  {allBookedThisSession.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-green-400 text-xs font-semibold uppercase tracking-wider">✓ Tes réservations ce soir</p>
                      {allBookedThisSession.map((b, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-green-500/5 border border-green-500/20 rounded-xl text-xs">
                          <span className="text-white font-semibold">{b.place}</span>
                          <span className="text-green-400">{b.tickets.length} billet{b.tickets.length > 1 ? 's' : ''} · {b.totalPrice}€</span>
                        </div>
                      ))}
                      <p className="text-gray-600 text-[10px] text-center">Retrouve tes billets dans <span className="text-[#d4af37]">Mes billets</span></p>
                    </div>
                  )}
                </>
              )}

              {/* Step 2: preorder */}
              {bookingStep === 'preorder' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setBookingStep('place')} className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400">‹</button>
                    <div>
                      <h3 className="text-white font-semibold">Précommande de consommations</h3>
                      <p className="text-gray-500 text-xs">Optionnel · Récupère ta commande à l'entrée sans attendre</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {activeMenu.map((item) => {
                      const qty = curTicketOrder.items[item.name] || 0
                      const showSel = curTicketOrder.shows[item.name]
                      return (
                        <div key={item.name} className="border border-[#1e1e1e] rounded-xl hover:border-[#d4af37]/20 transition-all overflow-hidden">
                          <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                              ) : (
                                <span className="text-xl">{item.emoji}</span>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-white text-sm">{item.name}</p>
                                  {item.description && (
                                    <button
                                      onClick={() => setDescModal(item)}
                                      className="w-4 h-4 rounded-full bg-[#1a1a1a] border border-[#333] text-gray-500 text-[9px] flex items-center justify-center hover:border-[#d4af37]/50 hover:text-[#d4af37] transition-colors flex-shrink-0"
                                      title="Voir la description"
                                    >
                                      i
                                    </button>
                                  )}
                                  {item.hasShow && item.showOptions?.length > 0 && (
                                    <span className="text-[9px] text-[#d4af37] bg-[#d4af37]/10 border border-[#d4af37]/20 px-1.5 py-0.5 rounded-full flex-shrink-0">🎆 Show</span>
                                  )}
                                </div>
                                <p className="text-[#d4af37] text-xs font-semibold">{item.price}€</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => updatePreorder(item.name, -1)}
                                disabled={qty === 0}
                                className="w-7 h-7 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-white font-bold disabled:opacity-30 hover:border-[#d4af37]/50 transition-all"
                              >−</button>
                              <span className="text-white w-4 text-center text-sm font-bold">{qty}</span>
                              <button
                                onClick={() => updatePreorder(item.name, 1)}
                                className="w-7 h-7 rounded-full bg-[#d4af37] text-black flex items-center justify-center text-lg font-bold hover:scale-110 transition-transform"
                              >+</button>
                            </div>
                          </div>
                          {/* Show options — visible when qty > 0 and item has show */}
                          {qty > 0 && item.hasShow && item.showOptions?.length > 0 && (
                            <div className="px-3 pb-3 border-t border-[#1a1a1a] pt-2.5 space-y-1.5">
                              <p className="text-[10px] text-gray-500">🎆 Choisis ton show :</p>
                              <div className="flex flex-wrap gap-1.5">
                                {item.showOptions.map(opt => (
                                  <button
                                    key={opt.id}
                                    onClick={() => selectShowOption(item.name, opt)}
                                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-all font-semibold ${
                                      showSel?.showOptionId === opt.id
                                        ? 'bg-[#d4af37] border-[#d4af37] text-black'
                                        : 'border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/10'
                                    }`}
                                  >
                                    {opt.label}
                                    {opt.requiresInfo && showSel?.showOptionId !== opt.id ? ' ✎' : ''}
                                  </button>
                                ))}
                                {showSel && (
                                  <button
                                    onClick={() => setPerTicketOrders(prev => prev.map((t, i) => {
                                      if (i !== activePreorderTicket) return t
                                      const s = { ...t.shows }; delete s[item.name]; return { ...t, shows: s }
                                    }))}
                                    className="text-[10px] px-2 py-1 rounded-full border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all"
                                  >✕ Sans show</button>
                                )}
                              </div>
                              {showSel?.showInfo && (
                                <p className="text-[10px] text-gray-400 pl-1">↳ {showSel.showInfo}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Total */}
                  <div className="glass p-4 rounded-2xl space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Place · {selectedPlace}</span>
                      <span className="text-white">{placePrice}€</span>
                    </div>
                    {perTicketOrders.map((t, n) => {
                      const ticketItems = activeMenu.filter(i => (t.items[i.name] || 0) > 0)
                      if (ticketItems.length === 0) return null
                      return (
                        <div key={n} className="space-y-1">
                          {ticketItems.map(i => (
                            <div key={i.name} className="flex justify-between text-sm">
                              <span className="text-gray-400">{i.emoji || '•'} {i.name} ×{t.items[i.name]}</span>
                              <span className="text-white">{i.price * t.items[i.name]}€</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                    <div className="flex justify-between text-sm border-t border-[#222] pt-2 mt-2">
                      <span className="text-white font-bold">Total</span>
                      <span className="text-[#d4af37] font-bold text-lg">{totalPrice}€</span>
                    </div>
                  </div>

                  {isGroupPlace ? (
                    <button className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 bg-blue-600 text-white" onClick={() => { setGroupSendConvId(null); setShowGroupSendModal(true) }}>
                      👥 Proposer au groupe →
                    </button>
                  ) : (
                    <>
                      <button className="btn-gold w-full" onClick={() => setShowConfirmModal(true)}>
                        {preorderTotal > 0 ? `Confirmer la commande — ${totalPrice}€` : 'Confirmer sans précommande'}
                      </button>
                      <button
                        onClick={() => setShowConfirmModal(true)}
                        className="w-full py-2 text-gray-600 text-xs hover:text-gray-400 transition-colors"
                      >
                        Ignorer et réserver sans précommande
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Step confirmed */}
              {bookingStep === 'confirmed' && (
                <BookedCard
                  event={event}
                  selectedPlace={selectedPlace}
                  totalPrice={totalPrice}
                  bookedTickets={bookedTickets}
                  onBookAnother={resetBooking}
                />
              )}
            </div>
          )}

          {/* ── ENCHÈRES ── */}
          {activeTab === 'Enchères' && (
            <AuctionSystem event={event} initialPlace={isAuctionPlace ? selectedPlace : null} />
          )}

          {/* ── PLAYLIST ── */}
          {activeTab === 'Playlist' && (
            <PlaylistSystem event={event} booked={allBookedThisSession.length > 0} />
          )}

          {/* ── INFO ── */}
          {activeTab === 'Info' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-[#d4af37] text-xs uppercase tracking-widest mb-2">Description</h3>
                <p className="text-gray-300 text-sm leading-relaxed">{event.description}</p>
              </div>
              {(event.artists?.length > 0 || event.dj) && (
              <div>
                <h3 className="text-[#d4af37] text-xs uppercase tracking-widest mb-2">Artistes / DJ</h3>
                {event.artists?.length > 0 ? (
                  <div className="space-y-2">
                    {event.artists.map((a, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] font-semibold uppercase tracking-wider">{a.role}</span>
                        <span className="text-white text-sm font-semibold">{a.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white font-semibold">{event.dj}</p>
                )}
              </div>
              )}
              {event.performers?.length > 0 && (
                <div>
                  <h3 className="text-[#d4af37] text-xs uppercase tracking-widest mb-2">Performances</h3>
                  <div className="space-y-2">
                    {event.performers.map((p) => (
                      <div key={p} className="flex items-center gap-2 text-gray-300 text-sm">
                        <span className="text-[#d4af37]">✦</span> {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-[#d4af37] text-xs uppercase tracking-widest mb-2">Organisateur</h3>
                <div className="flex items-center gap-3 p-3 glass rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-[#d4af37] flex items-center justify-center text-black font-bold">
                    {event.organizer?.[0]}
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{event.organizer}</p>
                    <p className="text-gray-500 text-xs">Organisateur vérifié ✓</p>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-[#d4af37] text-xs uppercase tracking-widest mb-2">Lieu</h3>
                <div className="glass p-3 rounded-xl">
                  <p className="text-white text-sm">{event.location}</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location || event.city)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#d4af37] text-xs mt-1 hover:underline block"
                  >
                    Voir sur la carte →
                  </a>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>


      {/* Description modal */}
      {descModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDescModal(null)} />
          <div className="relative w-full max-w-sm glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              {descModal.imageUrl ? (
                <img src={descModal.imageUrl} alt={descModal.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <span className="text-3xl">{descModal.emoji}</span>
              )}
              <div>
                <p className="text-white font-bold">{descModal.name}</p>
                <p className="text-[#d4af37] text-sm font-semibold">{descModal.price}€</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{descModal.description}</p>
            <button onClick={() => setDescModal(null)} className="btn-gold w-full text-sm">Fermer</button>
          </div>
        </div>
      )}

      {/* Share modal */}
      {showShareModal && (() => {
        const myId = getUserId(user)
        const myName = user?.name || 'Moi'
        const convs = getConversations(myId)
        const minPrice = event.places?.length > 0 ? Math.min(...event.places.map(p => p.price)) : null
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowShareModal(false)} />
            <div className="relative w-full max-w-md bg-[#0d0d0d] border border-[#1a1a1a] rounded-t-3xl max-h-[60vh] flex flex-col pb-6">
              <div className="p-4 border-b border-[#1a1a1a]">
                <div className="w-10 h-1 bg-[#333] rounded-full mx-auto mb-3" />
                <h3 className="text-white font-bold text-center text-sm">Partager l'événement</h3>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-[#111]">
                {convs.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-10">Aucune conversation</p>
                ) : convs.map(conv => {
                  const isGroup = conv.type === 'group'
                  const otherName = isGroup
                    ? conv.name
                    : (() => {
                        const otherId = conv.participants?.find(id => id !== myId)
                        return conv.names?.[otherId] || 'Utilisateur'
                      })()
                  return (
                    <button
                      key={conv.id}
                      onClick={() => {
                        const payload = JSON.stringify({ id: event.id, name: event.name, date: event.dateDisplay, price: minPrice, image: event.imageUrl || null })
                        sendMessage(conv.id, myId, myName, 'event', payload)
                        setShowShareModal(false)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#111] transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#222] flex items-center justify-center flex-shrink-0 text-xs font-bold text-[#d4af37]">
                        {isGroup ? '👥' : getInitials(otherName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{otherName}</p>
                        <p className="text-gray-600 text-xs">{formatTime(conv.updatedAt)}</p>
                      </div>
                      <span className="text-[#d4af37] text-xs">↗</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Confirm booking modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative w-full max-w-md bg-[#0d0d0d] border border-[#1a1a1a] rounded-t-3xl p-6 space-y-4 pb-8">
            <div className="w-10 h-1 bg-[#333] rounded-full mx-auto" />
            <div className="flex flex-col items-center text-center gap-2 pt-1">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-white font-bold text-base">Confirmer la réservation ?</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Une fois confirmée, tu ne pourras <span className="text-white font-semibold">plus modifier</span> ta précommande ni ton son de playlist.
              </p>
              {event.preorder && preorderTotal === 0 && (
                <p className="text-gray-600 text-xs">Tu pars sans précommande — tu pourras commander sur place.</p>
              )}
            </div>
            {!canAfford && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3.5 space-y-1.5">
                <p className="text-red-400 text-sm font-bold">💳 Solde insuffisant</p>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Ton solde</span>
                  <span className="text-red-400 font-bold">{walletBalance.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Montant requis</span>
                  <span className="text-white font-bold">{totalPrice}€</span>
                </div>
                <div className="flex justify-between text-xs border-t border-red-500/20 pt-1.5">
                  <span className="text-gray-400">Il manque</span>
                  <span className="text-red-300 font-bold">{(totalPrice - walletBalance).toFixed(2)}€</span>
                </div>
                <button
                  onClick={() => { setShowConfirmModal(false); navigate('/portefeuille') }}
                  className="w-full mt-1 py-2.5 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] text-xs font-bold hover:bg-[#d4af37]/20 transition-colors"
                >
                  Recharger mon portefeuille →
                </button>
              </div>
            )}
            <div className="space-y-2 pt-2">
              <button
                className={`btn-gold w-full ${!canAfford ? 'opacity-30 cursor-not-allowed' : ''}`}
                onClick={() => { if (!canAfford) return; setShowConfirmModal(false); confirmBooking() }}
                disabled={!canAfford}
              >
                Oui, confirmer
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="w-full py-3 rounded-2xl border border-[#333] text-gray-400 text-sm font-semibold hover:border-[#555] transition-colors"
              >
                Retour
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group send modal */}
      {showGroupSendModal && (() => {
        const myId = getUserId(user)
        const myName = user?.name || 'Moi'
        const groupConvs = getConversations(myId).filter(c => c.type === 'group')
        const preorderData = perTicketOrders[0] || { items: {}, shows: {} }
        const preorderItems = Object.entries(preorderData.items || {}).filter(([, q]) => q > 0)
        function sendGroupProposal() {
          if (!groupSendConvId) return
          const conv = groupConvs.find(c => c.id === groupSendConvId)
          const bookingId = 'gb_' + Date.now()
          saveGroupBooking({
            id: bookingId,
            eventId: event.id,
            eventName: event.name,
            eventDate: event.dateDisplay || event.date,
            eventImage: event.imageUrl || null,
            placeName: selectedPlace,
            placePrice,
            groupMin: selectedPlaceObj?.groupMin || 2,
            groupMax: selectedPlaceObj?.groupMax || 0,
            preorderData,
            preorderTotal,
            totalPrice,
            convId: groupSendConvId,
            convMemberCount: conv?.members?.length || 2,
            proposerId: myId,
            proposerName: myName,
            status: 'pending',
            approvals: { [myId]: true },
            songSelections: {},
            createdAt: Date.now(),
          })
          sendMessage(groupSendConvId, myId, myName, 'group_booking', bookingId)
          setShowGroupSendModal(false)
          navigate('/messagerie')
        }
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowGroupSendModal(false)} />
            <div className="relative w-full max-w-md bg-[#0d0d0d] border border-[#1a1a1a] rounded-t-3xl p-5 space-y-4 pb-8">
              <div className="w-10 h-1 bg-[#333] rounded-full mx-auto" />
              <div>
                <h3 className="text-white font-bold text-base">Proposer au groupe</h3>
                <p className="text-gray-500 text-xs mt-0.5">Choisis une conversation de groupe</p>
              </div>

              {/* Summary card */}
              <div className="bg-[#111] border border-[#222] rounded-2xl p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Place</span>
                  <span className="text-white font-semibold">{selectedPlace}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Groupe</span>
                  <span className="text-blue-400 font-semibold">👥 {selectedPlaceObj?.groupMin || '?'}–{selectedPlaceObj?.groupMax || '?'} pers.</span>
                </div>
                {preorderItems.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Précommande</span>
                    <span className="text-[#d4af37]">{preorderItems.map(([n, q]) => `${q}× ${n}`).join(', ')}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#1a1a1a] pt-1.5">
                  <span className="text-gray-500">Total</span>
                  <span className="text-[#d4af37] font-bold">{totalPrice}€</span>
                </div>
              </div>

              {/* Group conversation list */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {groupConvs.length === 0 ? (
                  <p className="text-gray-600 text-xs text-center py-4">Aucune conversation de groupe trouvée.<br/>Crée un groupe dans Messages.</p>
                ) : groupConvs.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setGroupSendConvId(c.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${groupSendConvId === c.id ? 'border-blue-500 bg-blue-500/10' : 'border-[#222] hover:border-[#333]'}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-sm font-bold text-[#d4af37] flex-shrink-0">
                      {getInitials(c.name || '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{c.name}</p>
                      <p className="text-gray-600 text-[10px]">{c.members?.length || 0} membres</p>
                    </div>
                    {groupSendConvId === c.id && <span className="text-blue-400 text-sm">✓</span>}
                  </button>
                ))}
              </div>

              <button
                className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${groupSendConvId ? 'bg-blue-600 text-white active:scale-95' : 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'}`}
                onClick={sendGroupProposal}
                disabled={!groupSendConvId}
              >
                Envoyer la proposition →
              </button>
            </div>
          </div>
        )
      })()}

      {/* Show info modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowInfoModal(null)} />
          <div className="relative w-full max-w-sm glass rounded-2xl p-5 space-y-4">
            <div className="text-center">
              <span className="text-3xl">🎆</span>
              <h3 className="text-white font-bold mt-2">{showInfoModal.opt.label}</h3>
              <p className="text-gray-500 text-xs mt-1">Pour {showInfoModal.itemName}</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1 block">{showInfoModal.opt.infoPrompt || 'Information requise'}</label>
              <input
                className="input-dark"
                placeholder="Votre réponse..."
                value={showInfoInput}
                onChange={e => setShowInfoInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmShowInfo()}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowInfoModal(null)} className="btn-outline flex-1 text-sm">Annuler</button>
              <button onClick={confirmShowInfo} className="btn-gold flex-1 text-sm">Confirmer →</button>
            </div>
          </div>
        </div>
      )}
      {/* Points toast */}
      {showPointsToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#d4af37] text-black px-5 py-2.5 rounded-full font-bold text-sm shadow-lg animate-fade-in">
          🎯 +1 point gagné !
        </div>
      )}
    </Layout>
  )
}

function BookedCard({ event, selectedPlace, preorderSummary = [], preorderItems = {}, totalPrice, bookedTickets = [], onBookAnother }) {
  const [visibleQr, setVisibleQr] = useState(0)
  const ticket = bookedTickets[visibleQr] || bookedTickets[0] || {}
  const qrUrl = ticket.ticketToken ? `${window.location.origin}/ticket/${ticket.ticketToken}` : ''

  return (
    <div className="glass p-6 rounded-2xl text-center border border-green-500/20 space-y-3">
      <div className="flex items-center justify-center gap-2">
        <span className="text-green-400 text-xl">✓</span>
        <p className="text-white font-semibold">Réservation confirmée !</p>
      </div>
      <p className="text-gray-400 text-sm">{selectedPlace} · {event.name}</p>
      <p className="text-green-400 text-xs">+{bookedTickets.length} point{bookedTickets.length > 1 ? 's' : ''} ajouté{bookedTickets.length > 1 ? 's' : ''}</p>

      {/* Multiple ticket tabs */}
      {bookedTickets.length > 1 && (
        <div className="flex gap-1 justify-center flex-wrap">
          {bookedTickets.map((_, i) => (
            <button
              key={i}
              onClick={() => setVisibleQr(i)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${visibleQr === i ? 'bg-[#d4af37] border-[#d4af37] text-black' : 'border-[#333] text-gray-500'}`}
            >
              Billet {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* QR Code */}
      <div className="p-4 bg-white rounded-2xl inline-block">
        {qrUrl ? (
          <QRCodeSVG value={qrUrl} size={128} level="H" />
        ) : (
          <div style={{ width: 128, height: 128, background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: '#999' }}>QR...</span>
          </div>
        )}
      </div>

      <p className="text-gray-600 text-[10px]">Scanne ce QR code à l'entrée</p>
      <p className="text-gray-700 text-[10px] font-mono">{ticket.ticketCode}</p>
      <p className="text-gray-800 text-[9px]">🔐 Billet sécurisé · non duplicable</p>

      {/* Preorder details (only on first ticket) */}
      {visibleQr === 0 && preorderSummary.length > 0 && (
        <div className="p-3 bg-[#111] rounded-xl text-left space-y-1">
          <p className="text-[#d4af37] text-[10px] uppercase tracking-widest mb-2">🛒 Précommande incluse</p>
          {preorderSummary.map((item) => (
            <div key={item.name} className="flex justify-between text-xs">
              <span className="text-gray-300">{item.emoji} {item.name}</span>
              <span className="text-gray-500">×{preorderItems[item.name]}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs border-t border-[#222] pt-1 mt-1">
            <span className="text-gray-400">Total payé</span>
            <span className="text-[#d4af37] font-bold">{totalPrice}€</span>
          </div>
        </div>
      )}

      <p className="text-gray-600 text-xs">Retrouve tous tes billets dans <span className="text-[#d4af37]">Mes billets</span></p>

      {onBookAnother && (
        <button onClick={onBookAnother} className="w-full py-2.5 rounded-xl border border-[#d4af37]/30 text-[#d4af37] text-xs font-semibold hover:bg-[#d4af37]/10 transition-colors">
          + Réserver une autre place
        </button>
      )}

      {event.playlist && (
        <div className="text-xs text-purple-400 bg-purple-400/10 border border-purple-400/20 rounded-full px-3 py-1 inline-block">
          🎵 Playlist interactive débloquée
        </div>
      )}
    </div>
  )
}
