import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
        if (e.cancelled === true || e.visibility === 'private' || e.isPrivate) continue
        seen.add(String(e.id)); out.push(e)
      }
    }
    // À venir d'abord (date future), puis les autres
    const ts = e => { const d = new Date(e.date || e.dateISO || 0).getTime(); return Number.isFinite(d) ? d : 0 }
    return out.sort((a, b) => ts(a) - ts(b)).slice(0, 6)
  } catch { return [] }
}

export default function PublicLanding() {
  const navigate = useNavigate()
  const { openAuthModal } = useAuth()
  const events = useMemo(loadPublicEvents, [])

  const register = () => navigate('/connexion?mode=register')
  const login = (reason) => reason ? openAuthModal(reason) : navigate('/connexion')
  const gate = (reason) => openAuthModal(reason)

  return (
    <div style={{
      color: '#fff', overflowX: 'hidden', minHeight: '100vh',
      // Ambiance colorée (violet/teal/pink) fixée au scroll — évite le noir plat,
      // visible dans tout le viewport (haut-gauche, milieu-droite, bas).
      background: `radial-gradient(circle 900px at 6% 4%, rgba(139,92,246,.30), transparent 60%), radial-gradient(circle 820px at 96% 38%, rgba(78,232,200,.15), transparent 56%), radial-gradient(circle 950px at 50% 100%, rgba(224,90,170,.17), transparent 60%), radial-gradient(circle 1100px at 50% 45%, rgba(96,66,150,.13), transparent 70%), ${C.obsidian}`,
      backgroundAttachment: 'fixed',
    }}>
      {/* ══ NAVBAR PUBLIQUE ══ */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 18px', background: 'rgba(4,4,11,.72)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 17, fontWeight: 300, letterSpacing: '.1em', color: '#fff', padding: 0 }}>
          L<span style={{ color: C.pink }}>|</span>VE IN <span style={{ fontStyle: 'italic', fontWeight: 700 }}>BLACK</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[['Événements', () => navigate('/evenements')], ['J\'ai un code', () => navigate('/evenements')]].map(([l, fn]) => (
            <button key={l} onClick={fn} className="lb-navlink" style={navLink}>{l}</button>
          ))}
          <button onClick={() => login()} style={navLink}>Connexion</button>
          <button onClick={register} style={{ padding: '8px 15px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.obsidian, background: `linear-gradient(135deg,${C.teal},#7af0d8)`, border: 'none', whiteSpace: 'nowrap' }}>Créer un compte</button>
        </div>
      </nav>
      <style>{`
        .lb-navlink{ display:none }
        @media(min-width:720px){ .lb-navlink{ display:inline-block } }
        @keyframes lbFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes lbGlow { 0%,100%{box-shadow:0 0 0 0 rgba(78,232,200,.0),0 14px 40px -12px rgba(78,232,200,.5)} 50%{box-shadow:0 0 24px -2px rgba(78,232,200,.35),0 14px 40px -12px rgba(78,232,200,.7)} }
        @keyframes lbGrad { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        .lb-cta-primary{ animation:lbGlow 3.4s ease-in-out infinite; transition:transform .18s ease }
        .lb-cta-primary:hover{ transform:translateY(-2px) }
        .lb-card{ transition:transform .25s cubic-bezier(.22,.9,.3,1), border-color .25s ease, box-shadow .25s ease }
        .lb-card:hover{ transform:translateY(-4px); border-color:rgba(78,232,200,.4); box-shadow:0 26px 60px -24px rgba(0,0,0,.85) }
      `}</style>

      {/* ══ HERO ══ */}
      <section style={{ position: 'relative', minHeight: '92vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 22px', textAlign: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${HERO_IMG})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.32 }} />
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 30%, rgba(139,92,246,.22), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(78,232,200,.14), transparent 50%), linear-gradient(to bottom, rgba(4,4,11,.72) 0%, rgba(4,4,11,.55) 40%, rgba(4,4,11,.98) 100%)` }} />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <p style={{ fontFamily: FONT, fontSize: 34, fontWeight: 300, letterSpacing: '.14em', margin: 0, color: '#fff' }}>
            L<span style={{ color: C.pink }}>|</span>VE&nbsp;IN&nbsp;<span style={{ fontStyle: 'italic', fontWeight: 700, background: `linear-gradient(90deg,${C.pink},${C.violet})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>BLACK</span>
          </p>
          <h1 style={{ fontFamily: FONT, fontSize: 'clamp(34px, 8vw, 62px)', fontWeight: 800, lineHeight: 1.03, letterSpacing: '-1.5px', margin: '22px 0 0', color: '#fff' }}>
            Les meilleures soirées,<br /><span style={{ background: `linear-gradient(90deg,${C.teal},${C.violet},${C.pink})`, backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'lbGrad 6s linear infinite alternate' }}>au bout des doigts.</span>
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 'clamp(15px,4vw,19px)', color: 'rgba(255,255,255,.66)', margin: '18px auto 0', maxWidth: 520, lineHeight: 1.5 }}>
            Réserve, découvre, profite. Ta prochaine sortie commence ici — billets, événements privés et prestataires réunis au même endroit.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
            <button className="lb-cta-primary" onClick={register} style={btnPrimary}>Créer mon compte</button>
            <button onClick={() => navigate('/evenements')} style={btnGhost}>Découvrir les événements</button>
          </div>
          <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.35)', marginTop: 16 }}>
            Gratuit · Ton billet QR dans ta poche · Aucune app à installer
          </p>
        </div>
        <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,.3)', fontSize: 22, animation: 'lbFloat 2.4s ease-in-out infinite' }}>↓</div>
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
                      <div style={{ position: 'relative', aspectRatio: '4/3', background: e.imageUrl ? `url(${e.imageUrl}) center/cover` : `linear-gradient(135deg, ${C.violet}44, ${C.obsidian})` }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,9,14,.9), transparent 55%)' }} />
                        {min != null && <span style={{ position: 'absolute', top: 10, right: 10, fontFamily: FONT, fontSize: 11, fontWeight: 800, color: C.gold, background: 'rgba(5,6,10,.7)', backdropFilter: 'blur(8px)', padding: '4px 9px', borderRadius: 999, border: '1px solid rgba(200,169,110,.4)' }}>dès {min}€</span>}
                      </div>
                      <div style={{ padding: '12px 14px 14px' }}>
                        <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 800, letterSpacing: '-.3px', color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</p>
                        <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '4px 0 0' }}>{[e.dateDisplay, e.city].filter(Boolean).join(' · ') || 'Bientôt'}</p>
                        <button onClick={ev => { ev.stopPropagation(); gate(`Crée ton compte pour réserver « ${e.name} »`) }}
                          style={{ marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: C.obsidian, background: `linear-gradient(135deg,${C.teal},#7af0d8)`, border: 'none' }}>
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

      {/* ══ POURQUOI CRÉER UN COMPTE ══ */}
      <Section eyebrow="Ton compte" title="Pourquoi créer un compte ?" sub="Gratuit, en 30 secondes. Et tu débloques tout ça :">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 14 }}>
          {[
            ['Réserve tes billets', 'Paiement sécurisé, billet instantané.'],
            ['Ton QR code partout', 'Tes billets toujours dans ta poche.'],
            ['Recommandations', 'Des soirées selon tes goûts et ta ville.'],
            ['Favoris', 'Sauvegarde les événements qui te plaisent.'],
            ['Messagerie', 'Parle aux organisateurs et prestataires.'],
            ['Tes commandes', 'Précommandes et consos suivies.'],
            ['Des points', 'Chaque achat te rapproche d\'avantages.'],
            ['Événements privés', 'Accède aux soirées sur invitation.'],
          ].map(([t, d], i) => {
            const col = [C.teal, C.violet, C.gold, C.pink][i % 4]
            return (
              <Reveal key={t} delay={i * 40}>
                <div className="lb-card" style={{ ...card, padding: '16px 15px', height: '100%' }}>
                  <span style={{ display: 'block', width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${col}40, ${col}0d)`, border: `1px solid ${col}66` }} />
                  <p style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 700, color: '#fff', margin: '11px 0 0' }}>{t}</p>
                  <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.5)', margin: '4px 0 0', lineHeight: 1.45 }}>{d}</p>
                </div>
              </Reveal>
            )
          })}
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
            <div className="lb-card" style={{ ...card, padding: 24, height: '100%', display: 'flex', flexDirection: 'column', borderColor: 'rgba(139,92,246,.28)', background: `linear-gradient(160deg, rgba(139,92,246,.1), rgba(9,11,20,.6))` }}>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.violet, margin: 0 }}>Organisateur</p>
              <h3 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: '#fff', margin: '10px 0 12px', letterSpacing: '-.5px' }}>Crée, vends, gère tes soirées</h3>
              <ul style={{ ...featList, flex: 1 }}>
                {['Crée et publie ton événement', 'Vends tes billets en ligne', 'Gère les invités & la guestlist', 'Scanne les QR à l\'entrée', 'Précommandes & POS sur place', 'Booste ta visibilité', 'Statistiques en temps réel'].map(f => <li key={f} style={featItem}><span style={{ color: C.violet }}>◆</span> {f}</li>)}
              </ul>
              <button onClick={() => navigate('/connexion?mode=register')} style={{ ...btnSolid(C.violet), marginTop: 16, width: '100%' }}>Créer un espace organisateur</button>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="lb-card" style={{ ...card, padding: 24, height: '100%', display: 'flex', flexDirection: 'column', borderColor: 'rgba(200,169,110,.28)', background: `linear-gradient(160deg, rgba(200,169,110,.1), rgba(9,11,20,.6))` }}>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.gold, margin: 0 }}>Prestataire</p>
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
          <Reveal>
            <div style={{ ...card, padding: 22, height: '100%' }}>
              <span style={accentSq(C.gold)} />
              <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: '#fff', margin: '12px 0 0' }}>Des points à chaque achat</p>
              <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.55)', margin: '6px 0 0', lineHeight: 1.5 }}>Cumule des points sur tes billets — bientôt échangeables contre réductions, accès prioritaire et offres exclusives.</p>
            </div>
          </Reveal>
          <Reveal delay={70}>
            <div style={{ ...card, padding: 22, height: '100%' }}>
              <span style={accentSq(C.violet)} />
              <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: '#fff', margin: '12px 0 0' }}>Recommandations perso</p>
              <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.55)', margin: '6px 0 0', lineHeight: 1.5 }}>Des soirées selon ta ville, tes styles musicaux préférés et ce que tu as déjà réservé.</p>
            </div>
          </Reveal>
          <Reveal delay={140}>
            <div style={{ ...card, padding: 22, height: '100%', borderColor: 'rgba(78,232,200,.28)' }}>
              <span style={accentSq(C.teal)} />
              <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: '#fff', margin: '12px 0 0' }}>Événements privés</p>
              <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.55)', margin: '6px 0 10px', lineHeight: 1.5 }}>Certaines soirées sont sur invitation. Un code te donne accès.</p>
              <button onClick={() => navigate('/evenements')} style={{ ...btnGhost, padding: '9px 16px', fontSize: 12.5 }}>J'ai un code</button>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ══ CTA FINAL ══ */}
      <section style={{ padding: '10px 22px 70px' }}>
        <Reveal>
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 26px', borderRadius: 24, textAlign: 'center', position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,.1)', background: `radial-gradient(ellipse at 50% 0%, rgba(139,92,246,.2), transparent 60%), linear-gradient(160deg, rgba(20,14,32,.7), rgba(6,8,15,.7))`, backdropFilter: 'blur(16px)' }}>
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
          {eyebrow && <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: C.teal, margin: 0 }}>{eyebrow}</p>}
          <h2 style={{ fontFamily: FONT, fontSize: 'clamp(24px,5.5vw,36px)', fontWeight: 800, letterSpacing: '-.8px', color: '#fff', margin: '8px 0 0' }}>{title}</h2>
          {sub && <p style={{ fontFamily: FONT, fontSize: 14.5, color: 'rgba(255,255,255,.5)', margin: '10px auto 0', maxWidth: 520, lineHeight: 1.5 }}>{sub}</p>}
        </div>
      </Reveal>
      {children}
    </section>
  )
}

// ── Styles ──
const accentSq = (c) => ({ display: 'block', width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${c}40, ${c}0d)`, border: `1px solid ${c}66` })
const navLink = { background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)', padding: '8px 10px', whiteSpace: 'nowrap' }
const card = { background: 'rgba(9,11,20,.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 16 }
const btnPrimary = { padding: '14px 26px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 15, fontWeight: 700, color: C.obsidian, background: `linear-gradient(135deg,${C.teal},#7af0d8)`, border: 'none' }
const btnGhost = { padding: '13px 24px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.18)' }
const btnSolid = (c) => ({ padding: '12px 20px', borderRadius: 12, cursor: 'pointer', fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: C.obsidian, background: c, border: 'none' })
const linkBtn = (c) => ({ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: c })
const featList = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }
const featItem = { fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.72)', display: 'flex', gap: 9, alignItems: 'baseline' }
