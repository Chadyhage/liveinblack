'use client'

import { useState } from 'react'
import Link from 'next/link'

// Seule partie interactive de la page (bascule entre les 3 profils) — le
// reste de /c-est-quoi est statique. Port de la logique JourneyVisual/tabs de
// PublicAbout.jsx ; l'auto-cycle du visuel de parcours (setInterval) et les
// animations de révélation au scroll sont omis (polish visuel, pas de valeur
// fonctionnelle).
type TabId = 'client' | 'organizer' | 'provider'

const TABS: Array<{ id: TabId; label: string; color: string; roleName: string; description: string; cta: string }> = [
  {
    id: 'client',
    label: 'Tu sors',
    color: 'var(--teal)',
    roleName: 'Le Clubber',
    description:
      'Découvre les meilleures soirées près de chez toi, réserve en quelques secondes, reçois ton billet QR instantanément et cumule des points à chaque sortie.',
    cta: 'Créer mon compte',
  },
  {
    id: 'organizer',
    label: 'Tu organises',
    color: 'var(--violet)',
    roleName: "L'Organisateur",
    description:
      'Crée et publie ton événement, vends tes billets en ligne, gère ta guestlist, scanne les entrées et suis tes ventes en temps réel — POS sur place inclus.',
    cta: 'Devenir organisateur',
  },
  {
    id: 'provider',
    label: 'Tu prestes',
    color: 'var(--gold)',
    roleName: 'Le Prestataire',
    description: 'DJ, salle, sono, traiteur… Crée ta vitrine publique, sois visible des organisateurs et reçois des demandes de devis directement.',
    cta: 'Devenir prestataire',
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
  const [activeTab, setActiveTab] = useState<TabId>('client')
  const current = TABS.find((t) => t.id === activeTab)!

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              padding: '10px 20px',
              borderRadius: 999,
              color: activeTab === t.id ? '#fff' : 'var(--text-muted)',
              background: activeTab === t.id ? `${t.color}22` : 'transparent',
              border: `1px solid ${activeTab === t.id ? `${t.color}66` : 'var(--border)'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '36px 30px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 32,
          alignItems: 'center',
          textAlign: 'left',
          minHeight: 260,
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: current.color }}>{current.roleName}</span>
          <h3 style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 12px', letterSpacing: '-0.6px' }}>{current.label}</h3>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 24px' }}>{current.description}</p>
          <Link
            href="/login?mode=register"
            style={{
              display: 'inline-block',
              padding: '12px 18px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
              color: current.id === 'organizer' ? '#fff' : '#04120e',
              background: current.id === 'organizer' ? 'var(--violet-cta)' : current.color,
            }}
          >
            {current.cta}
          </Link>
        </div>
        <div style={{ padding: '24px 20px', borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {JOURNEYS[activeTab].map(([number, title, detail]) => (
              <div key={title} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    margin: '0 auto 10px',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    background: '#090b13',
                    border: `1px solid ${current.color}66`,
                    color: current.color,
                    fontWeight: 700,
                    fontSize: 12.5,
                  }}
                >
                  {number}
                </div>
                <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: 'rgba(255,255,255,.75)' }}>{title}</p>
                <span style={{ display: 'block', fontSize: 10.5, lineHeight: 1.4, color: 'var(--text-faint)', marginTop: 4 }}>{detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
