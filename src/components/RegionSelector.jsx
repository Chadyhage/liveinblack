import { useState, useMemo } from 'react'
import { regions } from '../data/regions'

// ─── Design tokens ────────────────────────────────────────────────────────
const CARD = {
  background: 'rgba(8,10,20,0.55)',
  backdropFilter: 'blur(22px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
}

const FONTS = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
}

const COLORS = {
  teal: '#4ee8c8',
  gold: '#c8a96e',
  muted: 'rgba(255,255,255,0.42)',
  dim: 'rgba(255,255,255,0.22)',
}

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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      {/* Glass backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480,
        maxHeight: '80vh',
        background: 'rgba(8,10,20,0.96)', backdropFilter: 'blur(28px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '16px 16px 0 0',
        overflow: 'hidden',
        animation: 'slideUp 0.22s ease-out',
      }}>

        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(8,10,20,0.98)',
          backdropFilter: 'blur(20px)',
          padding: '16px 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Drag handle */}
          <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, margin: '0 auto 14px' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{
              fontFamily: FONTS.display, fontWeight: 300, fontSize: 22,
              color: '#fff', margin: 0, letterSpacing: '0.04em',
            }}>
              Choisis ta zone
            </h3>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, pointerEvents: 'none' }}
              fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.28)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher une ville ou un pays..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 6,
                padding: '9px 12px 9px 36px',
                fontFamily: FONTS.mono, fontSize: 12, color: '#fff',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(78,232,200,0.35)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)' }}
            />
          </div>
        </div>

        {/* Regions list */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(80vh - 140px)', padding: '12px 12px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* "All" option */}
          <button
            onClick={() => { onSelect(null); onClose() }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: 12, borderRadius: 10, cursor: 'pointer',
              textAlign: 'left', transition: 'all 0.15s',
              background: !currentRegion ? 'rgba(78,232,200,0.07)' : 'rgba(255,255,255,0.02)',
              border: !currentRegion
                ? '1px solid rgba(78,232,200,0.35)'
                : '1px solid rgba(255,255,255,0.07)',
            }}>
            {/* Globe icon */}
            <div style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: !currentRegion ? 'rgba(78,232,200,0.10)' : 'rgba(255,255,255,0.04)',
              border: !currentRegion ? '1px solid rgba(78,232,200,0.25)' : '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={!currentRegion ? COLORS.teal : 'rgba(255,255,255,0.35)'} strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <p style={{
                fontFamily: FONTS.display, fontWeight: 300, fontSize: 16,
                color: !currentRegion ? '#fff' : COLORS.muted, margin: 0,
              }}>Toutes les régions</p>
              <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '2px 0 0' }}>
                Voir tous les événements
              </p>
            </div>
            {!currentRegion && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.teal, flexShrink: 0, boxShadow: `0 0 5px ${COLORS.teal}` }} />
            )}
          </button>

          {/* Grouped by country */}
          {Object.entries(grouped).map(([country, regionList]) => (
            <div key={country}>
              <p style={{
                fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                padding: '0 4px', marginBottom: 8,
              }}>
                {country}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {regionList.map((region) => {
                  const isActive = currentRegion === region.name
                  return (
                    <button
                      key={region.id}
                      onClick={() => { onSelect(region); onClose() }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: 10, borderRadius: 8, cursor: 'pointer',
                        textAlign: 'left', transition: 'all 0.15s',
                        background: isActive ? 'rgba(78,232,200,0.06)' : 'rgba(255,255,255,0.02)',
                        border: isActive
                          ? '1px solid rgba(78,232,200,0.35)'
                          : '1px solid rgba(255,255,255,0.06)',
                      }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                        background: isActive ? 'rgba(78,232,200,0.08)' : 'rgba(255,255,255,0.04)',
                        border: isActive ? '1px solid rgba(78,232,200,0.22)' : '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isActive ? COLORS.teal : 'rgba(255,255,255,0.30)'} strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                      </div>
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <p style={{
                          fontFamily: FONTS.display, fontWeight: 300, fontSize: 15,
                          color: isActive ? '#fff' : COLORS.muted, margin: 0,
                        }}>
                          {region.name}
                        </p>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '1px 0 0' }}>
                          {region.country}
                        </p>
                      </div>
                      {isActive && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS.teal, flexShrink: 0, boxShadow: `0 0 4px ${COLORS.teal}` }} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {Object.keys(grouped).length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.dim, margin: 0 }}>
                Aucune région trouvée
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>
    </div>
  )
}
