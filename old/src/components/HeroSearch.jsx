import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllProviderProfiles, isProviderVisible } from '../utils/services'
import { getLocalOrganizerProfiles } from '../utils/organizers'
import { MessagingSearchBar } from './MessagingActions'
import { getEntityRegionIds, getRegionName, normalizeGeoText } from '../utils/locations'
import { getProviderCategories } from '../utils/providerCategories'
import { getEventEndTimestamp } from '../utils/eventUrgency'

// Recherche globale de l'accueil : cherche À LA FOIS les événements, les
// organisateurs (annuaire /organisateurs) et les prestataires (annuaire). Le
// placeholder s'écrit/s'efface tout seul avec des exemples.

const EXAMPLES = [
  'un événement ce soir',
  'DJ ou artiste',
  'une salle à louer',
  'un organisateur',
  'une soirée afro',
  'un prestataire',
]

function readEvents() {
  try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]') } catch { return [] }
}

export default function HeroSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [placeholder, setPlaceholder] = useState('Rechercher…')
  const [remoteProviders, setRemoteProviders] = useState([])
  const [organizers, setOrganizers] = useState(() => getLocalOrganizerProfiles())
  const wrapRef = useRef(null)
  const reduce = useRef(false)

  // Source de vérité de la visibilité = Firestore temps réel (providers/), PAS le
  // cache local qui peut garder un subscriptionActive périmé (ex. abonnement
  // annulé) → sinon un prestataire non payé resterait affiché dans la recherche.
  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenProviders }) => {
      unsub = listenProviders(setRemoteProviders)
    }).catch(() => {})
    return () => { try { unsub() } catch {} }
  }, [])

  // Organisateurs = annuaire public (organizer_profiles). Même source temps réel
  // que la page /organisateurs, cache local en attendant le 1er snapshot.
  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenOrganizerProfiles }) => {
      unsub = listenOrganizerProfiles(setOrganizers)
    }).catch(() => {})
    return () => { try { unsub() } catch {} }
  }, [])

  // ── Placeholder « machine à écrire » ──
  useEffect(() => {
    reduce.current = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduce.current) { setPlaceholder('Rechercher un événement, artiste, prestataire…'); return }
    let ex = 0, ch = 0, deleting = false, timer
    const tick = () => {
      const word = EXAMPLES[ex]
      ch += deleting ? -1 : 1
      setPlaceholder('Rechercher ' + word.slice(0, ch) + (ch < word.length || deleting ? '|' : ''))
      let delay = deleting ? 38 : 70
      if (!deleting && ch === word.length) { deleting = false; delay = 1500; timer = setTimeout(() => { deleting = true; tick() }, delay); return }
      if (deleting && ch === 0) { deleting = false; ex = (ex + 1) % EXAMPLES.length; delay = 280 }
      timer = setTimeout(tick, delay)
    }
    timer = setTimeout(tick, 600)
    return () => clearTimeout(timer)
  }, [])

  // ── Fermer au clic extérieur ──
  useEffect(() => {
    if (!open) return
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // ── Résultats ──
  const query = normalizeGeoText(q)
  let results = []
  if (query) {
    // La recherche d'accueil ne doit montrer QUE des événements réellement
    // publics et à venir (audit pages #6 : avant, elle listait aussi les privés,
    // annulés, non publiés et passés). Un event privé se trouve via son code.
    const nowTs = Date.now()
    const events = readEvents().filter(e =>
      e && !e.isPrivate && e.cancelled !== true && e._pendingSync !== true
      && (!e.status || ['published', 'postponed', 'active'].includes(e.status))
      && (() => { const end = getEventEndTimestamp(e); return !end || end >= nowTs })()
    )
    // Firestore (remoteProviders) prioritaire sur le cache → subscriptionActive à jour.
    const byId = {}
    for (const p of getAllProviderProfiles()) if (p.userId) byId[p.userId] = p
    for (const p of remoteProviders) if (p.userId) byId[p.userId] = p
    const providers = Object.values(byId).filter(p => isProviderVisible(p))

    const evMatches = events.filter(e => {
      const hay = [e.name, e.city, e.category, e.subtitle, e.organizer, e.venue,
        e.region, ...(e.tags || []), ...(e.artists || []), ...(e.lineup || [])].map(normalizeGeoText).join(' ')
      return hay.includes(query)
    }).slice(0, 5).map(e => ({
      kind: 'event', id: e.id, title: e.name || 'Événement',
      meta: [e.dateDisplay, e.city].filter(Boolean).join(' · '),
      color: e.accentColor || '#4ee8c8', tag: 'Événement',
      image: e.imageUrl || e.image || e.cover || '',
    }))

    const prMatches = providers.filter(p => {
      const categories = getProviderCategories(p)
      const hay = [p.name, p.city, p.location, p.country, p.description, p.specialitesLibre,
        ...categories.flatMap(category => [category.label, category.singular]),
        ...getEntityRegionIds(p).map(getRegionName), ...(p.tags || [])].map(normalizeGeoText).join(' ')
      return hay.includes(query)
    }).slice(0, 5).map(p => {
      const categories = getProviderCategories(p)
      const primary = categories[0]
      const label = `${primary?.singular || 'Prestataire'}${categories.length > 1 ? ` +${categories.length - 1}` : ''}`
      return {
        kind: 'provider', id: p.userId, title: p.name || 'Prestataire',
        meta: [label, p.city || p.location, p.country].filter(Boolean).join(' · '),
        color: primary?.color || '#c8a96e', tag: label,
        image: p.photoUrl || p.coverUrl || '',
      }
    })

    // Organisateurs : uniquement les pages publiques, ciblées par nom/ville/région.
    const orgMatches = organizers.filter(o => o.status === 'public').filter(o => {
      const hay = [o.publicName, o.city, o.country, o.shortDescription,
        ...getEntityRegionIds(o).map(getRegionName)].map(normalizeGeoText).join(' ')
      return hay.includes(query)
    }).slice(0, 5).map(o => ({
      kind: 'organizer', id: o.slug || o.id, title: o.publicName || 'Organisateur',
      meta: ['Organisateur', o.city, o.country].filter(Boolean).join(' · '),
      color: '#8444ff', tag: 'Organisateur',
      image: o.avatarUrl || o.bannerUrl || '',
    }))

    results = [...evMatches, ...orgMatches, ...prMatches]
  }

  function go(r) {
    setOpen(false); setQ('')
    if (r.kind === 'event') navigate(`/evenements/${r.id}`)
    else if (r.kind === 'organizer') navigate(`/organisateurs/${encodeURIComponent(r.id)}`)
    else navigate(`/prestataires/${encodeURIComponent(r.id)}`)
  }

  function submit() {
    if (results[0]) return go(results[0])
    if (query) navigate(`/evenements?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginTop: 24, maxWidth: 480, zIndex: 20 }}>
      {/* Barre identique à celle des messages (laser émeraude + loupe essuie-glace) */}
      <MessagingSearchBar
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder={q ? 'Rechercher un événement, artiste, prestataire…' : placeholder}
      />

      {/* Dropdown résultats */}
      {open && query && (
        <div className="lib-fade" style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
          background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          padding: 8, maxHeight: 360, overflowY: 'auto',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '22px 14px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Aucun résultat pour « {q.trim()} »</p>
              <button onClick={submit} className="lib-press" style={{ marginTop: 10, padding: '10px 16px', borderRadius: 10, border: 'none', background: '#3ed6b5', color: '#04120e', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Voir tous les événements</button>
            </div>
          ) : results.map(r => (
            <button key={r.kind + r.id} onClick={() => go(r)} className="lib-press"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <span style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.color + '1a', border: `1px solid ${r.color}40` }}>
                {r.image
                  ? <img src={r.image} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : r.kind === 'event'
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  : r.kind === 'organizer'
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/><path d="M9 10h.01M15 10h.01"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/></svg>}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                {r.meta && <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.meta}</span>}
              </span>
              <span style={{ flexShrink: 0, fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: r.color, padding: '3px 8px', borderRadius: 8, background: r.color + '1f', border: `1px solid ${r.color}59` }}>{r.tag}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
