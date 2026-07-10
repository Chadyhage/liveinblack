import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PublicNav from '../components/PublicNav'
import { getAllProviderProfiles, getCatalog, isProviderVisible } from '../utils/services'
import { fmtMoney, eventCurrency } from '../utils/money'
import { getProviderCategories, getProviderCategory } from '../utils/providerCategories'
import EventHoverMedia from '../components/EventHoverMedia'
import { play as playDisc, stop as stopDisc, subscribe as subMusic } from '../utils/musicEngine'
import { eventStartMs } from '../utils/event-time'
import { isClientDiscoverableEvent } from '../utils/eventDiscovery'

// ─── Vitrine publique (utilisateur NON connecté) ─────────────────────────────
// Objectif : montrer la valeur de Live in Black et convertir vers la création de
// compte, tout en laissant explorer (événements, prestataires, « c'est quoi »).
// Rendue par HomePage quand !user → l'expérience connectée reste 100% intacte.

const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa', violet: '#8b5cf6' }
const FONT = 'Inter, sans-serif'
const HERO_IMG = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1600&q=80'
const euro = n => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR')}€`

// Révélation au scroll (IntersectionObserver — léger, pas de lib)
function useReveal() {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || shown) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.12 })
    io.observe(el)
    return () => io.disconnect()
  }, [shown])
  return [ref, shown]
}
function Reveal({ children, delay = 0, style }) {
  const [ref, shown] = useReveal()
  return (
    <div ref={ref} style={{ ...style, opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(26px)', transition: `opacity .7s ease ${delay}ms, transform .7s cubic-bezier(.22,.9,.3,1) ${delay}ms` }}>
      {children}
    </div>
  )
}

function loadPublicEvents() {
  try {
    const keys = ['lib_created_events', 'lib_events_cache']
    const seen = new Set(); const out = []
    for (const k of keys) {
      const arr = JSON.parse(localStorage.getItem(k) || '[]')
      for (const e of (Array.isArray(arr) ? arr : [])) {
        if (!e || !e.id || seen.has(String(e.id))) continue
        if (!isClientDiscoverableEvent(e)) continue
        seen.add(String(e.id)); out.push(e)
      }
    }
    // À venir d'abord (date future), puis les autres
    const ts = e => eventStartMs(e)
    return out.sort((a, b) => ts(a) - ts(b)).slice(0, 6)
  } catch { return [] }
}

function firstOfferImage(offers = []) {
  for (const offer of offers) {
    const media = Array.isArray(offer.media)
      ? offer.media
      : offer.mediaUrl ? [{ url: offer.mediaUrl, type: offer.mediaType || 'image' }] : []
    const image = media.find(entry => entry?.url && entry.type !== 'video')
    if (image) return image.url
  }
  return null
}

export default function PublicLanding() {
  const navigate = useNavigate()
  const { openAuthModal } = useAuth()
  const events = useMemo(loadPublicEvents, [])

  // Aperçu prestataires (annuaire cross-device) — mis en avant comme les events.
  // On démarre VIDE : la visibilité (abonnement) vient de Firestore temps réel
  // (listener ci-dessous), jamais du cache local qui peut être périmé — sinon un
  // prestataire non payé pourrait clignoter à l'écran avant correction.
  const [providers, setProviders] = useState([])
  const [catalogs, setCatalogs] = useState(() => {
    const localCatalogs = {}
    for (const provider of getAllProviderProfiles()) {
      if (provider.userId) localCatalogs[provider.userId] = getCatalog(provider.userId)
    }
    return localCatalogs
  })
  useEffect(() => {
    let unsub = () => {}
    let unlistenCatalogs = () => {}
    import('../utils/firestore-sync').then(({ listenProviders, listenCatalogs }) => {
      unsub = listenProviders(remote => {
        const byId = {}
        for (const p of getAllProviderProfiles()) if (p.userId) byId[p.userId] = p
        for (const p of remote) if (p.userId) byId[p.userId] = p
        const valid = Object.values(byId).filter(p => isProviderVisible(p) && p.name && (p.photoUrl || p.description || p.city || p.location || p.regionId))
        const byName = {}
        for (const p of valid) {
          const k = p.name.trim().toLowerCase()
          const prev = byName[k]
          if (!prev || [p.photoUrl, p.description, p.location, p.coverUrl].filter(Boolean).length >
                       [prev.photoUrl, prev.description, prev.location, prev.coverUrl].filter(Boolean).length) byName[k] = p
        }
        setProviders(Object.values(byName).slice(0, 4))
      })
      unlistenCatalogs = listenCatalogs(setCatalogs)
    }).catch(() => {})
    return () => { unsub(); unlistenCatalogs() }
  }, [])

  const register = () => navigate('/connexion?mode=register')
  const login = (reason) => reason ? openAuthModal(reason) : navigate('/connexion')
  const gate = (reason) => openAuthModal(reason)

  return (
    <div style={{
      color: '#fff', overflowX: 'hidden', minHeight: '100vh',
      // Ambiance colorée (violet/teal/pink) fixée au scroll — évite le noir plat,
      // visible dans tout le viewport (haut-gauche, milieu-droite, bas).
      background: `radial-gradient(circle 900px at 6% 4%, rgba(139,92,246,.16), transparent 60%), radial-gradient(circle 820px at 96% 38%, rgba(78,232,200,.08), transparent 56%), radial-gradient(circle 950px at 50% 100%, rgba(224,90,170,.09), transparent 60%), radial-gradient(circle 1100px at 50% 45%, rgba(96,66,150,.07), transparent 70%), ${C.obsidian}`,
      backgroundAttachment: 'fixed',
    }}>
      {/* ══ NAVBAR PUBLIQUE unifiée (vidéo + onglet actif souligné) ══ */}
      <PublicNav />
      <style>{`
        .lb-navlink{ display:none }
        @media(min-width:720px){ .lb-navlink{ display:inline-block } }
        @keyframes lbSpin { to { transform:rotate(360deg) } }
        @keyframes lbEq { 0%,100%{ transform:scaleY(.28) } 50%{ transform:scaleY(1) } }
        .lb-cta-primary{ transition:transform .18s ease }
        .lb-cta-primary:hover{ transform:translateY(-2px) }
        .lb-card{ transition:transform .25s cubic-bezier(.22,.9,.3,1), border-color .25s ease, box-shadow .25s ease }
        .lb-card:hover{ transform:translateY(-4px); border-color:rgba(78,232,200,.4); box-shadow:0 26px 60px -24px rgba(0,0,0,.85) }
      `}</style>

      {/* ══ HERO ══ */}
      <section style={{ position: 'relative', minHeight: '92vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 22px', textAlign: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${HERO_IMG})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.32 }} />
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 30%, rgba(139,92,246,.14), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(78,232,200,.08), transparent 50%), linear-gradient(to bottom, rgba(4,4,11,.72) 0%, rgba(4,4,11,.55) 40%, rgba(4,4,11,.98) 100%)` }} />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <p style={{ fontFamily: FONT, fontSize: 34, fontWeight: 300, letterSpacing: '.14em', margin: 0, color: '#fff' }}>
            L<span style={{ color: '#fff' }}>|</span>VE&nbsp;IN&nbsp;<span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 700, color: '#fff' }}>BLACK</span>
          </p>
          <h1 style={{ fontFamily: FONT, fontSize: 'clamp(34px, 8vw, 62px)', fontWeight: 800, lineHeight: 1.03, letterSpacing: '-1.5px', margin: '22px 0 0', color: '#fff' }}>
            Les meilleures soirées,<br /><span style={{ color: C.teal }}>au bout des doigts.</span>
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 'clamp(15px,4vw,19px)', color: 'rgba(255,255,255,.66)', margin: '18px auto 0', maxWidth: 520, lineHeight: 1.5 }}>
            Réserve, découvre, profite. Ta prochaine sortie commence ici. Billets, événements privés et prestataires réunis au même endroit.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
            <button className="lb-cta-primary" onClick={register} style={btnPrimary}>Créer mon compte</button>
            <button onClick={() => navigate('/evenements')} style={btnGhost}>Découvrir les événements</button>
          </div>
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.5)', marginTop: 18 }}>
            Déjà un compte ?{' '}
            <button onClick={() => navigate('/connexion')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.85)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Se connecter</button>
          </p>
          <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.35)', marginTop: 14 }}>
            Gratuit · Ton billet QR dans ta poche · Aucune app à installer
          </p>
          <Ambiance />
        </div>
        <div aria-hidden="true" style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,.35)' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></div>
      </section>

      {/* ══ ÉVÉNEMENTS À DÉCOUVRIR ══ */}
      <Section eyebrow="À l'affiche" title="Des soirées à découvrir" sub="Explore librement. Pour réserver et garder ton billet, il te suffit d'un compte.">
        {events.length === 0 ? (
          <div style={{ ...card, padding: 30, textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
            <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.65)', margin: 0 }}>De nouvelles soirées arrivent très vite.</p>
            <button onClick={() => navigate('/evenements')} style={{ ...btnGhost, marginTop: 16 }}>Voir la page événements</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {events.map((e, i) => {
                const prices = (e.places || []).map(p => Number(p.price) || 0).filter(Boolean)
                const min = prices.length ? Math.min(...prices) : null
                return (
                  <Reveal key={e.id} delay={i * 60}>
                    <div className="lb-card" style={{ ...card, overflow: 'hidden', cursor: 'pointer', height: '100%' }} onClick={() => navigate(`/evenements/${e.id}`)}>
                      <div style={{ position: 'relative', aspectRatio: '4/3' }}>
                        <EventHoverMedia
                          event={e}
                          aspectRatio="4 / 3"
                          zoom
                          fallbackBackground={`linear-gradient(135deg, ${C.violet}44, ${C.obsidian})`}
                          overlay="linear-gradient(to top, rgba(8,9,14,.9), transparent 55%)"
                        />
                        {min != null && <span style={{ position: 'absolute', top: 10, right: 10, fontFamily: FONT, fontSize: 11, fontWeight: 800, color: C.gold, background: 'rgba(5,6,10,.92)', padding: '4px 9px', borderRadius: 999, border: '1px solid rgba(200,169,110,.4)' }}>dès {fmtMoney(min, eventCurrency(e))}</span>}
                      </div>
                      <div style={{ padding: '12px 14px 14px' }}>
                        <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 800, letterSpacing: '-.3px', color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</p>
                        <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '4px 0 0' }}>{[e.dateDisplay, e.city].filter(Boolean).join(' · ') || 'Bientôt'}</p>
                        <button onClick={ev => { ev.stopPropagation(); gate(`Crée ton compte pour réserver « ${e.name} »`) }}
                          style={{ marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 10, cursor: 'pointer', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: '#04120e', background: '#3ed6b5', border: 'none' }}>
                          Réserver
                        </button>
                      </div>
                    </div>
                  </Reveal>
                )
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <button onClick={() => navigate('/evenements')} style={btnGhost}>Tout voir</button>
            </div>
          </>
        )}
      </Section>

      {/* ══ PRESTATAIRES À LA UNE ══ */}
      <Section eyebrow="L'annuaire" title="Les prestataires de la nuit" sub="DJ, salles, sono, boissons… Trouve le bon prestataire et contacte-le en un clic.">
        {providers.length === 0 ? (
          <div style={{ ...card, padding: 30, textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
            <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.65)', margin: 0 }}>Les premiers prestataires arrivent très vite.</p>
            <button onClick={() => navigate('/prestataires')} style={{ ...btnGhost, marginTop: 16 }}>Voir l'annuaire</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
              {providers.map((p, i) => {
                const providerCategories = getProviderCategories(p)
                const pc = providerCategories[0] || getProviderCategory(p.prestataireType)
                const visibleOffers = (catalogs[p.userId] || []).filter(item => item.available !== false)
                const coverImage = p.coverUrl || firstOfferImage(visibleOffers) || p.photoUrl
                return (
                  <Reveal key={p.userId} delay={i * 60}>
                    <div className="lb-card" style={{ ...card, overflow: 'hidden', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }} onClick={() => navigate(`/prestataires/${encodeURIComponent(p.userId)}`)}>
                      <div style={{ position: 'relative', height: 110, background: `linear-gradient(135deg, ${pc.color}44, ${pc.color}12 55%, ${C.obsidian})`, overflow: 'hidden' }}>
                        {coverImage && <img src={coverImage} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,9,14,.92), transparent 60%)' }} />
                        <span style={{ position: 'absolute', top: 10, left: 10, fontFamily: FONT, fontSize: 10.5, fontWeight: 800, color: '#fff', background: `${pc.color}cc`, padding: '4px 9px', borderRadius: 999 }}>{pc.label}{providerCategories.length > 1 ? ` +${providerCategories.length - 1}` : ''}</span>
                        <div style={{ position: 'absolute', left: 12, bottom: -20, width: 46, height: 46, borderRadius: '50%', border: '2px solid #0b0d16', overflow: 'hidden', background: pc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 18, color: C.obsidian }}>
                          {p.photoUrl ? <img src={p.photoUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p.name?.[0]?.toUpperCase() || '?')}
                        </div>
                      </div>
                      <div style={{ padding: '26px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 800, letterSpacing: '-.3px', color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                        {(p.city || p.location || p.country) && <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '3px 0 0' }}>{[p.city || p.location, p.country].filter(Boolean).join(' · ')}</p>}
                        <span style={{ marginTop: 'auto', paddingTop: 12, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: C.teal }}>Voir le profil →</span>
                      </div>
                    </div>
                  </Reveal>
                )
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <button onClick={() => navigate('/prestataires')} style={btnGhost}>Tous les prestataires</button>
            </div>
          </>
        )}
      </Section>

      {/* ══ POURQUOI CRÉER UN COMPTE ══ */}
      <Section eyebrow="Ton compte" title="Pourquoi créer un compte ?" sub="Gratuit, en 30 secondes. Et tu débloques tout ça :">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 14 }}>
          {[
            ['Réserve tes billets', 'Paiement sécurisé, billet instantané.', '/avantages/01_reserve_tes_billets.png'],
            ['Ton QR code partout', 'Tes billets toujours dans ta poche.', '/avantages/02_ton_qr_code_partout.png'],
            ['Recommandations', 'Des soirées selon tes goûts et ta ville.', '/avantages/03_recommandations.png'],
            ['Favoris', 'Sauvegarde les événements qui te plaisent.', '/avantages/04_favoris.png'],
            ['Messagerie', 'Parle aux organisateurs et prestataires.', '/avantages/05_messagerie.png'],
            ['Tes commandes', 'Précommandes et consos suivies.', '/avantages/06_tes_commandes.png'],
            ['Des points', 'Chaque achat te rapproche d\'avantages.', '/avantages/07_des_points.png'],
            ['Événements privés', 'Accède aux soirées sur invitation.', '/avantages/08_evenements_prives.png'],
          ].map(([t, d, img], i) => (
            <Reveal key={t} delay={i * 40}>
              <div className="lb-card" style={{ ...card, position: 'relative', overflow: 'hidden', minHeight: 158, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '14px 15px' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.55 }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,8,14,.97), rgba(6,8,14,.55) 52%, rgba(6,8,14,.28))' }} />
                <div style={{ position: 'relative' }}>
                  <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>{t}</p>
                  <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.72)', margin: '4px 0 0', lineHeight: 1.4 }}>{d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <button className="lb-cta-primary" onClick={register} style={btnPrimary}>Créer mon compte gratuitement</button>
        </div>
      </Section>

      {/* ══ COMMENT ÇA MARCHE (client) ══ */}
      <Section eyebrow="Simple" title="Comment ça marche">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
          {[
            ['1', 'Découvre une soirée', 'Parcours les événements près de chez toi.'],
            ['2', 'Réserve ton billet', 'En quelques secondes, paiement sécurisé.'],
            ['3', 'Présente ton QR', 'Scan à l\'entrée, et c\'est parti.'],
          ].map(([n, t, d], i) => (
            <Reveal key={n} delay={i * 80}>
              <div style={{ ...card, padding: '20px 18px', height: '100%', position: 'relative' }}>
                <span style={{ position: 'absolute', top: 14, right: 16, fontFamily: FONT, fontSize: 40, fontWeight: 800, color: 'rgba(78,232,200,.14)' }}>{n}</span>
                <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: C.teal, margin: 0 }}>{t}</p>
                <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.55)', margin: '8px 0 0', lineHeight: 1.5 }}>{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ══ ORGANISATEURS + PRESTATAIRES ══ */}
      <Section eyebrow="Tu fais vivre la nuit ?" title="Organisateurs & prestataires">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 16 }}>
          <Reveal>
            <div className="lb-card" style={{ ...card, padding: 24, height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '3px solid rgba(139,92,246,.75)' }}>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.violet, margin: 0 }}>Organisateur</p>
              <h3 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: '#fff', margin: '10px 0 12px', letterSpacing: '-.5px' }}>Crée, vends, gère tes soirées</h3>
              <ul style={{ ...featList, flex: 1 }}>
                {['Crée et publie ton événement', 'Vends tes billets en ligne', 'Gère les invités & la guestlist', 'Scanne les QR à l\'entrée', 'Précommandes & POS sur place', 'Booste ta visibilité', 'Statistiques en temps réel'].map(f => <li key={f} style={featItem}><span style={{ color: C.violet }}>◆</span> {f}</li>)}
              </ul>
              <button onClick={() => navigate('/connexion?mode=register')} style={{ ...btnSolid(C.violet), marginTop: 16, width: '100%' }}>Créer un espace organisateur</button>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="lb-card" style={{ ...card, padding: 24, height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '3px solid rgba(200,169,110,.75)' }}>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.gold, margin: 0 }}>Prestataire</p>
              <h3 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: '#fff', margin: '10px 0 12px', letterSpacing: '-.5px' }}>Développe ton activité</h3>
              <ul style={{ ...featList, flex: 1 }}>
                {['Crée un profil public (vitrine)', 'Présente tes services & ton portfolio', 'Sois visible des organisateurs & clients', 'Reçois des demandes et devis', 'DJ, photo, vidéo, déco, sécurité…', 'Gère tes commandes'].map(f => <li key={f} style={featItem}><span style={{ color: C.gold }}>◆</span> {f}</li>)}
              </ul>
              <button onClick={() => navigate('/connexion?mode=register')} style={{ ...btnSolid(C.gold), marginTop: 16, width: '100%' }}>Devenir prestataire</button>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ══ POINTS / PRIVÉ / RECO ══ */}
      <Section eyebrow="Encore plus" title="Ce que ton compte débloque">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 14 }}>
          {[
            { t: 'Des points à chaque sortie', d: 'Cumule un point par billet scanné à l\'entrée — bientôt échangeables contre réductions, accès prioritaire et offres exclusives.', img: '/avantages/07_des_points.png' },
            { t: 'Recommandations perso', d: 'Des soirées selon ta ville, tes styles musicaux préférés et ce que tu as déjà réservé.', img: '/avantages/03_recommandations.png' },
            { t: 'Événements privés', d: 'Certaines soirées sont sur invitation. Un code te donne accès.', img: '/avantages/08_evenements_prives.png', cta: true },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 70}>
              <div className="lb-card" style={{ ...card, position: 'relative', overflow: 'hidden', minHeight: 200, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 20 }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${c.img})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5 }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,8,14,.98), rgba(6,8,14,.6) 55%, rgba(6,8,14,.3))' }} />
                <div style={{ position: 'relative' }}>
                  <p style={{ fontFamily: FONT, fontSize: 17, fontWeight: 800, color: '#fff', margin: 0, textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>{c.t}</p>
                  <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.72)', margin: '7px 0 0', lineHeight: 1.5 }}>{c.d}</p>
                  {c.cta && <button onClick={() => navigate('/evenements')} style={{ ...btnGhost, padding: '9px 16px', fontSize: 12.5, marginTop: 12 }}>J'ai un code</button>}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ══ CTA FINAL ══ */}
      <section style={{ padding: '10px 22px 70px' }}>
        <Reveal>
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 26px', borderRadius: 24, textAlign: 'center', position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,.1)', background: `radial-gradient(ellipse at 50% 0%, rgba(139,92,246,.14), transparent 60%), #12131c`, boxShadow: '0 24px 64px rgba(0,0,0,.55)' }}>
            <h2 style={{ fontFamily: FONT, fontSize: 'clamp(26px,6vw,40px)', fontWeight: 800, letterSpacing: '-1px', margin: 0, color: '#fff' }}>Rejoins Live in Black</h2>
            <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.6)', margin: '12px auto 0', maxWidth: 440, lineHeight: 1.5 }}>Découvre les meilleures soirées autour de toi, et ne rate plus jamais une sortie.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
              <button className="lb-cta-primary" onClick={register} style={btnPrimary}>Créer mon compte</button>
              <button onClick={() => navigate('/evenements')} style={btnGhost}>Découvrir les événements</button>
            </div>
            <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
              <button onClick={() => navigate('/connexion?mode=register')} style={linkBtn(C.violet)}>Devenir organisateur →</button>
              <button onClick={() => navigate('/connexion?mode=register')} style={linkBtn(C.gold)}>Devenir prestataire →</button>
            </div>
            <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.4)', marginTop: 24 }}>
              Déjà un compte ? <button onClick={() => login()} style={{ background: 'none', border: 'none', color: C.teal, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Me connecter</button>
            </p>
          </div>
        </Reveal>
      </section>
    </div>
  )
}

// ── Section wrapper ──
function Section({ eyebrow, title, sub, children }) {
  return (
    <section style={{ padding: '54px 22px', maxWidth: 1120, margin: '0 auto' }}>
      <Reveal>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          {eyebrow && <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.teal, margin: 0 }}>{eyebrow}</p>}
          <h2 style={{ fontFamily: FONT, fontSize: 'clamp(24px,5.5vw,36px)', fontWeight: 800, letterSpacing: '-.8px', color: '#fff', margin: '8px 0 0' }}>{title}</h2>
          {sub && <p style={{ fontFamily: FONT, fontSize: 14.5, color: 'rgba(255,255,255,.5)', margin: '10px auto 0', maxWidth: 520, lineHeight: 1.5 }}>{sub}</p>}
        </div>
      </Reveal>
      {children}
    </section>
  )
}

// ── Ambiance sonore : joue le 1er disque (House) + « ouvre » le vinyle + égaliseur ──
function Ambiance() {
  const [on, setOn] = useState(false)
  useEffect(() => subMusic(st => setOn(!!st.playing)), [])
  const toggle = () => { on ? stopDisc() : playDisc('house') }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 24 }}>
      <div style={{ height: on ? 116 : 0, opacity: on ? 1 : 0, transform: on ? 'scale(1) translateY(0)' : 'scale(.45) translateY(18px)', transition: 'all .55s cubic-bezier(.22,.9,.3,1)', pointerEvents: 'none' }}>
        <Vinyl playing={on} />
      </div>
      <button onClick={toggle} className={on ? '' : 'lb-cta-primary'} style={{
        display: 'inline-flex', alignItems: 'center', gap: 10, padding: '11px 22px', borderRadius: 999, cursor: 'pointer',
        fontFamily: FONT, fontSize: 14, fontWeight: 700, transition: 'all .25s ease',
        color: on ? C.pink : '#fff', background: on ? 'rgba(224,90,170,.12)' : 'rgba(255,255,255,.08)',
        border: `1px solid ${on ? 'rgba(224,90,170,.5)' : 'rgba(255,255,255,.22)'}`,
      }}>
        {on ? <><Equalizer /> Ambiance en cours</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg> Mettre l'ambiance</>}
      </button>
    </div>
  )
}
function Equalizer() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2.5, height: 15 }}>
      {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ width: 3, height: '100%', borderRadius: 2, background: 'currentColor', transformOrigin: 'bottom', animation: `lbEq ${0.7 + i * 0.11}s ease-in-out ${i * 0.08}s infinite` }} />)}
    </span>
  )
}
function Vinyl({ playing, size = 116 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ animation: playing ? 'lbSpin 3.4s linear infinite' : 'none', filter: 'drop-shadow(0 12px 30px rgba(0,0,0,.5))' }}>
      <defs><radialGradient id="lbVinylLabel" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#e05aaa" /><stop offset="100%" stopColor="#8b5cf6" /></radialGradient></defs>
      <circle cx="50" cy="50" r="48" fill="#08080f" stroke="rgba(255,255,255,.14)" strokeWidth="0.8" />
      {[42, 36, 30, 24].map(r => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="0.6" />)}
      <path d="M50 6 A44 44 0 0 1 94 50" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="50" cy="50" r="15" fill="url(#lbVinylLabel)" />
      <circle cx="50" cy="50" r="2.4" fill="#04040b" />
    </svg>
  )
}

// ── Titre « disco » : chaque lettre change de couleur (aléatoire) + danse au survol ──
const DISCO = ['#4ee8c8', '#e05aaa', '#8b5cf6', '#c8a96e', '#7af0d8', '#ff6bd0']
function DiscoTitle({ text, style }) {
  return (
    <span style={style}>
      {String(text).split('').map((ch, i) => (
        <span key={i} className="lb-letter"
          onMouseEnter={e => { e.currentTarget.style.color = DISCO[Math.floor(Math.random() * DISCO.length)] }}
          onMouseLeave={e => { e.currentTarget.style.color = '' }}
        >{ch === ' ' ? ' ' : ch}</span>
      ))}
    </span>
  )
}

// ── Styles ──
const accentSq = (c) => ({ display: 'block', width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${c}40, ${c}0d)`, border: `1px solid ${c}66` })
const card = { background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }
const btnPrimary = { padding: '14px 26px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 15, fontWeight: 700, color: '#04120e', background: '#3ed6b5', border: 'none', boxShadow: '0 6px 20px rgba(62,214,181,.25)' }
const btnGhost = { padding: '13px 24px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)' }
const btnSolid = (c) => ({ padding: '13px 20px', borderRadius: 12, cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 700, color: c === C.violet ? '#fff' : '#04120e', background: c === C.violet ? 'linear-gradient(180deg, #8f56ff, #7a3bf2)' : c, border: '1px solid rgba(255,255,255,.14)', boxShadow: c === C.violet ? '0 6px 20px rgba(122,59,242,.35)' : 'none' })
const linkBtn = (c) => ({ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: c })
const featList = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }
const featItem = { fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.72)', display: 'flex', gap: 9, alignItems: 'baseline' }
