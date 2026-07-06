import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import PublicNav from '../components/PublicNav'

// ─── Page publique « Live in Black, c'est quoi ? » ───────────────────────────
// Récit de la plateforme pour les visiteurs : la promesse, les 3 profils
// (client / organisateur / prestataire), la confiance, la vision. Même
// système visuel que la vitrine (PublicLanding).

const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa', violet: '#8b5cf6' }
const FONT = 'Inter, sans-serif'

export default function PublicAbout() {
  const navigate = useNavigate()
  const register = () => navigate('/connexion?mode=register')

  const [seconds, setSeconds] = useState(30)
  const [isCounting, setIsCounting] = useState(false)
  const ctaRef = useRef(null)

  const [activeTab, setActiveTab] = useState('client')

  const tabs = [
    { id: 'client', label: 'Tu sors', color: C.teal, roleName: 'Le Clubber', d: 'Découvre les meilleures soirées près de chez toi, réserve en quelques secondes, reçois ton billet QR instantanément et cumule des points à chaque sortie.', cta: 'Créer mon compte', fn: register },
    { id: 'organizer', label: 'Tu organises', color: C.violet, roleName: 'L’Organisateur', d: 'Crée et publie ton événement, vends tes billets en ligne, gère ta guestlist, scanne les entrées et suis tes ventes en temps réel — POS sur place inclus.', cta: 'Devenir organisateur', fn: register },
    { id: 'provider', label: 'Tu prestes', color: C.gold, roleName: 'Le Prestataire', d: 'DJ, salle, sono, traiteur… Crée ta vitrine publique, sois visible des organisateurs et reçois des demandes de devis directement.', cta: 'Devenir prestataire', fn: register },
  ]
  const currentTab = tabs.find(t => t.id === activeTab)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeconds(30)
          setIsCounting(true)
        } else {
          setIsCounting(false)
        }
      },
      { threshold: 0.15 }
    )
    if (ctaRef.current) {
      observer.observe(ctaRef.current)
    }
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isCounting) return
    if (seconds <= 0) {
      setIsCounting(false)
      return
    }
    const timer = setTimeout(() => {
      setSeconds(s => s - 1)
    }, 1000)
    return () => clearTimeout(timer)
  }, [seconds, isCounting])

  return (
    <div style={{
      color: '#fff', overflowX: 'hidden', minHeight: '100vh',
      background: `radial-gradient(circle 900px at 6% 4%, rgba(139,92,246,.28), transparent 60%), radial-gradient(circle 820px at 96% 34%, rgba(78,232,200,.14), transparent 56%), radial-gradient(circle 950px at 50% 100%, rgba(224,90,170,.16), transparent 60%), ${C.obsidian}`,
      backgroundAttachment: 'fixed',
    }}>
      <style>{`
        .lb-navlink{ display:none }
        @media(min-width:720px){ .lb-navlink{ display:inline-block } }
        .lb-card{ transition:transform .25s cubic-bezier(.22,.9,.3,1), border-color .25s ease }
        .lb-card:hover{ transform:translateY(-4px); border-color:rgba(78,232,200,.4) }
        @keyframes lib-tick {
          0% { transform: scale(1.25); filter: brightness(1.3); }
          100% { transform: scale(1.1); filter: brightness(1); }
        }
        .lb-fade-in {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .lb-fade-in.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .lb-tab {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 21px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          padding: 8px 22px;
          border-radius: 99px;
          border: 1px solid transparent;
          background: transparent;
          color: rgba(255,255,255,0.45);
          transition: all 0.25s ease;
        }
        .lb-tab:hover {
          color: #fff;
        }
      `}</style>

      <PublicNav />

      {/* ══ HERO ══ */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '60px 22px 20px', textAlign: 'center' }}>
        <p style={{ fontFamily: FONT, fontSize: 26, fontWeight: 300, letterSpacing: '.14em', margin: 0 }}>
          L<span style={{ color: C.pink }}>|</span>VE&nbsp;IN&nbsp;<span style={{ fontStyle: 'italic', fontWeight: 700, background: `linear-gradient(90deg,${C.pink},${C.violet})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>BLACK</span>
        </p>
        <h1 style={{ fontFamily: FONT, fontSize: 'clamp(32px,7vw,54px)', fontWeight: 800, letterSpacing: '-1.4px', lineHeight: 1.04, margin: '18px 0 0' }}>
          Toute la nuit,<br /><span style={{ background: `linear-gradient(90deg,${C.teal},${C.violet},${C.pink})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>au même endroit.</span>
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 'clamp(15px,4vw,18px)', color: 'rgba(255,255,255,.65)', margin: '20px auto 0', maxWidth: 600, lineHeight: 1.6 }}>
          Live in Black est la marketplace de la nuit et de l'événementiel. On réunit ceux qui font la fête, ceux qui l'organisent et ceux qui la rendent inoubliable — sur une seule plateforme, simple et sécurisée.
        </p>
      </section>

      {/* ══ LA PROMESSE ══ */}
      <ScrollFadeIn>
        <Section eyebrow="La promesse" title="LIB, quand créer ta soirée devient une partie de plaisir">
          <p style={txt}>
            Trouver la bonne soirée, réserver sans stress, garder son billet dans sa poche, contacter un DJ ou une salle en un message : tout devrait être simple. Live in Black enlève les frictions entre l'envie de sortir et le moment où la musique démarre.
          </p>
        </Section>
      </ScrollFadeIn>

      {/* ══ LES 3 PROFILS ══ */}
      <ScrollFadeIn>
        <Section eyebrow="Pour qui ?" title="Trois façons de vivre Live in Black">
          {/* Tab buttons swapper */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="lb-tab"
                style={{
                  color: activeTab === t.id ? '#fff' : 'rgba(255,255,255,0.45)',
                  background: activeTab === t.id ? `${t.color}22` : 'transparent',
                  border: `1px solid ${activeTab === t.id ? `${t.color}66` : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: activeTab === t.id ? `0 0 20px ${t.color}12` : 'none'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Interactive active tab content card */}
          <div className="lb-card" style={{ ...card, padding: '36px 30px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, alignItems: 'center', textAlign: 'left', minHeight: 280 }}>
            <div>
              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: currentTab.color }}>{currentTab.roleName}</span>
              <h3 style={{ fontFamily: FONT, fontSize: 28, fontWeight: 800, color: '#fff', margin: '6px 0 12px', letterSpacing: '-0.6px' }}>{currentTab.label}</h3>
              <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 24px' }}>{currentTab.d}</p>
              <button onClick={currentTab.fn} style={btnSolid(currentTab.color)}>{currentTab.cta}</button>
            </div>
            <div>
              <TabMockup type={activeTab} />
            </div>
          </div>
        </Section>
      </ScrollFadeIn>

      {/* ══ COMMENT ÇA MARCHE ══ */}
      <Section eyebrow="En 3 temps" title="De l'envie à la piste">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
          {[
            ['1', 'Découvre', 'Parcours les soirées et les prestataires, filtre par ville et par style.'],
            ['2', 'Réserve', 'Paiement sécurisé, billet QR immédiat, tout reste dans ton compte.'],
            ['3', 'Profite', 'Scan à l\'entrée, commande sur place, et vis chaque nuit à fond.'],
          ].map(([n, t, d], i) => (
            <ScrollFadeIn key={n} delay={i * 100}>
              <div style={{ ...card, padding: '20px 18px', position: 'relative', height: '100%' }}>
                <span style={{ position: 'absolute', top: 12, right: 16, fontFamily: FONT, fontSize: 40, fontWeight: 800, color: 'rgba(78,232,200,.14)' }}>{n}</span>
                <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: C.teal, margin: 0 }}>{t}</p>
                <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.55)', margin: '8px 0 0', lineHeight: 1.5 }}>{d}</p>
              </div>
            </ScrollFadeIn>
          ))}
        </div>
      </Section>

      {/* ══ CONFIANCE ══ */}
      <Section eyebrow="La confiance" title="Tout est protégé et sécurisé">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: 14 }}>
          {[
            ['Paiements sécurisés', 'Transactions protégées, billets authentiques avec QR unique — impossible à falsifier.'],
            ['Profils sélectionnés', 'Chaque organisateur et prestataire visible sur la plateforme a été validé par notre équipe.'],
            ['Tes données te protègent', 'On ne partage jamais ton contact sans ton accord. Confidentialité réelle, pas cosmétique.'],
            ['Un vrai support', 'Une question, un souci ? On répond. La nuit mérite du soin.'],
          ].map(([t, d], i) => (
            <ScrollFadeIn key={t} delay={i * 100}>
              <div style={{ ...card, padding: 20, height: '100%' }}>
                <p style={{ fontFamily: FONT, fontSize: 15.5, fontWeight: 800, color: '#fff', margin: 0 }}>{t}</p>
                <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.6)', margin: '8px 0 0', lineHeight: 1.55 }}>{d}</p>
              </div>
            </ScrollFadeIn>
          ))}
        </div>
      </Section>

      {/* ══ CTA FINAL ══ */}
      <ScrollFadeIn>
        <section ref={ctaRef} style={{ padding: '20px 22px 70px' }}>
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 26px', borderRadius: 24, textAlign: 'center', border: '1px solid rgba(255,255,255,.1)', background: `radial-gradient(ellipse at 50% 0%, rgba(139,92,246,.2), transparent 60%), linear-gradient(160deg, rgba(20,14,32,.7), rgba(6,8,15,.7))`, backdropFilter: 'blur(16px)' }}>
            <h2 style={{ fontFamily: FONT, fontSize: 'clamp(26px,6vw,40px)', fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>Prêt à vivre la nuit ?</h2>
            <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.6)', margin: '12px auto 0', maxWidth: 440, lineHeight: 1.5 }}>
              Rejoins Live in Black gratuitement, en <span key={seconds} style={{ color: seconds <= 5 ? C.pink : C.teal, display: 'inline-block', fontWeight: 800, transition: 'color 0.4s ease', transform: isCounting && seconds > 0 ? 'scale(1.1)' : 'scale(1)', animation: isCounting && seconds > 0 ? 'lib-tick 0.3s ease-out' : 'none' }}>{seconds}</span> secondes.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
              <button onClick={register} style={btnPrimary}>Créer mon compte</button>
              <button onClick={() => navigate('/evenements')} style={btnGhost}>Voir les événements</button>
            </div>
          </div>
        </section>
      </ScrollFadeIn>
    </div>
  )
}

function Section({ eyebrow, title, children }) {
  return (
    <section style={{ padding: '46px 22px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: C.teal, margin: 0 }}>{eyebrow}</p>
        <h2 style={{ fontFamily: FONT, fontSize: 'clamp(23px,5.5vw,34px)', fontWeight: 800, letterSpacing: '-.7px', margin: '8px 0 0' }}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

const card = { background: 'rgba(9,11,20,.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 16 }
const txt = { fontFamily: FONT, fontSize: 'clamp(15px,4vw,18px)', color: 'rgba(255,255,255,.7)', lineHeight: 1.7, textAlign: 'center', maxWidth: 640, margin: '0 auto' }
const btnPrimary = { padding: '14px 26px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 15, fontWeight: 700, color: C.obsidian, background: `linear-gradient(135deg,${C.teal},#7af0d8)`, border: 'none' }
const btnGhost = { padding: '13px 24px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.18)' }
const btnSolid = (c) => ({ padding: '11px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: C.obsidian, background: c, border: 'none' })
