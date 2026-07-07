import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import PublicNav from '../components/PublicNav'
import { getAllProviderProfiles, isProviderVisible } from '../utils/services'
import { PROVIDER_CATEGORIES, getProviderCategories, getProviderCategory, getProviderTypes, providerMatchesCategory } from '../utils/providerCategories'
import { regions } from '../data/regions'
import { getEntityRegionIds, getRegionName, matchesEntityRegion, normalizeGeoText } from '../utils/locations'

// ─── Page publique PRESTATAIRES ──────────────────────────────────────────────
// Annuaire ouvert aux visiteurs non connectés : ils explorent librement les
// prestataires (DJ, salles, matériel, fournisseurs), puis ouvrent leur page
// détaillée. La prise de contact se fait ensuite dans la messagerie.
// Style aligné sur la vitrine (PublicLanding).

const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa', violet: '#8b5cf6' }
const FONT = 'Inter, sans-serif'

const CATS = PROVIDER_CATEGORIES
const catOf = getProviderCategory

function firstOfferImage(offers) {
  for (const offer of offers) {
    const media = Array.isArray(offer.media)
      ? offer.media
      : offer.mediaUrl ? [{ url: offer.mediaUrl, type: offer.mediaType || 'image' }] : []
    const image = media.find(entry => entry?.url && entry.type !== 'video')
    if (image) return image.url
  }
  return null
}

function CatIcon({ id, color = '#fff', size = 18 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (id === 'mic') return <svg {...p}><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M19 10a7 7 0 0 1-14 0" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
  if (id === 'building') return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1" /></svg>
  if (id === 'speaker') return <svg {...p}><rect x="5" y="2" width="14" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><circle cx="12" cy="6" r="1" /></svg>
  if (id === 'cart') return <svg {...p}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
  return <svg {...p}><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>
}

export default function PublicPrestataires() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState(null)
  const [regionId, setRegionId] = useState('')
  const [remote, setRemote] = useState([])
  const [catalogs, setCatalogs] = useState({})

  // Annuaire cross-device : collection partagée providers/ (Firestore) + local.
  useEffect(() => {
    let unsub = () => {}
    let unlistenCatalogs = () => {}
    import('../utils/firestore-sync').then(({ listenProviders, listenCatalogs }) => {
      unsub = listenProviders(setRemote)
      unlistenCatalogs = listenCatalogs(setCatalogs)
    }).catch(() => {})
    return () => { unsub(); unlistenCatalogs() }
  }, [])

  const providers = useMemo(() => {
    const byId = {}
    for (const p of getAllProviderProfiles()) if (p.userId) byId[p.userId] = p
    for (const p of remote) if (p.userId) byId[p.userId] = p // Firestore prioritaire
    // Uniquement les profils réellement renseignés : un doc providers/ créé mais
    // laissé vide (aucune photo, description ni localisation) est un profil
    // fantôme (onboarding abandonné) → on ne l'affiche pas dans l'annuaire.
    const valid = Object.values(byId).filter(p => isProviderVisible(p, user) && p.name && (
      p.photoUrl || p.description || p.city || p.location || p.regionId || p.country || p.zonesIntervention?.length ||
      (catalogs[p.userId] || []).some(item => item.available !== false)
    ))
    // Dedup par nom : si deux docs Firestore portent le même nom, garder le plus complet
    const byName = {}
    for (const p of valid) {
      const key = p.name.trim().toLowerCase()
      const prev = byName[key]
      if (!prev || [p.photoUrl, p.description, p.location, p.coverUrl].filter(Boolean).length >
                   [prev.photoUrl, prev.description, prev.location, prev.coverUrl].filter(Boolean).length) {
        byName[key] = p
      }
    }
    return Object.values(byName)
  }, [remote, catalogs, user])

  const filtered = useMemo(() => {
    const q = normalizeGeoText(query)
    return providers.filter(p => {
      if (!providerMatchesCategory(p, activeCat)) return false
      if (!matchesEntityRegion(p, regionId)) return false
      if (!q) return true
      const regionNames = getEntityRegionIds(p).map(getRegionName)
      const categoryNames = getProviderCategories(p).flatMap(category => [category.label, category.singular])
      return [p.name, p.description, p.specialitesLibre, p.city, p.location, p.country, ...regionNames, ...categoryNames]
        .filter(Boolean).map(normalizeGeoText).join(' ').includes(q)
    })
  }, [providers, query, activeCat, regionId])

  const register = () => navigate('/connexion?mode=register')

  const counts = useMemo(() => {
    const m = {}
    for (const p of providers) {
      for (const type of getProviderTypes(p)) m[type] = (m[type] || 0) + 1
    }
    return m
  }, [providers])

  const page = (
    <div style={{
      color: '#fff', overflowX: 'hidden', minHeight: '100vh',
      background: `radial-gradient(circle 900px at 6% 4%, rgba(139,92,246,.28), transparent 60%), radial-gradient(circle 820px at 96% 30%, rgba(200,169,110,.14), transparent 56%), radial-gradient(circle 950px at 50% 100%, rgba(224,90,170,.15), transparent 60%), ${C.obsidian}`,
      backgroundAttachment: 'fixed',
    }}>
      <style>{`
        .lb-navlink{ display:none }
        @media(min-width:720px){ .lb-navlink{ display:inline-block } }
        .lb-card{ transition:transform .25s cubic-bezier(.22,.9,.3,1), border-color .25s ease, box-shadow .25s ease }
        .lb-card:hover{ transform:translateY(-4px); border-color:rgba(78,232,200,.4); box-shadow:0 26px 60px -24px rgba(0,0,0,.85) }
        .provider-category-shell{position:relative}
        .provider-category-rail{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px}
        .provider-scroll-hint{display:none}
        @media(max-width:719px){
          .provider-category-shell{margin:0 -22px;padding:0 22px}
          .provider-category-shell:after{content:'';position:absolute;z-index:2;pointer-events:none;top:16px;right:0;width:58px;height:44px;background:linear-gradient(90deg,transparent,rgba(25,12,31,.96))}
          .provider-category-rail{margin:16px -22px 0;padding:0 70px 7px 22px;flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:x proximity;scrollbar-width:none}
          .provider-category-rail::-webkit-scrollbar{display:none}
          .provider-category-rail button{flex:0 0 auto;scroll-snap-align:start;white-space:nowrap}
          .provider-scroll-hint{display:flex;align-items:center;justify-content:flex-end;gap:7px;margin:2px 0 0;color:rgba(255,255,255,.46);font:700 8px 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase}
          .provider-scroll-hint svg{width:17px;height:17px;border:1px solid rgba(78,232,200,.28);border-radius:50%;padding:3px;color:#4ee8c8;animation:provider-hint 1.4s ease-in-out infinite}
        }
        @keyframes provider-hint{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
        @media(prefers-reduced-motion:reduce){.provider-scroll-hint svg{animation:none}}
      `}</style>

      {!user && <PublicNav />}

      {/* ══ HERO ══ */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 22px 8px', textAlign: 'center' }}>
        <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: C.gold, margin: 0 }}>L'annuaire</p>
        <h1 style={{ fontFamily: FONT, fontSize: 'clamp(30px,7vw,52px)', fontWeight: 800, letterSpacing: '-1.2px', lineHeight: 1.05, margin: '10px 0 0' }}>
          Les prestataires qui font<br /><span style={{ background: `linear-gradient(90deg,${C.gold},${C.pink},${C.violet})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>vivre la nuit.</span>
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 'clamp(14px,4vw,17px)', color: 'rgba(255,255,255,.6)', margin: '16px auto 0', maxWidth: 540, lineHeight: 1.5 }}>
          DJ, salles, sono, boissons… Trouve le bon prestataire pour ta soirée et contacte-le en un clic.
        </p>

        {/* Recherche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 520, margin: '26px auto 0', padding: '4px 4px 4px 16px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un prestataire, une ville…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontFamily: FONT, fontSize: 14, padding: '10px 0' }} />
        </div>

        {/* Chips catégories */}
        <div className="provider-category-shell">
          <div className="provider-category-rail" aria-label="Catégories de prestataires">
            <button onClick={() => setActiveCat(null)} style={chip(!activeCat, C.teal)}>Tous {providers.length ? `· ${providers.length}` : ''}</button>
            {CATS.map(c => (
              <button key={c.id} onClick={() => setActiveCat(activeCat === c.id ? null : c.id)} style={chip(activeCat === c.id, c.color)}>
                <CatIcon id={c.icon} color={activeCat === c.id ? c.color : 'rgba(255,255,255,.6)'} size={14} /> {c.label}{counts[c.id] ? ` · ${counts[c.id]}` : ''}
              </button>
            ))}
          </div>
          <div className="provider-scroll-hint" aria-hidden="true">Glisse pour voir la suite <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M14 7l5 5-5 5"/></svg></div>
        </div>
        <select value={regionId} onChange={event => setRegionId(event.target.value)} aria-label="Filtrer les prestataires par région" style={{ marginTop: 14, minWidth: 210, padding: '10px 13px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontFamily: FONT, fontSize: 12.5, outline: 'none' }}>
          <option value="">Toutes les régions</option>
          {regions.map(region => <option key={region.id} value={region.id}>{region.flag} {region.name}</option>)}
        </select>
      </section>

      {/* ══ GRILLE ══ */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '26px 22px 60px' }}>
        {filtered.length === 0 ? (
          <div style={{ ...card, padding: 34, textAlign: 'center', maxWidth: 460, margin: '20px auto' }}>
            <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.65)', margin: 0 }}>
              {providers.length === 0 ? 'Les premiers prestataires arrivent très vite.' : 'Aucun prestataire ne correspond à ta recherche.'}
            </p>
            <button onClick={register} style={{ ...btnGold, marginTop: 18 }}>Devenir prestataire</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px,1fr))', gap: 16 }}>
            {filtered.map(p => {
              const categories = getProviderCategories(p)
              const c = categories[0] || catOf(p.prestataireType)
              const visibleOffers = (catalogs[p.userId] || []).filter(item => item.available !== false)
              const offerCount = visibleOffers.length
              const coverImage = p.coverUrl || firstOfferImage(visibleOffers)
              return (
                <div key={p.userId} className="lb-card" style={{ ...card, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {/* Couverture */}
                  <div style={{ position: 'relative', height: 118, background: coverImage ? `url(${coverImage}) center/cover, ${C.obsidian}` : `linear-gradient(135deg, ${c.color}44, ${c.color}12 55%, ${C.obsidian})` }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,8,14,.95), rgba(6,8,14,.25))' }} />
                    <span style={{ position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 10.5, fontWeight: 800, color: '#fff', background: `${c.color}cc`, padding: '4px 9px', borderRadius: 999 }}>
                      <CatIcon id={c.icon} color="#fff" size={12} /> {c.label}{categories.length > 1 ? ` +${categories.length - 1}` : ''}
                    </span>
                    {/* Avatar */}
                    <div style={{ position: 'absolute', left: 14, bottom: -22, width: 52, height: 52, borderRadius: '50%', border: '2px solid #0b0d16', overflow: 'hidden', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 20, color: C.obsidian }}>
                      {p.photoUrl ? <img src={p.photoUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p.name?.[0]?.toUpperCase() || '?')}
                    </div>
                  </div>
                  <div style={{ padding: '30px 15px 15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, letterSpacing: '-.3px', color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                    {(p.city || p.location || p.country) && <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>{[p.city || p.location, p.country].filter(Boolean).join(' · ')}
                    </p>}
                    {p.description && <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.62)', margin: '10px 0 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                    {offerCount > 0 && <p style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,.42)', margin: '12px 0 0' }}>{offerCount} offre{offerCount > 1 ? 's' : ''} au catalogue</p>}
                    <button onClick={() => navigate(`/prestataires/${encodeURIComponent(p.userId)}`)} style={{ ...btnGold, width: '100%', marginTop: 'auto' }}>
                      Voir la page
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {user?.role !== 'prestataire' && (
        <section style={{ padding: '10px 22px 70px' }}>
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '38px 26px', borderRadius: 24, textAlign: 'center', border: '1px solid rgba(200,169,110,.22)', background: `radial-gradient(ellipse at 50% 0%, rgba(200,169,110,.16), transparent 60%), linear-gradient(160deg, rgba(24,20,12,.7), rgba(6,8,15,.7))`, backdropFilter: 'blur(16px)' }}>
            <h2 style={{ fontFamily: FONT, fontSize: 'clamp(24px,6vw,36px)', fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>Tu es prestataire ?</h2>
            <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.6)', margin: '12px auto 0', maxWidth: 460, lineHeight: 1.5 }}>Crée ta vitrine, présente ton catalogue et échange directement avec les organisateurs.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
              <button onClick={register} style={btnGold}>Devenir prestataire</button>
              <button onClick={() => navigate('/accueil')} style={btnGhost}>Retour à l'accueil</button>
            </div>
          </div>
        </section>
      )}
    </div>
  )

  return user ? <Layout>{page}</Layout> : page
}

// ── Styles ──
const card = { background: 'rgba(9,11,20,.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 16 }
const btnGold = { padding: '11px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: C.obsidian, background: `linear-gradient(135deg,${C.gold},#e0c48a)`, border: 'none' }
const btnGhost = { padding: '11px 20px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.18)' }
const chip = (active, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
  fontFamily: FONT, fontSize: 12.5, fontWeight: 700, transition: 'all .2s ease',
  color: active ? color : 'rgba(255,255,255,.7)',
  background: active ? `${color}1f` : 'rgba(255,255,255,.05)',
  border: `1px solid ${active ? `${color}66` : 'rgba(255,255,255,.12)'}`,
})
