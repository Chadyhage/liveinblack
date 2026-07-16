import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getEventById } from '@/lib/server/events'
import { getPublicOrganizerByUserId } from '@/lib/server/organizers'
import { verifyEventUnlockToken, unlockCookieName } from '@/lib/server/eventUnlock'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { getEventCountdown, isCountdownUrgent, getStockBadge } from '@/lib/shared/eventUrgency'
import UnlockForm from './UnlockForm'

// Port LECTURE SEULE de src/pages/EventDetailPage.jsx (2861 lignes côté
// legacy). Explicitement HORS PÉRIMÈTRE ici (déférré aux phases suivantes) :
// sélection de place + paiement, précommande interactive, code promo, prise
// de place de groupe, playlist, partage. Ce que ce fichier ajoute par rapport
// au legacy : méta SEO (aucune n'existait), et l'application RÉELLE (pas
// seulement UI) du blocage des événements privés — voir lib/server/events.ts.

async function resolveEvent(id: string) {
  const cookieStore = await cookies()
  const token = cookieStore.get(unlockCookieName(id))?.value
  const unlocked = verifyEventUnlockToken(id, token)
  return getEventById(id, { unlocked })
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const result = await resolveEvent(id)
  if (result.status !== 'ok') return { title: 'Événement — LIVEINBLACK' }
  const { event } = result
  return {
    title: `${event.name} — LIVEINBLACK`,
    description: event.description?.slice(0, 160) || event.subtitle || undefined,
    openGraph: {
      title: event.name,
      description: event.subtitle || undefined,
      images: event.imageUrl ? [event.imageUrl] : undefined,
    },
  }
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await resolveEvent(id)

  if (result.status === 'not_found') notFound()

  if (result.status === 'locked') {
    return (
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '80px 22px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Événement privé</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>Cet événement est sur invitation. Saisis le code d&apos;accès pour voir les détails.</p>
        <UnlockForm eventId={id} />
      </main>
    )
  }

  const { event } = result
  const organizerProfile = await getPublicOrganizerByUserId(event.organizerId)
  const currency = eventCurrency(event)
  const countdown = getEventCountdown(event)
  const urgent = isCountdownUrgent(event)
  const stock = getStockBadge(event)

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '0 0 60px', width: '100%' }}>
      <div style={{ padding: '18px 22px 0', fontSize: 12.5, color: 'var(--text-faint)' }}>
        {event.city && <span>{event.city} · </span>}
        <span>{event.name}</span>
      </div>

      {/* HERO */}
      <div style={{ position: 'relative', margin: '14px 22px 0', borderRadius: 18, overflow: 'hidden', aspectRatio: '16/9', background: `linear-gradient(135deg, ${event.color || '#c8a96e'}33, var(--obsidian))` }}>
        {event.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt={event.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,4,11,.92), transparent 55%)' }} />
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 16 }}>
          {event.cancelled && (
            <span style={{ display: 'inline-block', marginBottom: 8, fontSize: 11, fontWeight: 800, color: '#fff', background: 'var(--pink)', padding: '4px 10px', borderRadius: 999 }}>ANNULÉ</span>
          )}
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 34px)', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{event.name}</h1>
          {event.subtitle && <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0' }}>{event.subtitle}</p>}
          {event.tags?.length ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {event.tags.map((tag) => (
                <span key={tag} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text)', background: 'rgba(255,255,255,.1)', padding: '3px 9px', borderRadius: 999 }}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* QUICK INFO STRIP */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 22px 0' }}>
        {countdown && <Chip label={countdown} tone={urgent ? 'urgent' : 'default'} />}
        {stock && <Chip label={stock.label} color={stock.color} />}
        <Chip label={[event.dateDisplay, event.time].filter(Boolean).join(' · ')} />
        {event.location && <Chip label={event.location} />}
        {event.minAge ? <Chip label={`${event.minAge}+`} /> : null}
      </div>

      {/* DESCRIPTION */}
      {event.description && (
        <Section title="Description">
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{event.description}</p>
        </Section>
      )}

      {/* ARTISTS */}
      {(event.artists?.length || event.dj) ? (
        <Section title="Line-up">
          {event.artists?.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {event.artists.map((a) => (
                <li key={a.name} style={{ fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px' }}>
                  <strong>{a.name}</strong> <span style={{ color: 'var(--text-faint)' }}>· {a.role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{event.dj}</p>
          )}
        </Section>
      ) : null}

      {/* ORGANIZER */}
      <Section title="Organisateur">
        {organizerProfile ? (
          <Link href={`/organisateurs/${organizerProfile.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'var(--surface)', flexShrink: 0 }}>
              {organizerProfile.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={organizerProfile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{organizerProfile.publicName}</span>
          </Link>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{event.organizerName || event.organizer || 'Organisateur'}</p>
        )}
      </Section>

      {/* VENUE */}
      {(event.location || event.city) && (
        <Section title="Lieu">
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{[event.location, event.city, event.region].filter(Boolean).join(', ')}</p>
          <a
            href={`https://www.google.com/maps/search/${encodeURIComponent([event.location, event.city].filter(Boolean).join(', '))}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: 'var(--teal)', textDecoration: 'none' }}
          >
            Ouvrir dans Google Maps →
          </a>
        </Section>
      )}

      {/* PLACES */}
      {event.places?.length ? (
        <Section title="Places">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {event.places.map((place) => {
              const fillPct = place.total > 0 ? Math.round(((place.total - place.available) / place.total) * 100) : 0
              return (
                <div key={place.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{place.type}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(place.price, currency)}</span>
                  </div>
                  {place.groupType === 'group' && (
                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--violet)', background: 'rgba(139,92,246,.14)', padding: '2px 8px', borderRadius: 999 }}>
                      Place de groupe · {place.groupMin}-{place.groupMax} pers.
                    </span>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '8px 0 0' }}>
                    {place.available > 0 ? `${place.available}/${place.total} restantes` : 'Complet'}
                  </p>
                  <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,.08)', marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fillPct}%`, background: 'var(--gold)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {/* MENU (précommande, affichage seul) */}
      {event.menu?.length ? (
        <Section title="Carte / précommande">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {event.menu.map((item) => (
              <div key={item.name} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    {item.emoji ? `${item.emoji} ` : ''}
                    {item.name}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{fmtMoney(item.price, currency)}</span>
                </div>
                {item.description && <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '4px 0 0' }}>{item.description}</p>}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* CTA */}
      <div style={{ padding: '24px 22px 0', textAlign: 'center' }}>
        <Link
          href={`/connexion?mode=register&next=${encodeURIComponent(`/evenements/${event.id}`)}`}
          style={{ display: 'inline-block', padding: '14px 32px', borderRadius: 999, fontSize: 14, fontWeight: 700, color: '#04120e', background: 'var(--teal-solid)', textDecoration: 'none' }}
        >
          Se connecter pour réserver
        </Link>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 10 }}>La réservation en ligne arrive dans une prochaine étape de la migration.</p>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '22px 22px 0' }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>{title}</h2>
      {children}
    </section>
  )
}

function Chip({ label, tone, color }: { label: string; tone?: 'urgent' | 'default'; color?: string }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        padding: '5px 11px',
        borderRadius: 999,
        color: tone === 'urgent' ? '#fff' : 'var(--text)',
        background: color ? color : tone === 'urgent' ? 'var(--pink)' : 'var(--surface)',
        border: color || tone === 'urgent' ? 'none' : '1px solid var(--border)',
      }}
    >
      {label}
    </span>
  )
}
