import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import Earth3D from '../components/Earth3D'
import RegionSelector from '../components/RegionSelector'
import { events, getTopEventsByRegion } from '../data/events'
import { useAuth } from '../context/AuthContext'
import { regions } from '../data/regions'
import { getActiveBoosts } from '../utils/ticket'

const EVENT_EMOJIS = ['⚡', '🔥', '👑']

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Region state — default to Île-de-France
  const defaultRegion = regions.find((r) => r.id === 'france')
  const [selectedRegion, setSelectedRegion] = useState(defaultRegion)
  const [showRegionSelector, setShowRegionSelector] = useState(false)

  // Get coordinates for the globe
  const lat = selectedRegion?.lat ?? 48.8
  const lon = selectedRegion?.lon ?? 2.3
  const regionLabel = selectedRegion?.name ?? 'Toutes les régions'

  // Get all events (static + user created)
  const allEvents = (() => {
    try {
      const created = JSON.parse(localStorage.getItem('lib_created_events') || '[]')
      return [...events, ...created]
    } catch { return events }
  })()

  // Build top 3 — boosted events take priority by position
  const activeBoosts = getActiveBoosts()
  const baseTopThree = selectedRegion
    ? getTopEventsByRegion(selectedRegion.name)
    : events.slice(0, 3)

  const boostedSlots = activeBoosts
    .map(b => {
      const ev = allEvents.find(e => e.id === b.eventId)
      return ev ? { ...ev, boostPosition: b.position, featured: true } : null
    })
    .filter(Boolean)
    .slice(0, 3)

  const boostedIds = new Set(boostedSlots.map(e => e.id))
  const fallback = baseTopThree.filter(e => !boostedIds.has(e.id))
  const topThree = [...boostedSlots, ...fallback].slice(0, 3)

  const handleRegionSelect = (region) => {
    setSelectedRegion(region)
  }

  return (
    <Layout>
      <div className="px-4 py-6 space-y-8">
        {/* Greeting */}
        <div className="animate-fade-in-up">
          <p className="text-gray-500 text-sm uppercase tracking-widest">Bonsoir,</p>
          <h2 className="text-2xl font-bold mt-1">
            {user?.name || 'Toi'} <span className="text-[#d4af37]">✦</span>
          </h2>
        </div>

        {/* 3D Globe */}
        <div className="animate-fade-in-up delay-100 text-center">
          <Earth3D
            lat={lat}
            lon={lon}
            regionLabel={regionLabel}
            onRegionClick={() => setShowRegionSelector(true)}
          />
          <p className="text-gray-600 text-xs mt-8 uppercase tracking-widest">
            Top événements {selectedRegion ? 'à' : ''}{' '}
            <span className="text-[#d4af37]/70">
              {selectedRegion ? selectedRegion.name : 'dans le monde'}
            </span>
          </p>
        </div>

        {/* Top Events */}
        <div className="animate-fade-in-up delay-200 space-y-3">
          {topThree.length > 0 ? (
            topThree.map((event, i) => (
              <button
                key={event.id}
                onClick={() => navigate(`/evenements/${event.id}`)}
                className="w-full text-left"
              >
                <div
                  className="relative rounded-2xl overflow-hidden border transition-all duration-300 hover:scale-[1.02]"
                  style={{
                    borderColor: event.color + '33',
                    background: `linear-gradient(135deg, #0d0d0d 0%, ${event.color}15 100%)`,
                  }}
                >
                  {/* Rank badge */}
                  <div
                    className="absolute top-3 left-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-black"
                    style={{ background: event.color }}
                  >
                    {i + 1}
                  </div>

                  {/* Boost badge */}
                  {event.boostPosition ? (
                    <div className="absolute top-3 right-3 text-[10px] text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      🚀 Boosté
                    </div>
                  ) : null}

                  <div className="flex items-center gap-4 p-4 pl-12">
                    {/* Event thumbnail — image if available, fallback emoji */}
                    <div
                      className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden"
                      style={{ border: `1px solid ${event.color}44` }}
                    >
                      {event.imageUrl ? (
                        <img src={event.imageUrl} alt={event.name} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-2xl"
                          style={{ background: event.color + '22' }}
                        >
                          {EVENT_EMOJIS[i] || '🎶'}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className="font-black text-lg uppercase tracking-wide leading-tight truncate"
                        style={{
                          fontFamily: 'Bebas Neue, sans-serif',
                          color: event.accentColor,
                        }}
                      >
                        {event.name}
                      </p>
                      <p className="text-gray-400 text-xs truncate">{event.subtitle}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-gray-500 text-xs">📅 {event.dateDisplay}</span>
                        <span className="text-gray-700">·</span>
                        <span className="text-gray-500 text-xs">📍 {event.city}</span>
                      </div>
                    </div>

                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">Aucun événement dans cette zone pour le moment</p>
              <p className="text-gray-600 text-xs mt-1">Change de région ou explore tout</p>
            </div>
          )}
        </div>

      </div>

      {/* Region Selector Modal */}
      <RegionSelector
        isOpen={showRegionSelector}
        onClose={() => setShowRegionSelector(false)}
        onSelect={handleRegionSelect}
        currentRegion={selectedRegion?.name}
      />
    </Layout>
  )
}
