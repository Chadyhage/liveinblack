'use client'

import Image from 'next/image'
import { ActionLink, Button, Card } from '@/app/components/ui'
import { useQueryParamState } from '@/lib/client/useQueryParamState'

// Seule partie interactive de la page (bascule entre les 3 profils) — le
// reste de /c-est-quoi est statique. Port de la logique JourneyVisual/tabs de
// PublicAbout.jsx ; l'auto-cycle du visuel de parcours (setInterval) et les
// animations de révélation au scroll sont omis (polish visuel, pas de valeur
// fonctionnelle).
type TabId = 'client' | 'organizer' | 'provider'

const TABS: Array<{ id: TabId; label: string; color: string; roleName: string; description: string; cta: string; href: string; image: string; imageAlt: string }> = [
  {
    id: 'client',
    label: 'Tu sors',
    color: 'var(--teal)',
    roleName: 'Le Clubber',
    description:
      'Découvre les meilleures soirées près de chez toi, réserve en quelques secondes, reçois ton billet QR instantanément et cumule des points à chaque sortie.',
    cta: 'Créer mon compte',
    href: '/login?mode=register',
    image: '/images/live-in-black/about/about-tab-client-ticket-friends.png',
    imageAlt: 'Un public profite d’une soirée Live in Black',
  },
  {
    id: 'organizer',
    label: 'Tu organises',
    color: 'var(--violet)',
    roleName: "L'Organisateur",
    description:
      'Crée et publie ton événement, vends tes billets en ligne, gère ta guestlist, scanne les entrées et suis tes ventes en temps réel — POS sur place inclus.',
    cta: 'Devenir organisateur',
    href: '/organizer-signup',
    image: '/images/live-in-black/about/about-tab-organizer-sales-tablet.png',
    imageAlt: 'Une organisatrice supervise son événement en coulisses',
  },
  {
    id: 'provider',
    label: 'Tu prestes',
    color: 'var(--gold)',
    roleName: 'Le Prestataire',
    description: 'DJ, salle, sono, traiteur… Crée ta vitrine publique, sois visible des organisateurs et reçois des demandes de devis directement.',
    cta: 'Devenir prestataire',
    href: '/provider-signup',
    image: '/images/live-in-black/about/about-tab-provider-side-stage.png',
    imageAlt: 'Un photographe professionnel intervient pendant un événement',
  },
]

const JOURNEYS: Record<TabId, Array<[string, string, string]>> = {
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

export default function TabsSection() {
  // Page publique sans auth — un lien direct vers un onglet (ex. le
  // parcours "organisateur") doit être partageable, d'où ?tab= plutôt qu'un
  // simple useState local.
  const [activeTab, setActiveTab] = useQueryParamState<TabId>('tab', 'client')
  const current = TABS.find((t) => t.id === activeTab)!

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <Button
            key={t.id}
              variant="ghost"
              onClick={() => setActiveTab(t.id)}
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                padding: '8px 16px',
                borderRadius: 999,
                color: activeTab === t.id ? '#fff' : 'var(--text-muted)',
                background: activeTab === t.id ? `${t.color}22` : 'transparent',
                border: `1px solid ${activeTab === t.id ? `${t.color}66` : 'var(--border)'}`,
              }}
            >
            {t.label}
          </Button>
        ))}
      </div>

      <Card
        style={{
          padding: '24px 22px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 18,
          alignItems: 'center',
          textAlign: 'left',
          minHeight: 220,
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: current.color }}>{current.roleName}</span>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '6px 0 10px', letterSpacing: '-0.6px' }}>{current.label}</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 0 18px' }}>{current.description}</p>
          <ActionLink href={current.href} style={{ color: current.id === 'organizer' ? '#fff' : 'var(--primary-ink)', background: current.id === 'organizer' ? 'var(--violet-cta)' : current.color }}>
            {current.cta}
          </ActionLink>
        </div>
        <div style={{ overflow: 'hidden', borderRadius: 18, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)' }}>
          <div style={{ position: 'relative', minHeight: 160 }}>
            <Image src={current.image} alt={current.imageAlt} fill sizes="(max-width: 700px) calc(100vw - 80px), 42vw" style={{ objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 42%, rgba(5,5,8,.82))' }} />
          </div>
          <div style={{ padding: '14px 14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {JOURNEYS[activeTab].map(([number, title, detail]) => (
              <div key={title} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    margin: '0 auto 8px',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    background: '#090b13',
                    border: `1px solid ${current.color}66`,
                    color: current.color,
                    fontWeight: 700,
                    fontSize: 11.5,
                  }}
                >
                  {number}
                </div>
                <p style={{ fontSize: 11.5, fontWeight: 700, margin: 0, color: 'rgba(255,255,255,.75)' }}>{title}</p>
                <span style={{ display: 'block', fontSize: 10, lineHeight: 1.35, color: 'var(--text-faint)', marginTop: 3 }}>{detail}</span>
              </div>
            ))}
          </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
