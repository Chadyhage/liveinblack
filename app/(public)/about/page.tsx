import { Suspense } from 'react'
import type { Metadata } from 'next'
import TabsSection from './TabsSection'
import { PageShell } from '@/app/components/layout'
import { Accordion, ActionLink, EditorialImageCard, SectionHeader } from '@/app/components/ui'
import styles from './about.module.css'

export const metadata: Metadata = {
  title: "C'est quoi LIVEINBLACK ? — LIVEINBLACK",
  description: "Live in Black est la marketplace de la nuit et de l'événementiel.",
  alternates: { canonical: '/about' },
}

// Port de src/pages/PublicAbout.jsx — contenu statique (aucune donnée),
// à l'exception du sélecteur de profil (voir TabsSection, client component).
export default function PublicAboutPage() {
  return (
    <PageShell style={{ maxWidth: 'none', padding: 0 }}>
      <div className={styles.page}>
      <section className={styles.hero} style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 22px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 300, letterSpacing: '0.08em', margin: 0 }}>
          L<span>|</span>VE IN <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 700 }}>BLACK</span>
        </p>
        <h1 className="font-display" style={{ fontSize: 'clamp(32px,7vw,54px)', letterSpacing: '.01em', lineHeight: 1.04, margin: '18px 0 0' }}>
          Toute la nuit,
          <br />
          <span style={{ color: 'var(--teal)' }}>au même endroit.</span>
        </h1>
        <p style={{ fontSize: 'clamp(15px,4vw,18px)', color: 'var(--text-muted)', margin: '20px auto 0', maxWidth: 760, lineHeight: 1.6 }}>
          Live in Black est la marketplace de la nuit et de l&apos;événementiel. On réunit ceux qui font la fête, ceux qui l&apos;organisent et ceux qui la rendent
          inoubliable — sur une seule plateforme, simple et sécurisée.
        </p>
      </section>

      <Section eyebrow="La promesse" title="La fête, sans les frictions">
        <p style={{ fontSize: 'clamp(15px,4vw,18px)', color: 'var(--text-muted)', lineHeight: 1.7, textAlign: 'center', maxWidth: 820, margin: '0 auto' }}>
          Trouver la bonne soirée, réserver sans stress, garder son billet dans sa poche, contacter un DJ ou une salle en un message : tout devrait être simple.
          Live in Black enlève les frictions entre l&apos;envie de sortir et le moment où la musique démarre.
        </p>
      </Section>

      <Section eyebrow="Pour qui ?" title="Trois façons de vivre Live in Black">
        {/* TabsSection lit ?tab= via useSearchParams (onglet partageable par
            URL) — sur cette page STATIQUE, Next.js exige une frontière
            Suspense autour de tout composant client qui lit les search
            params au prerender, sinon le build échoue (missing-suspense-
            with-csr-bailout). Le fallback null ne dure qu'un instant côté
            client, la page reste prerendue statiquement. */}
        <Suspense fallback={<div className="lb-loading-panel" style={{ minHeight: 280 }}>Préparation de la présentation…</div>}>
          <TabsSection />
        </Suspense>
      </Section>

      <Section eyebrow="En 3 temps" title="De l'envie à la piste">
        <div className="lb-card-grid">
          {[
            ['01', 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1100&q=82', 'Une scène et son public pendant un festival', 'Découvre', 'Parcours les soirées et les prestataires, puis filtre simplement par ville et par style.'],
            ['02', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1100&q=82', 'Des personnes réunies pendant un concert', 'Réserve', 'Paiement sécurisé, billet QR immédiat : chaque information reste accessible dans ton compte.'],
            ['03', 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1100&q=82', 'Une grande scène de concert éclairée', 'Profite', "Présente ton QR à l’entrée, retrouve les services disponibles et vis pleinement l’événement."],
          ].map(([number, src, alt, title, description]) => (
            <EditorialImageCard key={number} src={src} alt={alt} badge={number} title={title} description={description} />
          ))}
        </div>
      </Section>

      <Section eyebrow="La confiance" title="Tout est protégé et sécurisé">
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '10px 24px', border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, background: 'rgba(255,255,255,.055)' }}>
          <Accordion items={[
            { question: 'Paiements sécurisés', answer: 'Transactions protégées, billets authentiques avec QR unique — impossible à falsifier.' },
            { question: 'Profils sélectionnés', answer: 'Chaque organisateur et prestataire visible sur la plateforme a été validé par notre équipe.' },
            { question: 'Tes données restent privées', answer: "On ne partage jamais ton contact sans ton accord. La confidentialité est intégrée au parcours." },
            { question: 'Un vrai support', answer: 'Une question ou un souci ? Notre équipe reste disponible pour t’accompagner.' },
          ]} />
        </div>
      </Section>

      <section className={styles.ctaWrap} style={{ padding: '20px 22px 0' }}>
          <div className={styles.cta} style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 26px', borderRadius: 'var(--radius-xl)', textAlign: 'center', border: '1px solid var(--border)', background: 'radial-gradient(ellipse at 50% 0%, rgba(184, 243, 74,.12), transparent 60%), var(--surface-2)' }}>
          <h2 className="font-display" style={{ fontSize: 'clamp(26px,6vw,40px)', letterSpacing: '.01em', margin: 0 }}>Prêt à vivre la nuit ?</h2>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '12px auto 0', maxWidth: 720, lineHeight: 1.5 }}>
            Crée ton compte en moins d&apos;une minute et découvre tout ce que Live in Black peut simplifier pour toi.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
            <ActionLink href="/login?mode=register">Créer mon compte</ActionLink>
            <ActionLink href="/events" tone="secondary">Voir les événements</ActionLink>
          </div>
        </div>
      </section>
      </div>
    </PageShell>
  )
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} style={{ padding: 'clamp(42px, 5vw, 56px) clamp(10px, 1.5vw, 24px)', maxWidth: 1560, margin: '0 auto' }}>
      <SectionHeader eyebrow={eyebrow} title={title} align="center" level={2} />
      {children}
    </section>
  )
}
