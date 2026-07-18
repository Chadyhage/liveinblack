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
    const target = ctaRef.current
    if (!target) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeconds(30)
        setIsCounting(true)
      } else {
        setIsCounting(false)
      }
    }, { threshold: 0.2 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isCounting || seconds <= 0) return undefined
    const timer = setTimeout(() => setSeconds(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [seconds, isCounting])

  return (
    <div style={{
      color: '#fff', overflowX: 'hidden', minHeight: '100vh',
      background: `radial-gradient(circle 900px at 6% 4%, rgba(139,92,246,.15), transparent 60%), radial-gradient(circle 820px at 96% 34%, rgba(78,232,200,.08), transparent 56%), radial-gradient(circle 950px at 50% 100%, rgba(224,90,170,.08), transparent 60%), ${C.obsidian}`,
      backgroundAttachment: 'fixed',
    }}>
      <style>{`
        .lb-navlink{ display:none }
        @media(min-width:720px){ .lb-navlink{ display:inline-block } }
        .lb-card{ transition:transform .25s cubic-bezier(.22,.9,.3,1), border-color .25s ease }
        .lb-card:hover{ transform:translateY(-4px); border-color:rgba(78,232,200,.4) }
        @keyframes lib-node-in { from { opacity:.35; transform:translateY(7px); } to { opacity:1; transform:none; } }
        @keyframes lib-tick { 0% { transform:scale(1.28); filter:brightness(1.35); } 100% { transform:scale(1); filter:brightness(1); } }
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
          font-family: Inter, sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          padding: 10px 20px;
          border-radius: 99px;
          border: 1px solid transparent;
          background: transparent;
          color: rgba(255,255,255,0.5);
          transition: all 0.25s ease;
        }
        .lb-tab:hover {
          color: #fff;
        }
        .lb-journey{position:relative;padding:24px 20px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);overflow:hidden;min-height:210px;display:flex;flex-direction:column;justify-content:center}
        .lb-journey-line{position:absolute;left:16%;right:16%;top:82px;height:1px;background:rgba(255,255,255,.12);overflow:hidden}
        .lb-journey-steps{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .lb-journey-step{text-align:center;min-width:0;transition:opacity .35s ease,transform .35s ease}
        .lb-journey-dot{width:42px;height:42px;margin:0 auto 13px;border-radius:50%;display:grid;place-items:center;background:#090b13;border:1px solid rgba(255,255,255,.16);font:700 13px Inter,sans-serif;transition:all .35s ease}
        .lb-journey-step.active{animation:lib-node-in .4s ease both}
        .lb-journey-step.active .lb-journey-dot{color:#04040b;background:var(--journey-color);border-color:var(--journey-color)}
        .lb-journey-step p{font-family:${FONT};font-size:12px;font-weight:700;margin:0;color:rgba(255,255,255,.72)}
        .lb-journey-step span{display:block;font-family:${FONT};font-size:11px;line-height:1.45;color:rgba(255,255,255,.42);margin-top:5px}
        @media(max-width:560px){.lb-journey{padding:20px 12px;min-height:195px}.lb-journey-line{left:18%;right:18%;top:72px}.lb-journey-dot{width:36px;height:36px}.lb-journey-step p{font-size:11px}.lb-journey-step span{font-size:10.5px}}
      `}</style>

      <PublicNav />

      {/* ══ HERO ══ */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '60px 22px 20px', textAlign: 'center' }}>
        <p style={{ fontFamily: FONT, fontSize: 26, fontWeight: 300, letterSpacing: '.14em', margin: 0 }}>
          L<span style={{ color: '#fff' }}>|</span>VE&nbsp;IN&nbsp;<span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 700, color: '#fff' }}>BLACK</span>
        </p>
        <h1 style={{ fontFamily: FONT, fontSize: 'clamp(32px,7vw,54px)', fontWeight: 800, letterSpacing: '-1.4px', lineHeight: 1.04, margin: '18px 0 0' }}>
          Toute la nuit,<br /><span style={{ color: C.teal }}>au même endroit.</span>
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 'clamp(15px,4vw,18px)', color: 'rgba(255,255,255,.65)', margin: '20px auto 0', maxWidth: 600, lineHeight: 1.6 }}>
          Live in Black est la marketplace de la nuit et de l'événementiel. On réunit ceux qui font la fête, ceux qui l'organisent et ceux qui la rendent inoubliable — sur une seule plateforme, simple et sécurisée.
        </p>
      </section>

      {/* ══ LA PROMESSE ══ */}
      <ScrollFadeIn>
        <Section eyebrow="La promesse" title="La fête, sans les frictions">
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
                  color: activeTab === t.id ? '#fff' : 'rgba(255,255,255,0.5)',
                  background: activeTab === t.id ? `${t.color}22` : 'transparent',
                  border: `1px solid ${activeTab === t.id ? `${t.color}66` : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Interactive active tab content card */}
          <div className="lb-card" style={{ ...card, padding: '36px 30px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, alignItems: 'center', textAlign: 'left', minHeight: 280 }}>
            <div>
              <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: currentTab.color }}>{currentTab.roleName}</span>
              <h3 style={{ fontFamily: FONT, fontSize: 28, fontWeight: 800, color: '#fff', margin: '6px 0 12px', letterSpacing: '-0.6px' }}>{currentTab.label}</h3>
              <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 24px' }}>{currentTab.d}</p>
              <button onClick={currentTab.fn} style={btnSolid(currentTab.color)}>{currentTab.cta}</button>
            </div>
            <div>
              <JourneyVisual type={activeTab} color={currentTab.color} />
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
          <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 26px', borderRadius: 24, textAlign: 'center', border: '1px solid rgba(255,255,255,.1)', background: `radial-gradient(ellipse at 50% 0%, rgba(139,92,246,.14), transparent 60%), #12131c`, boxShadow: '0 24px 64px rgba(0,0,0,.55)' }}>
            <h2 style={{ fontFamily: FONT, fontSize: 'clamp(26px,6vw,40px)', fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>Prêt à vivre la nuit ?</h2>
            <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.6)', margin: '12px auto 0', maxWidth: 500, lineHeight: 1.5 }}>
              Crée ton compte en moins d'une minute et découvre tout ce que Live in Black peut simplifier pour toi.
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
        <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.teal, margin: 0 }}>{eyebrow}</p>
        <h2 style={{ fontFamily: FONT, fontSize: 'clamp(23px,5.5vw,34px)', fontWeight: 800, letterSpacing: '-.7px', margin: '8px 0 0' }}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

const card = { background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }
const txt = { fontFamily: FONT, fontSize: 'clamp(15px,4vw,18px)', color: 'rgba(255,255,255,.7)', lineHeight: 1.7, textAlign: 'center', maxWidth: 640, margin: '0 auto' }
const btnPrimary = { padding: '14px 26px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 15, fontWeight: 700, color: '#04120e', background: '#3ed6b5', border: 'none', boxShadow: '0 6px 20px rgba(62,214,181,.25)' }
const btnGhost = { padding: '13px 24px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)' }
const btnSolid = (c) => ({ padding: '12px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 700, color: c === C.violet ? '#fff' : '#04120e', background: c === C.violet ? 'linear-gradient(180deg, #8f56ff, #7a3bf2)' : c, border: '1px solid rgba(255,255,255,.14)', boxShadow: c === C.violet ? '0 6px 20px rgba(122,59,242,.35)' : 'none' })

function ScrollFadeIn({ children, delay = 0 }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`lb-fade-in ${visible ? 'visible' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

const JOURNEYS = {
  client: [
    ['01', 'Découvrir', 'Trouver une soirée'],
    ['02', 'Réserver', 'Choisir son billet'],
    ['03', 'Entrer', 'Présenter son QR'],
  ],
  organizer: [
    ['01', 'Créer', 'Construire son événement'],
    ['02', 'Publier', 'Ouvrir la billetterie'],
    ['03', 'Piloter', 'Gérer et scanner'],
  ],
  provider: [
    ['01', 'Présenter', 'Créer sa vitrine'],
    ['02', 'Proposer', 'Ajouter son catalogue'],
    ['03', 'Échanger', 'Recevoir un message'],
  ],
}

function JourneyVisual({ type, color }) {
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    setActiveStep(0)
    const timer = setInterval(() => setActiveStep(step => (step + 1) % 3), 1800)
    return () => clearInterval(timer)
  }, [type])

  return (
    <div className="lb-journey" style={{ '--journey-color': color }} aria-label={`Parcours ${type}`}>
      <div className="lb-journey-line" />
      <div className="lb-journey-steps">
        {JOURNEYS[type].map(([number, title, detail], index) => (
          <div key={title} className={`lb-journey-step ${activeStep === index ? 'active' : ''}`} style={{ opacity: activeStep === index ? 1 : .52, transform: activeStep === index ? 'translateY(-3px)' : 'none' }}>
            <div className="lb-journey-dot">{number}</div>
            <p>{title}</p>
            <span>{detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
