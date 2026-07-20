'use client'

import Link from 'next/link'
import type { EventActionKey, OrganizerEventView } from './types'

// Port de EventDashboardCard (MesEvenementsPage.jsx lignes 208-236) — carte
// d'un événement "en cours" avec sa grille d'actions rapides (EVENT_ACTIONS,
// lignes 187-199 du legacy).
const ACTIONS: { key: EventActionKey; label: string; color: string }[] = [
  { key: 'stats', label: 'Statistiques', color: 'var(--teal)' },
  { key: 'bookings', label: 'Réservations', color: 'var(--gold)' },
  { key: 'boost', label: 'Booster', color: 'var(--pink)' },
  { key: 'guests', label: 'Guestlist', color: 'var(--teal)' },
  { key: 'staff', label: 'Équipe', color: 'var(--gold)' },
  { key: 'promo', label: 'Codes promo', color: 'var(--violet)' },
  { key: 'codes', label: 'Codes', color: 'rgba(255,255,255,0.85)' },
  { key: 'duplicate', label: 'Dupliquer', color: 'var(--violet)' },
  { key: 'edit', label: 'Modifier', color: 'var(--gold)' },
  { key: 'postpone', label: 'Reporter', color: 'var(--gold)' },
  { key: 'delete', label: 'Supprimer / Annuler', color: '#e05aaa' },
]

function statusBadge(event: OrganizerEventView): { label: string; background: string; color: string } {
  if (event.cancelled) return { label: 'Annulé', background: 'var(--pink)', color: '#fff' }
  if (event.postponed) return { label: 'Reporté', background: 'var(--gold)', color: 'var(--obsidian)' }
  if (event.publishAt && new Date(event.publishAt).getTime() > Date.now()) return { label: 'Programmé', background: 'var(--violet)', color: '#fff' }
  return { label: 'Publié', background: 'var(--teal)', color: 'var(--obsidian)' }
}

export default function EventDashboardCard({ event, onAction }: { event: OrganizerEventView; onAction: (action: EventActionKey, event: OrganizerEventView) => void }) {
  const actions = ACTIONS.filter((a) => a.key !== 'codes' || event.isPrivate)
  const badge = statusBadge(event)

  return (
    <article
      style={{
        border: '1px solid var(--border)',
        borderRadius: 16,
        background: 'var(--surface)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 150, background: event.imageUrl ? `url(${event.imageUrl}) center/cover` : '#10131d', position: 'relative', display: 'grid', placeItems: 'center' }}>
        {!event.imageUrl && (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth={1.6} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l2.6 6.6L22 10l-6 5 1.5 7-5.5-3.6L6.5 22 8 15 2 10l7.4-1.4z" />
          </svg>
        )}
        <span
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            padding: '4px 10px',
            borderRadius: 999,
            font: '700 10px Inter, sans-serif',
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: badge.color,
            background: badge.background,
          }}
        >
          {badge.label}
        </span>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <h3 style={{ font: '600 19px Inter, sans-serif', color: '#fff', margin: '0 0 4px' }}>{event.name}</h3>
        <p style={{ font: '500 12px Inter, sans-serif', color: 'var(--text-muted)', margin: '0 0 8px' }}>
          {event.dateDisplay || event.date} · {event.city}
        </p>
        <Link
          href={`/events/${event.id}`}
          style={{ font: '600 11.5px Inter, sans-serif', color: 'var(--gold)', textDecoration: 'none' }}
        >
          Voir la page de l&rsquo;événement →
        </Link>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => onAction(action.key, event)}
              style={{
                padding: '9px 8px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.04)',
                color: action.color,
                font: '600 11.5px Inter, sans-serif',
                letterSpacing: '.02em',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}
