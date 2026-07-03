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
      <Section eyebrow="La promesse" title="Une soirée, ça se vit — pas ça se gère">
        <p style={txt}>
          Trouver la bonne soirée, réserver sans stress, garder son billet dans sa poche, contacter un DJ ou une salle en un message : tout devrait être simple. Live in Black enlève les frictions entre l'envie de sortir et le moment où la musique démarre.
        </p>
      </Section>

      {/* ══ LES 3 PROFILS ══ */}
      <Section eyebrow="Pour qui ?" title="Trois façons de vivre Live in Black">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 16 }}>
          {[
            { c: C.teal, t: 'Tu sors', d: 'Découvre les meilleures soirées près de chez toi, réserve en quelques secondes, reçois ton billet QR instantanément et cumule des points à chaque sortie.', cta: 'Créer mon compte', fn: register },
            { c: C.violet, t: 'Tu organises', d: 'Crée et publie ton événement, vends tes billets en ligne, gère ta guestlist, scanne les entrées et suis tes ventes en temps réel — POS sur place inclus.', cta: 'Devenir organisateur', fn: register },
            { c: C.gold, t: 'Tu prestes', d: 'DJ, salle, sono, traiteur… Crée ta vitrine publique, sois visible des organisateurs et reçois des demandes de devis directement.', cta: 'Devenir prestataire', fn: register },
          ].map(p => (
            <div key={p.t} className="lb-card" style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', borderColor: `${p.c}40`, background: `linear-gradient(160deg, ${p.c}12, rgba(9,11,20,.6))` }}>
              <h3 style={{ fontFamily: FONT, fontSize: 21, fontWeight: 800, letterSpacing: '-.4px', color: p.c, margin: 0 }}>{p.t}</h3>
              <p style={{ fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,.7)', margin: '10px 0 18px', lineHeight: 1.55, flex: 1 }}>{p.d}</p>
              <button onClick={p.fn} style={{ ...btnSolid(p.c), width: '100%' }}>{p.cta}</button>
            </div>
          ))}
        </div>
      </Section>

      {/* ══ COMMENT ÇA MARCHE ══ */}
      <Section eyebrow="En 3 temps" title="De l'envie à la piste">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
          {[
            ['1', 'Découvre', 'Parcours les soirées et les prestataires, filtre par ville et par style.'],
            ['2', 'Réserve', 'Paiement sécurisé, billet QR immédiat, tout reste dans ton compte.'],
            ['3', 'Profite', 'Scan à l\'entrée, commande sur place, et vis chaque nuit à fond.'],
          ].map(([n, t, d]) => (
            <div key={n} style={{ ...card, padding: '20px 18px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: 12, right: 16, fontFamily: FONT, fontSize: 40, fontWeight: 800, color: 'rgba(78,232,200,.14)' }}>{n}</span>
              <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: C.teal, margin: 0 }}>{t}</p>
              <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.55)', margin: '8px 0 0', lineHeight: 1.5 }}>{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ══ CONFIANCE ══ */}
      <Section eyebrow="La confiance" title="Sérieux là où ça compte">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: 14 }}>
          {[
            ['Paiements sécurisés', 'Transactions protégées, billets authentiques avec QR unique — impossible à falsifier.'],
            ['Prestataires vérifiés', 'Les profils validés portent un badge. Tu sais à qui tu parles.'],
            ['Tes données te protègent', 'On ne partage jamais ton contact sans ton accord. Confidentialité réelle, pas cosmétique.'],
            ['Un vrai support', 'Une question, un souci ? On répond. La nuit mérite du soin.'],
          ].map(([t, d]) => (
            <div key={t} style={{ ...card, padding: 20 }}>
              <p style={{ fontFamily: FONT, fontSize: 15.5, fontWeight: 800, color: '#fff', margin: 0 }}>{t}</p>
              <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.6)', margin: '8px 0 0', lineHeight: 1.55 }}>{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ══ CTA FINAL ══ */}
      <section style={{ padding: '20px 22px 70px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 26px', borderRadius: 24, textAlign: 'center', border: '1px solid rgba(255,255,255,.1)', background: `radial-gradient(ellipse at 50% 0%, rgba(139,92,246,.2), transparent 60%), linear-gradient(160deg, rgba(20,14,32,.7), rgba(6,8,15,.7))`, backdropFilter: 'blur(16px)' }}>
          <h2 style={{ fontFamily: FONT, fontSize: 'clamp(26px,6vw,40px)', fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>Prêt à vivre la nuit ?</h2>
          <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.6)', margin: '12px auto 0', maxWidth: 440, lineHeight: 1.5 }}>Rejoins Live in Black gratuitement, en 30 secondes.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
            <button onClick={register} style={btnPrimary}>Créer mon compte</button>
            <button onClick={() => navigate('/evenements')} style={btnGhost}>Voir les événements</button>
          </div>
        </div>
      </section>
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
