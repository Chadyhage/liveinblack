import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllProviderProfiles } from '../utils/services'

// Recherche globale de l'accueil : cherche À LA FOIS les événements, les
// artistes/organisateurs (via les champs des events) et les prestataires
// (annuaire). Le placeholder s'écrit/s'efface tout seul avec des exemples.

const EXAMPLES = [
  'un événement ce soir',
  'DJ ou artiste',
  'une salle à louer',
  'un organisateur',
  'une soirée afro',
  'un prestataire',
]

// libellé court par type de prestataire
const PREST_LABEL = {
  salle: 'Salle', dj: 'DJ', artiste: 'Artiste', materiel: 'Matériel',
  traiteur: 'Traiteur', photographe: 'Photo/Vidéo', securite: 'Sécurité',
  supermarche: 'Supermarché', organisateur: 'Organisateur',
}

function readEvents() {
  try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]') } catch { return [] }
}

export default function HeroSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [placeholder, setPlaceholder] = useState('Rechercher…')
  const wrapRef = useRef(null)
  const reduce = useRef(false)

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
  const query = q.trim().toLowerCase()
  let results = []
  if (query) {
    const events = readEvents()
    const providers = getAllProviderProfiles()

    const evMatches = events.filter(e => {
      const hay = [e.name, e.city, e.category, e.subtitle, e.organizer, e.venue,
        ...(e.tags || []), ...(e.artists || []), ...(e.lineup || [])].join(' ').toLowerCase()
      return hay.includes(query)
    }).slice(0, 5).map(e => ({
      kind: 'event', id: e.id, title: e.name || 'Événement',
      meta: [e.dateDisplay, e.city].filter(Boolean).join(' · '),
      color: e.accentColor || '#4ee8c8', tag: 'Événement',
    }))

    const prMatches = providers.filter(p => {
      const hay = [p.name, p.location, p.description, p.prestataireType, PREST_LABEL[p.prestataireType],
        ...(p.tags || [])].join(' ').toLowerCase()
      return hay.includes(query)
    }).slice(0, 5).map(p => ({
      kind: 'provider', id: p.userId, title: p.name || 'Prestataire',
      meta: [PREST_LABEL[p.prestataireType] || 'Prestataire', p.location].filter(Boolean).join(' · '),
      color: '#c8a96e', tag: PREST_LABEL[p.prestataireType] || 'Prestataire',
    }))

    results = [...evMatches, ...prMatches]
  }

  function go(r) {
    setOpen(false); setQ('')
    if (r.kind === 'event') navigate(`/evenements/${r.id}`)
    else navigate('/proposer')
  }

  function submit() {
    if (results[0]) return go(results[0])
    if (query) navigate(`/evenements?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginTop: 24, maxWidth: 480, zIndex: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderRadius: 999,
        background: 'rgba(255,255,255,0.06)', border: `1px solid ${open ? 'rgba(78,232,200,0.5)' : 'rgba(255,255,255,0.1)'}`,
        boxShadow: open ? '0 0 0 4px rgba(78,232,200,0.06)' : 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
        backdropFilter: 'blur(12px)',
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder={q ? 'Rechercher un événement, artiste, prestataire…' : placeholder}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 15 }}
        />
        {q && (
          <button onClick={() => { setQ(''); setOpen(false) }} className="lib-press"
            style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 16, lineHeight: 1 }}>✕</button>
        )}
      </div>

      {/* Dropdown résultats */}
      {open && query && (
        <div className="lib-fade" style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
          background: '#0c0e16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18,
          boxShadow: '0 28px 60px -16px rgba(0,0,0,0.8)', backdropFilter: 'blur(22px)',
          padding: 8, maxHeight: 360, overflowY: 'auto',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '22px 14px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Aucun résultat pour « {q.trim()} »</p>
              <button onClick={submit} className="lib-press" style={{ marginTop: 10, padding: '8px 16px', borderRadius: 999, border: '1px solid rgba(78,232,200,0.4)', background: 'rgba(78,232,200,0.08)', color: '#4ee8c8', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Voir tous les événements</button>
            </div>
          ) : results.map(r => (
            <button key={r.kind + r.id} onClick={() => go(r)} className="lib-press"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <span style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.color + '1a', border: `1px solid ${r.color}40` }}>
                {r.kind === 'event'
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/></svg>}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                {r.meta && <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.meta}</span>}
              </span>
              <span style={{ flexShrink: 0, fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: r.color, padding: '3px 8px', borderRadius: 999, background: r.color + '14', border: `1px solid ${r.color}33` }}>{r.tag}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
