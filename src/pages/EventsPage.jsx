import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { events } from '../data/events'
import { useAuth } from '../context/AuthContext'
import { getUserId, sendMessage } from '../utils/messaging'

function getCreatedEvents() {
  try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]') } catch { return [] }
}
function getUnlockedEvents() {
  try { return JSON.parse(localStorage.getItem('lib_unlocked_events') || '[]') } catch { return [] }
}
function getEventCodes() {
  try { return JSON.parse(localStorage.getItem('lib_event_codes') || '{}') } catch { return {} }
}

const KNOWN_CATEGORIES = ['Afrobeat', 'Rap', 'Électronique']
const CATEGORIES = ['Tous', ...KNOWN_CATEGORIES, 'Autre']

export default function EventsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const myId = getUserId(user)
  const myName = user?.name || 'Moi'
  const [searchParams] = useSearchParams()
  const shareConvId = searchParams.get('share')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Tous')
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeMsg, setCodeMsg] = useState(null)
  const [sharedEventId, setSharedEventId] = useState(null)

  function handleShareEvent(event) {
    if (!shareConvId) return
    const minPrice = event.places?.length > 0 ? Math.min(...event.places.map(p => p.price)) : null
    const payload = JSON.stringify({ id: event.id, name: event.name, date: event.dateDisplay, price: minPrice, image: event.imageUrl || null })
    sendMessage(shareConvId, myId, myName, 'event', payload)
    setSharedEventId(event.id)
    setTimeout(() => navigate('/messagerie'), 800)
  }

  const allEvents = [...events, ...getCreatedEvents()]
  const unlockedEvents = getUnlockedEvents()

  // Filter: show public events + unlocked private events
  const visibleEvents = allEvents.filter(e => !e.isPrivate || unlockedEvents.includes(String(e.id)))

  const filtered = visibleEvents.filter((e) => {
    const matchSearch =
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.city.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase())
    const matchCategory =
      activeCategory === 'Tous' ||
      (activeCategory === 'Autre' ? !KNOWN_CATEGORIES.includes(e.category) : e.category === activeCategory)
    return matchSearch && matchCategory
  })

  function handleCodeSubmit() {
    const code = codeInput.trim().toUpperCase()
    if (!code) return

    const eventCodes = getEventCodes()
    let found = false

    for (const [eventId, codes] of Object.entries(eventCodes)) {
      const idx = codes.findIndex(c => c.code === code && !c.usedBy)
      if (idx !== -1) {
        // Mark code as used
        codes[idx].usedBy = 'user_' + Date.now()
        localStorage.setItem('lib_event_codes', JSON.stringify(eventCodes))

        // Unlock the event for this user
        const unlocked = getUnlockedEvents()
        if (!unlocked.includes(eventId)) {
          localStorage.setItem('lib_unlocked_events', JSON.stringify([...unlocked, eventId]))
        }

        found = true
        setCodeMsg({ type: 'success', text: '✓ Code valide ! Événement débloqué.' })
        setTimeout(() => {
          setShowCodeModal(false)
          setCodeInput('')
          setCodeMsg(null)
          navigate(`/evenements/${eventId}`)
        }, 1200)
        break
      }
    }

    if (!found) {
      // Check if code was already used
      let alreadyUsed = false
      for (const codes of Object.values(eventCodes)) {
        if (codes.find(c => c.code === code && c.usedBy)) {
          alreadyUsed = true
          break
        }
      }
      setCodeMsg({ type: 'error', text: alreadyUsed ? '⚠ Ce code a déjà été utilisé.' : '⚠ Code invalide ou expiré.' })
    }
  }

  return (
    <Layout>
      <div className="px-4 py-5 space-y-5">
        {/* Share mode banner */}
        {shareConvId && (
          <div className="flex items-center gap-3 p-3 bg-[#d4af37]/10 border border-[#d4af37]/30 rounded-2xl">
            <div className="w-9 h-9 rounded-xl bg-[#d4af37]/20 flex items-center justify-center flex-shrink-0 text-lg">📤</div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold">Mode partage</p>
              <p className="text-gray-500 text-xs">Appuie sur un événement pour l'envoyer dans la conversation</p>
            </div>
            <button onClick={() => navigate('/messagerie')} className="text-gray-600 hover:text-white text-lg flex-shrink-0">✕</button>
          </div>
        )}

        {/* Title + Code button */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="section-title text-3xl text-gold-gradient" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              Événements
            </h2>
            <p className="text-gray-500 text-xs mt-1">{visibleEvents.length} soirées disponibles</p>
          </div>
          {!shareConvId && (
            <button
              onClick={() => setShowCodeModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 text-[#d4af37] text-xs font-semibold hover:bg-[#d4af37]/20 transition-all"
            >
              🔑 J'ai un code
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600">🔍</span>
          <input
            className="input-dark pl-10"
            placeholder="Recherche par nom, ville, style..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                activeCategory === cat
                  ? 'bg-[#d4af37] text-black border-[#d4af37]'
                  : 'border-white/[0.07] text-gray-500 hover:border-gray-500'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Events list */}
        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <p className="text-4xl mb-3">🔎</p>
              <p>Aucun événement trouvé</p>
            </div>
          ) : (
            filtered.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                shareMode={!!shareConvId}
                shared={sharedEventId === event.id}
                onClick={() => shareConvId ? handleShareEvent(event) : navigate(`/evenements/${event.id}`)}
              />
            ))
          )}
        </div>
      </div>

      {/* Code modal */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setShowCodeModal(false); setCodeInput(''); setCodeMsg(null) }} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="text-center">
              <span className="text-3xl">🔑</span>
              <h3 className="text-white font-bold mt-2">Code d'accès privé</h3>
              <p className="text-gray-500 text-xs mt-1">Entre le code reçu de l'organisateur pour débloquer la soirée.</p>
            </div>
            <input
              className="input-dark text-center tracking-[0.25em] font-mono uppercase text-lg"
              placeholder="EX: NEON2026"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeMsg(null) }}
              onKeyDown={e => e.key === 'Enter' && handleCodeSubmit()}
              maxLength={20}
            />
            {codeMsg && (
              <div className={`p-3 rounded-xl text-xs text-center ${codeMsg.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {codeMsg.text}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowCodeModal(false); setCodeInput(''); setCodeMsg(null) }} className="btn-outline flex-1 text-sm">
                Annuler
              </button>
              <button onClick={handleCodeSubmit} className="btn-gold flex-1 text-sm">
                Valider →
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function EventCard({ event, onClick, shareMode, shared }) {
  return (
    <button onClick={onClick} className="w-full text-left group">
      <div
        className={`relative rounded-2xl overflow-hidden border transition-all duration-300 group-hover:scale-[1.01] ${shared ? 'opacity-60 scale-[0.99]' : ''}`}
        style={{ borderColor: shareMode ? '#d4af3766' : event.color + '33', background: '#08080f' }}
      >
        {shareMode && !shared && (
          <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-2xl">
            <div className="flex items-center gap-2 bg-[#d4af37] text-black font-bold px-5 py-2.5 rounded-xl text-sm">
              📤 Partager dans la conversation
            </div>
          </div>
        )}
        {shared && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 rounded-2xl">
            <div className="flex items-center gap-2 bg-green-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
              ✓ Envoyé !
            </div>
          </div>
        )}
        {/* Color banner */}
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${event.color}, ${event.accentColor})` }} />

        {event.imageUrl ? (
          /* ── Image card (user-created events with photo) ── */
          <>
            <div className="w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <img
                src={event.imageUrl}
                alt={event.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="p-3 flex items-center justify-between">
              <div>
                <h3
                  className="font-black text-lg uppercase leading-tight"
                  style={{ fontFamily: 'Bebas Neue, sans-serif', color: event.accentColor }}
                >
                  {event.name}
                </h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-gray-500 text-xs">📅 {event.dateDisplay}</span>
                  <span className="text-gray-500 text-xs">📍 {event.city}</span>
                </div>
              </div>
              {event.userCreated && (
                <span className="text-[10px] text-[#d4af37] bg-[#d4af37]/10 border border-[#d4af37]/20 px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                  Mon event
                </span>
              )}
            </div>
          </>
        ) : (
          /* ── Gradient card (static events) ── */
          <>
            <div
              className="h-32 relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${event.color}22 0%, ${event.color}08 100%)` }}
            >
              <div
                className="absolute inset-0 opacity-10"
                style={{ backgroundImage: `radial-gradient(circle at 20% 50%, ${event.color} 0%, transparent 50%), radial-gradient(circle at 80% 20%, ${event.accentColor} 0%, transparent 40%)` }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl font-black uppercase tracking-wider opacity-30" style={{ fontFamily: 'Bebas Neue, sans-serif', color: event.color }}>
                  {event.name}
                </span>
              </div>
              <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                {event.tags.map((tag) => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: event.accentColor, borderColor: event.color + '44', background: event.color + '11' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-black text-xl uppercase leading-tight" style={{ fontFamily: 'Bebas Neue, sans-serif', color: event.accentColor }}>
                {event.name}
              </h3>
              <p className="text-gray-500 text-xs">{event.subtitle}</p>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.05]">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-600 text-sm">📅</span>
                  <span className="text-gray-400 text-xs">{event.dateDisplay}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-600 text-sm">🕐</span>
                  <span className="text-gray-400 text-xs">{event.time}</span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-gray-600 text-sm">📍</span>
                  <span className="text-gray-400 text-xs truncate max-w-24">{event.city}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </button>
  )
}
