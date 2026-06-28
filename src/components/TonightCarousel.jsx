// Carrousel « Réservez pour ce soir » — discovery dernière minute.
// Affiche les soirées qui ont lieu AUJOURD'HUI, dans la région du visiteur, et
// où il reste des places. Pensé pour quelqu'un qui décide de sortir le soir
// même : il ouvre l'appli, voit ce qui se passe ce soir, et réserve direct.

// Places encore disponibles (somme des `available`, fallback `total`).
// Exporté pour que HomePage filtre les events « il reste des places ».
export function remainingPlaces(ev) {
  return (ev.places || []).reduce((sum, p) => {
    const av = p.available != null ? Number(p.available)
             : p.total != null ? Number(p.total)
             : 0
    return sum + Math.max(0, av || 0)
  }, 0)
}

function minPrice(ev) {
  const prices = (ev.places || []).map(p => Number(p.price) || 0)
  return prices.length ? Math.min(...prices) : 0
}

// Un carré / table VIP encore dispo ? (le user veut mettre en avant les carrés)
function hasCarreDispo(ev) {
  return (ev.places || []).some(p => {
    const grouped = p.groupType === 'group' || /carr|table|vip|loge|booth/i.test(p.type || '')
    const free = p.available == null ? true : Number(p.available) > 0
    return grouped && free
  })
}

export default function TonightCarousel({ events, onOpen, regionName }) {
  const empty = !events || events.length === 0

  return (
    <div style={{ marginTop: 8, marginBottom: 12 }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999, background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.35)' }}>
          <span className="animate-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: '#e05aaa', boxShadow: '0 0 8px rgba(224,90,170,0.9)' }} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#e05aaa' }}>
            Réservez pour ce soir
          </span>
        </span>
        {!empty && (
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.32)' }}>
            {events.length} soirée{events.length > 1 ? 's' : ''}{regionName && regionName !== 'Toutes' ? ` · ${regionName}` : ''}
          </span>
        )}
      </div>

      {/* État vide : aucune soirée dans les prochaines heures */}
      {empty && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.025)', border: '1px dashed rgba(255,255,255,0.12)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(224,90,170,0.10)', border: '1px solid rgba(224,90,170,0.25)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e05aaa" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0-6 6c0 4-2 5-2 5h16s-2-1-2-5a6 6 0 0 0-6-6z"/><path d="M10 20a2 2 0 0 0 4 0"/><line x1="3" y1="3" x2="21" y2="21" stroke="#e05aaa" strokeWidth="1.4"/></svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700, color: '#fff' }}>Rien pour ce soir… pour l'instant</p>
            <p style={{ margin: '3px 0 0', fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
              Aucune soirée dans les prochaines heures{regionName && regionName !== 'Toutes' ? ` à ${regionName}` : ''}. Reviens vite, ça bouge tout le temps 👀
            </p>
          </div>
        </div>
      )}
      {!empty && (<>

      {/* Carrousel horizontal */}
      <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
        {events.map(ev => {
          const rem = remainingPlaces(ev)
          const price = minPrice(ev)
          const carre = hasCarreDispo(ev)
          const lowStock = rem > 0 && rem <= 25
          return (
            <button key={ev.id} onClick={() => onOpen(ev.id)}
              style={{ scrollSnapAlign: 'start', flexShrink: 0, width: 230, textAlign: 'left', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.07)', background: '#0b0d14', borderRadius: 18, overflow: 'hidden', padding: 0, transition: 'transform 0.25s ease, border-color 0.25s ease' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(224,90,170,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}>
              {/* Visuel */}
              <div style={{ position: 'relative', height: 130 }}>
                {ev.imageUrl
                  ? <img src={ev.imageUrl} alt={ev.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', background: `radial-gradient(circle at 30% 30%, ${ev.color || '#2a2440'}99, transparent 60%), linear-gradient(135deg, #1a1426, #0b0d14)` }} />
                }
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,13,20,0.92) 4%, transparent 62%)' }} />
                {/* Heure de début — l'info clé pour "ce soir" */}
                <span style={{ position: 'absolute', top: 8, left: 8, fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 800, color: '#0b0d14', background: '#e05aaa', padding: '3px 9px', borderRadius: 7, boxShadow: '0 4px 12px rgba(224,90,170,0.4)' }}>
                  {ev.time || 'CE SOIR'}
                </span>
                {lowStock && (
                  <span style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.9)', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: '3px 7px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)' }}>
                    {rem} pl.
                  </span>
                )}
                <p style={{ position: 'absolute', left: 10, right: 10, bottom: 8, margin: 0, fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.name}
                </p>
              </div>
              {/* Pied */}
              <div style={{ padding: '9px 11px 11px' }}>
                <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.city || ev.location || ''}{ev.region ? ` · ${ev.region}` : ''}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 6 }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: '#c8a96e' }}>
                    {price > 0 ? `dès ${price}€` : 'Gratuit'}
                  </span>
                  {carre
                    ? <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, color: '#4ee8c8', background: 'rgba(78,232,200,0.1)', border: '1px solid rgba(78,232,200,0.25)', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>Carré dispo</span>
                    : <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, color: '#e05aaa' }}>Réserver →</span>
                  }
                </div>
              </div>
            </button>
          )
        })}
      </div>
      </>)}
    </div>
  )
}
