import { useState, useMemo } from 'react'
import { regions } from '../data/regions'

export default function RegionSelector({ isOpen, onClose, onSelect, currentRegion }) {
  const [search, setSearch] = useState('')

  // Group regions by country
  const grouped = useMemo(() => {
    const filtered = regions.filter(
      (r) =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.country.toLowerCase().includes(search.toLowerCase())
    )
    return filtered.reduce((acc, region) => {
      if (!acc[region.country]) acc[region.country] = []
      acc[region.country].push(region)
      return acc
    }, {})
  }, [search])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md max-h-[80vh] bg-[#0d0d0d] border border-[#222] rounded-t-3xl sm:rounded-3xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-[#0d0d0d]/95 backdrop-blur-md z-10 p-4 pb-3 border-b border-[#1a1a1a]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">Choisis ta zone</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher une ville ou un pays..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#111] border border-[#222] rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#d4af37]/40 transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* Regions list */}
        <div className="overflow-y-auto max-h-[60vh] p-3 space-y-4">
          {/* "All" option */}
          <button
            onClick={() => { onSelect(null); onClose() }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
              !currentRegion
                ? 'bg-[#d4af37]/10 border border-[#d4af37]/30'
                : 'bg-[#111] border border-transparent hover:border-[#222] hover:bg-[#151515]'
            }`}
          >
            <span className="text-lg">🌍</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Toutes les régions</p>
              <p className="text-[10px] text-gray-500">Voir tous les événements</p>
            </div>
            {!currentRegion && (
              <div className="ml-auto w-2 h-2 rounded-full bg-[#d4af37]" />
            )}
          </button>

          {/* Grouped by country */}
          {Object.entries(grouped).map(([country, regionList]) => (
            <div key={country}>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 px-2 mb-2">
                {regionList[0]?.flag} {country}
              </p>
              <div className="space-y-1">
                {regionList.map((region) => {
                  const isActive = currentRegion === region.name
                  return (
                    <button
                      key={region.id}
                      onClick={() => { onSelect(region); onClose() }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-[#d4af37]/10 border border-[#d4af37]/30'
                          : 'bg-[#111]/50 border border-transparent hover:border-[#222] hover:bg-[#151515]'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-sm">
                        📍
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-sm font-medium text-white">{region.name}</p>
                        <p className="text-[10px] text-gray-500">{region.country}</p>
                      </div>
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-[#d4af37]" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">Aucune région trouvée</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
