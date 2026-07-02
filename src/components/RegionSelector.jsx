import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { regions } from '../data/regions'

// ─── Design tokens ────────────────────────────────────────────────────────
const FONT = 'Inter, sans-serif'
const COLORS = {
  teal: '#4ee8c8',
  gold: '#c8a96e',
  muted: 'rgba(255,255,255,0.5)',
  dim: 'rgba(255,255,255,0.32)',
}

// Petite identité couleur par pays (badge) — donne de la vie à la liste.
const CODE_STYLE = {
  FR: { grad: 'linear-gradient(135deg, #4f7cff, #8b5cf6)', ring: 'rgba(99,140,255,0.5)' },
  TG: { grad: 'linear-gradient(135deg, #4ee8c8, #2fb89a)', ring: 'rgba(78,232,200,0.5)' },
  BJ: { grad: 'linear-gradient(135deg, #c8a96e, #e05aaa)', ring: 'rgba(200,169,110,0.5)' },
}

export default function RegionSelector({ isOpen, onClose, onSelect, currentRegion }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return regions
    return regions.filter(
      (r) => r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q)
    )
  }, [search])

  if (!isOpen) return null

  // Portal vers <body> : sinon un ancêtre transformé (RevealSection…) casse le
  // position:fixed et le bottom-sheet se retrouve hors écran.
  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      {/* Backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.74)', backdropFilter: 'blur(10px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480,
        maxHeight: '82vh',
        background: 'linear-gradient(180deg, rgba(18,16,30,0.98) 0%, rgba(8,9,16,0.98) 100%)',
        backdropFilter: 'blur(28px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '22px 22px 0 0',
        overflow: 'hidden',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
        animation: 'slideUp 0.24s cubic-bezier(0.22,0.9,0.3,1)',
      }}>
        {/* Lueur d'ambiance en haut */}
        <div style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)', width: 300, height: 160, background: 'radial-gradient(ellipse, rgba(78,232,200,0.12), transparent 70%)', pointerEvents: 'none' }} />

        {/* Header */}
        <div style={{ position: 'relative', padding: '14px 18px 14px' }}>
          <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.14)', borderRadius: 99, margin: '0 auto 16px' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontFamily: FONT, fontWeight: 800, fontSize: 23, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}>
                Choisis ta zone
              </h3>
              <p style={{ fontFamily: FONT, fontSize: 12.5, color: COLORS.dim, margin: '3px 0 0' }}>
                Les soirées près de chez toi
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg
              style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, pointerEvents: 'none' }}
              fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.35)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher un pays…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                padding: '12px 14px 12px 42px',
                fontFamily: FONT, fontSize: 14, color: '#fff', outline: 'none',
                transition: 'border-color 0.2s, background 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(78,232,200,0.5)'; e.target.style.background = 'rgba(78,232,200,0.05)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.background = 'rgba(255,255,255,0.05)' }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(82vh - 168px)', padding: '4px 14px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* "All" option */}
          <button
            onClick={() => { onSelect(null); onClose() }}
            className="lib-press"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 13,
              padding: 13, borderRadius: 14, cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.15s',
              background: !currentRegion ? 'rgba(78,232,200,0.09)' : 'rgba(255,255,255,0.03)',
              border: !currentRegion ? '1px solid rgba(78,232,200,0.4)' : '1px solid rgba(255,255,255,0.08)',
            }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12, flexShrink: 0,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={!currentRegion ? COLORS.teal : 'rgba(255,255,255,0.5)'} strokeWidth={1.6}>
                <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: !currentRegion ? '#fff' : 'rgba(255,255,255,0.85)', margin: 0 }}>Toutes les régions</p>
              <p style={{ fontFamily: FONT, fontSize: 12, color: COLORS.dim, margin: '2px 0 0' }}>Voir tous les événements</p>
            </div>
            {!currentRegion && <Check />}
          </button>

          {filtered.length > 0 && (
            <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.14em', padding: '10px 4px 2px', margin: 0 }}>
              Pays disponibles
            </p>
          )}

          {filtered.map((region) => {
            const isActive = currentRegion === region.name
            const cs = CODE_STYLE[region.code] || CODE_STYLE.TG
            return (
              <button
                key={region.id}
                onClick={() => { onSelect(region); onClose() }}
                className="lib-press"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.18s',
                  background: isActive ? 'rgba(78,232,200,0.09)' : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1px solid rgba(78,232,200,0.45)' : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: isActive ? '0 6px 22px rgba(78,232,200,0.10)' : 'none',
                }}>
                {/* Badge pays coloré */}
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: cs.grad,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 14px -4px ${cs.ring}`,
                }}>
                  <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 15, letterSpacing: '0.02em', color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>{region.code}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, letterSpacing: '-0.2px', color: isActive ? '#fff' : 'rgba(255,255,255,0.9)', margin: 0 }}>
                    {region.name}
                  </p>
                  <p style={{ fontFamily: FONT, fontSize: 12, color: COLORS.dim, margin: '2px 0 0' }}>
                    Voir les événements
                  </p>
                </div>
                {isActive
                  ? <Check />
                  : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
              </button>
            )
          })}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontFamily: FONT, fontSize: 14, color: COLORS.dim, margin: 0 }}>Aucun pays trouvé</p>
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
  ), document.body)
}

function Check() {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(78,232,200,0.18)', border: '1px solid #4ee8c8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  )
}
