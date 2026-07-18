import Link from 'next/link'
import type { Metadata } from 'next'
import TabsSection from './TabsSection'

export const metadata: Metadata = {
  title: "C'est quoi LIVEINBLACK ? — LIVEINBLACK",
  description: "Live in Black est la marketplace de la nuit et de l'événementiel.",
}

// Port de src/pages/PublicAbout.jsx — contenu statique (aucune donnée),
// à l'exception du sélecteur de profil (voir TabsSection, client component).
export default function PublicAboutPage() {
  return (
    <div style={{ padding: '0 0 60px' }}>
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '48px 22px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 24, fontWeight: 300, letterSpacing: '0.08em', margin: 0 }}>
          L<span>|</span>VE IN <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 700 }}>BLACK</span>
        </p>
        <h1 style={{ fontSize: 'clamp(32px,7vw,54px)', fontWeight: 800, letterSpacing: '-1.4px', lineHeight: 1.04, margin: '18px 0 0' }}>
          Toute la nuit,
          <br />
          <span style={{ color: 'var(--teal)' }}>au même endroit.</span>
        </h1>
        <p style={{ fontSize: 'clamp(15px,4vw,18px)', color: 'var(--text-muted)', margin: '20px auto 0', maxWidth: 600, lineHeight: 1.6 }}>
          Live in Black est la marketplace de la nuit et de l&apos;événementiel. On réunit ceux qui font la fête, ceux qui l&apos;organisent et ceux qui la rendent
          inoubliable — sur une seule plateforme, simple et sécurisée.
        </p>
      </section>

      <Section eyebrow="La promesse" title="La fête, sans les frictions">
        <p style={{ fontSize: 'clamp(15px,4vw,18px)', color: 'var(--text-muted)', lineHeight: 1.7, textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
          Trouver la bonne soirée, réserver sans stress, garder son billet dans sa poche, contacter un DJ ou une salle en un message : tout devrait être simple.
          Live in Black enlève les frictions entre l&apos;envie de sortir et le moment où la musique démarre.
        </p>
      </Section>

      <Section eyebrow="Pour qui ?" title="Trois façons de vivre Live in Black">
        <TabsSection />
      </Section>

      <Section eyebrow="En 3 temps" title="De l'envie à la piste">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
          {[
            ['1', 'Découvre', 'Parcours les soirées et les prestataires, filtre par ville et par style.'],
            ['2', 'Réserve', 'Paiement sécurisé, billet QR immédiat, tout reste dans ton compte.'],
            ['3', 'Profite', "Scan à l'entrée, commande sur place, et vis chaque nuit à fond."],
          ].map(([n, t, d]) => (
            <div key={n} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 18px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: 12, right: 16, fontSize: 40, fontWeight: 800, color: 'rgba(78,232,200,.14)' }}>{n}</span>
              <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal)', margin: 0 }}>{t}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="La confiance" title="Tout est protégé et sécurisé">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: 14 }}>
          {[
            ['Paiements sécurisés', 'Transactions protégées, billets authentiques avec QR unique — impossible à falsifier.'],
            ['Profils sélectionnés', 'Chaque organisateur et prestataire visible sur la plateforme a été validé par notre équipe.'],
            ['Tes données te protègent', "On ne partage jamais ton contact sans ton accord. Confidentialité réelle, pas cosmétique."],
            ['Un vrai support', 'Une question, un souci ? On répond. La nuit mérite du soin.'],
          ].map(([t, d]) => (
            <div key={t} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 15.5, fontWeight: 800, margin: 0 }}>{t}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.55 }}>{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <section style={{ padding: '20px 22px 0' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 26px', borderRadius: 24, textAlign: 'center', border: '1px solid var(--border)', background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,.14), transparent 60%), var(--surface-2)' }}>
          <h2 style={{ fontSize: 'clamp(26px,6vw,40px)', fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>Prêt à vivre la nuit ?</h2>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '12px auto 0', maxWidth: 500, lineHeight: 1.5 }}>
            Crée ton compte en moins d&apos;une minute et découvre tout ce que Live in Black peut simplifier pour toi.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
            <Link href="/login?mode=register" style={{ padding: '14px 26px', borderRadius: 999, fontSize: 15, fontWeight: 700, color: '#04120e', background: 'var(--teal-solid)', textDecoration: 'none' }}>
              Créer mon compte
            </Link>
            <Link href="/events" style={{ padding: '13px 24px', borderRadius: 999, fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.08)', border: '1px solid var(--border-strong)', textDecoration: 'none' }}>
              Voir les événements
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '46px 22px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--teal)', margin: 0 }}>{eyebrow}</p>
        <h2 style={{ fontSize: 'clamp(23px,5.5vw,34px)', fontWeight: 800, letterSpacing: '-.7px', margin: '8px 0 0' }}>{title}</h2>
      </div>
      {children}
    </section>
  )
}
