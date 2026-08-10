'use client'

import Link from 'next/link'
import { Button } from '@/app/components/ui'
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
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
  { key: 'duplicate', label: 'Dupliquer', color: 'var(--violet)' },
  { key: 'edit', label: 'Modifier', color: 'var(--gold)' },
  { key: 'postpone', label: 'Reporter', color: 'var(--gold)' },
  { key: 'delete', label: 'Supprimer / Annuler', color: '#e05aaa' },
]
const PRIMARY_ACTION_KEYS = new Set<EventActionKey>(['stats', 'bookings', 'edit', 'staff'])

function statusBadge(event: OrganizerEventView): { label: string; background: string; color: string } {
  if (event.cancelled) return { label: 'Annulé', background: 'var(--pink)', color: '#fff' }
  if (event.postponed) return { label: 'Reporté', background: 'var(--gold)', color: 'var(--obsidian)' }
  if (event.publishAt && new Date(event.publishAt).getTime() > Date.now()) return { label: 'Programmé', background: 'var(--violet)', color: '#fff' }
  return { label: 'Publié', background: 'var(--teal)', color: 'var(--obsidian)' }
}

export default function EventDashboardCard({
  event,
  onAction,
  duplicating = false,
}: {
  event: OrganizerEventView
  onAction: (action: EventActionKey, event: OrganizerEventView) => void
  duplicating?: boolean
}) {
  const badge = statusBadge(event)

  return (
    <article
      style={{
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xl)',
        background: 'linear-gradient(180deg,var(--surface-2),var(--surface))',
        boxShadow: '0 18px 48px rgba(0,0,0,0.24)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 220, background: `url(${event.imageUrl || placeholderPhotoUrl(event.id, 640, 220)}) center/cover`, position: 'relative', display: 'grid', placeItems: 'center' }}>
        <span
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            padding: '4px 10px',
            borderRadius: 999,
            font: '700 10px var(--font-open-sans)',
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: badge.color,
            background: badge.background,
          }}
        >
          {badge.label}
        </span>
      </div>
      <div style={{ padding: '22px 22px 24px' }}>
        <h3 style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 800, color: '#fff', margin: '0 0 7px' }}>{event.name}</h3>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 10px' }}>
          {event.dateDisplay || event.date} · {event.city}
        </p>
        <Link
          href={`/events/${event.id}`}
          style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', font: '600 12.5px var(--font-open-sans)', color: 'var(--gold)', textDecoration: 'none' }}
        >
          Voir la page de l&rsquo;événement →
        </Link>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          {ACTIONS.filter((action) => PRIMARY_ACTION_KEYS.has(action.key)).map((action) => {
            // 'duplicate' n'a pas de modale de confirmation (contrairement à
            // 'delete'/'postpone') — un double-clic pendant la requête POST
            // en cours créait deux événements dupliqués. Les autres actions
            // ouvrent toutes une modale/navigation, pas de risque équivalent.
            const isDuplicating = action.key === 'duplicate' && duplicating
            return (
              <Button
                key={action.key}
                variant="secondary"
                onClick={() => onAction(action.key, event)}
                disabled={isDuplicating}
                loading={isDuplicating}
                loadingText="Duplication…"
                style={{
                  minHeight: 44,
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.04)',
                  color: action.color,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: '.02em',
                  textAlign: 'left',
                  justifyContent: 'flex-start',
                }}
              >
                {action.label}
              </Button>
            )
          })}
        </div>
        <details style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,.025)', overflow: 'hidden' }}>
          <summary style={{ minHeight: 46, display: 'flex', alignItems: 'center', padding: '0 14px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, fontWeight: 750 }}>
            Plus d’actions
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 12px 12px' }}>
            {ACTIONS.filter((action) => !PRIMARY_ACTION_KEYS.has(action.key)).map((action) => {
              const isDuplicating = action.key === 'duplicate' && duplicating
              return (
                <Button
                  key={action.key}
                  variant="secondary"
                  onClick={() => onAction(action.key, event)}
                  disabled={isDuplicating}
                  loading={isDuplicating}
                  loadingText="Duplication…"
                  style={{ minHeight: 44, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,.04)', color: action.color, fontSize: 12.5, fontWeight: 700, textAlign: 'left', justifyContent: 'flex-start' }}
                >
                  {action.label}
                </Button>
              )
            })}
          </div>
        </details>
      </div>
    </article>
  )
}
