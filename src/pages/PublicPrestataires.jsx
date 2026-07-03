import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AnimatedLogo from '../components/AnimatedLogo'
import { getAllProviderProfiles } from '../utils/services'

// ─── Page publique PRESTATAIRES ──────────────────────────────────────────────
// Annuaire ouvert aux visiteurs non connectés : ils explorent librement les
// prestataires (DJ, salles, matériel, fournisseurs). « Demander un devis » ou
// « Contacter » ouvre le gate de connexion (ou la messagerie si déjà connecté).
// Style aligné sur la vitrine (PublicLanding).

const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa', violet: '#8b5cf6' }
const FONT = 'Inter, sans-serif'

// Catégories de prestataires (miroir de ProposerServicesPage, version publique)
const CATS = [
  { id: 'prestation', label: 'Artistes & DJ', color: '#ff6b1a', icon: 'mic', img: '/img_techno.avif' },
  { id: 'salle', label: 'Salles & lieux', color: '#7b2fff', icon: 'building', img: '/img_nuit.jpg' },
  { id: 'materiel', label: 'Matériel & sono', color: '#00c9a7', icon: 'speaker', img: '/media3.jpg' },
  { id: 'supermarche', label: 'Boissons & conso', color: '#c8a96e', icon: 'cart', img: '/media1.jpg' },
]
const catOf = id => CATS.find(c => c.id === id)

function CatIcon({ id, color = '#fff', size = 18 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (id === 'mic') return <svg {...p}><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M19 10a7 7 0 0 1-14 0" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
  if (id === 'building') return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1" /></svg>
  if (id === 'speaker') return <svg {...p}><rect x="5" y="2" width="14" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><circle cx="12" cy="6" r="1" /></svg>
  if (id === 'cart') return <svg {...p}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
  return null
}

export default function PublicPrestataires() {
  const navigate = useNavigate()
  const { user, openAuthModal } = useAuth()

  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState(null)
  const [remote, setRemote] = useState([])

  // Annuaire cross-device : collection partagée providers/ (Firestore) + local.
  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenProviders }) => {
      unsub = listenProviders(setRemote)
    }).catch(() => {})
    return () => unsub()
  }, [])

  const providers = useMemo(() => {
    const byId = {}
    for (const p of getAllProviderProfiles()) if (p.userId) byId[p.userId] = p
    for (const p of remote) if (p.userId) byId[p.userId] = p // Firestore prioritaire
    return Object.values(byId).filter(p => p.name) // profils complétés uniquement
  }, [remote])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return providers.filter(p => {
      if (activeCat && p.prestataireType !== activeCat) return false
      if (!q) return true
      return [p.name, p.description, p.location].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [providers, query, activeCat])

  const register = () => navigate('/connexion?mode=register')
  const login = () => navigate('/connexion')
  // Contact : connecté → messagerie ; sinon → gate de connexion
  const contact = (p) => {
    if (user) { navigate('/messagerie'); return }
    openAuthModal(`Crée ton compte pour contacter « ${p.name} » et demander un devis.`)
  }

  const counts = useMemo(() => {
    const m = {}
    for (const p of providers) m[p.prestataireType] = (m[p.prestataireType] || 0) + 1
    return m
  }, [providers])

  return (
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
      `}</style>

      {/* ══ NAVBAR ══ */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(4,4,11,.72)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '9px 18px' }}>
          <AnimatedLogo size={26} textScale={0.44} onClick={() => navigate('/accueil')} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => navigate('/accueil')} className="lb-navlink" style={navLink}>Accueil</button>
            <button onClick={() => navigate('/evenements')} className="lb-navlink" style={navLink}>Événements</button>
            {user ? (
              <button onClick={() => navigate('/proposer')} style={{ ...navLink, color: C.teal }}>Mon espace</button>
            ) : (
              <>
                <button onClick={login} style={navLink}>Connexion</button>
                <button onClick={register} style={{ padding: '8px 15px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.obsidian, background: `linear-gradient(135deg,${C.teal},#7af0d8)`, border: 'none', whiteSpace: 'nowrap' }}>Créer un compte</button>
              </>
            )}
          </div>
        </div>
      </nav>

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 }}>
          <button onClick={() => setActiveCat(null)} style={chip(!activeCat, C.teal)}>Tous {providers.length ? `· ${providers.length}` : ''}</button>
          {CATS.map(c => (
            <button key={c.id} onClick={() => setActiveCat(activeCat === c.id ? null : c.id)} style={chip(activeCat === c.id, c.color)}>
              <CatIcon id={c.icon} color={activeCat === c.id ? c.color : 'rgba(255,255,255,.6)'} size={14} /> {c.label}{counts[c.id] ? ` · ${counts[c.id]}` : ''}
            </button>
          ))}
        </div>
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
              const c = catOf(p.prestataireType) || { color: C.gold, label: 'Prestataire', img: '/media2.jpg', icon: 'mic' }
              return (
                <div key={p.userId} className="lb-card" style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {/* Couverture */}
                  <div style={{ position: 'relative', height: 118, background: `url(${p.coverUrl || c.img}) center/cover, ${C.obsidian}` }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,8,14,.95), rgba(6,8,14,.25))' }} />
                    <span style={{ position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 10.5, fontWeight: 800, color: '#fff', background: `${c.color}cc`, padding: '4px 9px', borderRadius: 999 }}>
                      <CatIcon id={c.icon} color="#fff" size={12} /> {c.label}
                    </span>
                    {p.verified && (
                      <span style={{ position: 'absolute', top: 10, right: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 10, fontWeight: 800, color: C.teal, background: 'rgba(5,6,10,.7)', padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(78,232,200,.4)' }}>✓ Vérifié</span>
                    )}
                    {/* Avatar */}
                    <div style={{ position: 'absolute', left: 14, bottom: -22, width: 52, height: 52, borderRadius: '50%', border: '2px solid #0b0d16', overflow: 'hidden', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 20, color: C.obsidian }}>
                      {p.photoUrl ? <img src={p.photoUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p.name?.[0]?.toUpperCase() || '?')}
                    </div>
                  </div>
                  <div style={{ padding: '30px 15px 15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, letterSpacing: '-.3px', color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                    {p.location && <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>{p.location}
                    </p>}
                    {p.description && <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.62)', margin: '10px 0 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                    <button onClick={() => contact(p)} style={{ ...btnGold, width: '100%', marginTop: 16 }}>
                      {user ? 'Contacter' : 'Demander un devis'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ══ CTA prestataire ══ */}
      <section style={{ padding: '10px 22px 70px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '38px 26px', borderRadius: 24, textAlign: 'center', border: '1px solid rgba(200,169,110,.22)', background: `radial-gradient(ellipse at 50% 0%, rgba(200,169,110,.16), transparent 60%), linear-gradient(160deg, rgba(24,20,12,.7), rgba(6,8,15,.7))`, backdropFilter: 'blur(16px)' }}>
          <h2 style={{ fontFamily: FONT, fontSize: 'clamp(24px,6vw,36px)', fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>Tu es prestataire ?</h2>
          <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.6)', margin: '12px auto 0', maxWidth: 460, lineHeight: 1.5 }}>Crée ta vitrine, sois visible des organisateurs et reçois des demandes de devis.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
            <button onClick={register} style={btnGold}>Devenir prestataire</button>
            <button onClick={() => navigate('/accueil')} style={btnGhost}>Retour à l'accueil</button>
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Styles ──
const navLink = { background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)', padding: '8px 10px', whiteSpace: 'nowrap' }
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
