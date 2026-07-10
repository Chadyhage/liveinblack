// Carrousel « Actualité » de l'accueil — bandeau éditorial curé par l'admin.
//
// Idée : un espace en haut de l'accueil où l'équipe met en avant une sélection
// d'événements (le gros événement du week-end, les nouveautés, une saison de
// festivals…). Contrairement aux autres sections (Top 3, « ce soir »,
// recommandations) qui sont AUTOMATIQUES, celle-ci est ÉDITORIALE : c'est
// l'admin qui choisit le titre, l'accent et les événements depuis le panneau.
//
// Robustesse : si la config est inactive ou qu'aucun événement curé n'est
// encore pertinent (tous passés / annulés / dépubliés), le composant ne rend
// RIEN — pas de section vide, pas de layout cassé. Le style des cartes reprend
// exactement celui de TonightCarousel pour rester cohérent visuellement.

import { useEffect, useState } from 'react'
import { listenActualite, resolveActualiteEvents, accentOf, defaultActualite } from '../utils/homepageConfig'
import { remainingPlaces } from './TonightCarousel'
import { fmtMoney, eventCurrency } from '../utils/money'
import EventHoverMedia from './EventHoverMedia'

function minPrice(ev) {
  const prices = (ev.places || []).map(p => Number(p.price) || 0)
  return prices.length ? Math.min(...prices) : 0
}

export default function ActualiteCarousel({ allEvents, onOpen }) {
  const [cfg, setCfg] = useState(defaultActualite())

  useEffect(() => {
    const unsub = listenActualite(setCfg)
    return unsub
  }, [])

  const items = resolveActualiteEvents(cfg, allEvents)
  // Rien à montrer → on n'occupe aucune place dans la page.
  if (!items.length) return null

  const accent = accentOf(cfg)

  return (
    <div style={{ marginTop: 8, marginBottom: 12 }}>
      {/* En-tête éditorial (titre + sous-titre + pastille accent) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 8, background: accent.soft, border: `1px solid ${accent.border}` }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent.dot }} />
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: accent.dot }}>
            {cfg.title}
          </span>
        </span>
        {cfg.subtitle && (
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {cfg.subtitle}
          </span>
        )}
      </div>

      {/* Carrousel horizontal — même carte que « Réservez pour ce soir » */}
      <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
        {items.map(ev => {
          const rem = remainingPlaces(ev)
          const price = minPrice(ev)
          const lowStock = rem > 0 && rem <= 25
          return (
            <button key={ev.id} onClick={() => onOpen(ev.id)}
              className="tonight-card"
              style={{ scrollSnapAlign: 'start', flexShrink: 0, textAlign: 'left', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.07)', background: '#0b0d14', borderRadius: 18, overflow: 'hidden', padding: 0, transition: 'transform 0.25s ease, border-color 0.25s ease' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = accent.border }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
              {/* Visuel */}
              <div className="tonight-card-img" style={{ position: 'relative' }}>
                <EventHoverMedia
                  event={ev}
                  height="100%"
                  zoom
                  fallbackBackground={`radial-gradient(circle at 30% 30%, ${ev.color || '#2a2440'}99, transparent 60%), linear-gradient(135deg, #1a1426, #0b0d14)`}
                  overlay="linear-gradient(to top, rgba(11,13,20,0.92) 4%, transparent 62%)"
                />
                {/* Badge « À la une » — signal éditorial, à l'accent choisi */}
                <span style={{ position: 'absolute', top: 8, left: 8, fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: '#0b0d14', background: accent.dot, padding: '4px 9px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                  À la une
                </span>
                {lowStock && (
                  <span style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.9)', background: 'rgba(5,6,10,0.85)', padding: '3px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)' }}>
                    {rem} places
                  </span>
                )}
                <p style={{ position: 'absolute', left: 10, right: 10, bottom: 8, margin: 0, fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 15, letterSpacing: '-0.2px', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.name}
                </p>
              </div>
              {/* Pied */}
              <div style={{ padding: '9px 11px 11px' }}>
                <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.city || ev.location || ''}{ev.region ? ` · ${ev.region}` : ''}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 6 }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13, color: '#c8a96e' }}>
                    {price > 0 ? `dès ${fmtMoney(price, eventCurrency(ev))}` : 'Gratuit'}
                  </span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: accent.dot }}>Découvrir →</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
