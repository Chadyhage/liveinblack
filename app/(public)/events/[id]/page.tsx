import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { auth } from '@/auth'
import { getEventById } from '@/lib/server/events'
import { getPublicOrganizerByUserId } from '@/lib/server/organizers'
import { verifyEventUnlockToken, unlockCookieName } from '@/lib/server/eventUnlock'
import { isEventInterested } from '@/lib/server/eventInterests'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { getEventCountdown, isCountdownUrgent, getStockBadge } from '@/lib/shared/eventUrgency'
import { isEventEnded } from '@/lib/shared/event-time'
import { canBook as canBookFn, getBookingBlockedReason } from '@/lib/server/permissions'
import UnlockForm from './UnlockForm'
import EventInterestButtonClient from '@/app/components/EventInterestButtonClient'
import AgeVerificationGate from '@/app/components/AgeVerificationGate'
import EventCheckoutPanel from '@/app/components/EventCheckoutPanel'

// Port de src/pages/EventDetailPage.jsx (2861 lignes côté legacy). Explicitement
// HORS PÉRIMÈTRE ici (déférré) : playlist, partage (le bouton "Partager" du
// hero legacy n'est pas encore porté — seul le bouton "Intéressé", #6 phase
// profil, l'est ici). La sélection de place + paiement (#119) est portée par
// EventCheckoutPanel — voir son en-tête pour le détail des simplifications
// assumées par rapport au legacy. Ce que ce fichier ajoute par rapport au
// legacy : méta SEO (aucune n'existait), et l'application RÉELLE (pas
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

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ paiement?: string }>
}) {
  const { id } = await params
  const { paiement } = await searchParams
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
  const session = await auth()
  const [organizerProfile, interestState] = await Promise.all([
    getPublicOrganizerByUserId(event.organizerId),
    session?.user ? isEventInterested({ id: session.user.id }, { eventId: event.id }) : Promise.resolve({ ok: true as const, interested: false }),
  ])
  const currency = eventCurrency(event)
  const countdown = getEventCountdown(event)
  const urgent = isCountdownUrgent(event)
  const stock = getStockBadge(event)

  const loginHref = `/login?mode=register&next=${encodeURIComponent(`/events/${event.id}`)}`
  const permissionUser = session?.user
    ? { activeRole: session.user.activeRole, status: session.user.status, orgStatus: session.user.orgStatus, prestStatus: session.user.prestStatus }
    : null
  const canBook = canBookFn(permissionUser)
  const blockedReason = session?.user ? getBookingBlockedReason(permissionUser) : null

  const soldOut = (event.places?.length ?? 0) > 0 && event.places!.every((p) => (p.available ?? 0) === 0)
  const bookingDisabledReason = event.cancelled ? 'Événement annulé' : soldOut ? 'Complet' : isEventEnded(event) ? 'Réservations closes' : null

  const checkoutPlaces = (event.places || []).map((p) => ({
    id: p.id,
    type: p.type,
    price: p.price ?? 0,
    available: p.available ?? 0,
    total: p.total ?? 0,
    maxPerAccount: p.maxPerAccount ?? 0,
    groupType: (p.groupType === 'group' ? 'group' : 'solo') as 'group' | 'solo',
    groupMin: p.groupMin ?? 0,
    groupMax: p.groupMax ?? 0,
    included: p.included ?? [],
  }))
  const checkoutMenu = (event.menu || []).map((m) => ({
    name: m.name,
    emoji: m.emoji || '',
    price: m.price ?? 0,
    description: m.description || '',
    excludedPlaces: m.excludedPlaces ?? [],
  }))

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '0 0 60px', width: '100%' }}>
      <div style={{ padding: '18px 22px 0', fontSize: 12.5, color: 'var(--text-faint)' }}>
        <Link href="/events" style={{ color: 'inherit', textDecoration: 'none' }}>
          Événements
        </Link>
        {event.city && <span> · {event.city}</span>}
        <span> · {event.name}</span>
      </div>

      {/* HERO */}
      <div style={{ position: 'relative', margin: '14px 22px 0', borderRadius: 18, overflow: 'hidden', aspectRatio: '16/9', background: `linear-gradient(135deg, ${event.color || '#c8a96e'}99, var(--surface))` }}>
        {event.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt={event.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,4,11,.92), transparent 55%)' }} />
        <div style={{ position: 'absolute', top: 14, right: 14 }}>
          <EventInterestButtonClient eventId={event.id} initialInterested={interestState.interested} isAuthenticated={Boolean(session?.user)} floating />
        </div>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 16 }}>
          {event.cancelled && (
            <span style={{ display: 'inline-block', marginBottom: 8, fontSize: 11, fontWeight: 800, color: '#fff', background: 'var(--pink)', padding: '4px 10px', borderRadius: 999 }}>ANNULÉ</span>
          )}
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 34px)', fontWeight: 800, margin: 0, letterSpacing: '-0.5px', textShadow: '0 2px 12px rgba(0,0,0,0.55)' }}>{event.name}</h1>
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
          <Link href={`/organizers/${organizerProfile.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                overflow: 'hidden',
                background: 'var(--surface)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 15,
                color: 'var(--text-muted)',
              }}
            >
              {organizerProfile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={organizerProfile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                organizerProfile.publicName?.[0]?.toUpperCase() || '?'
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

      {/* PLACES (lecture seule pour les visiteurs non connectés — la version
          interactive/cliquable est EventCheckoutPanel ci-dessous, réservée
          aux utilisateurs connectés) */}
      {!session?.user && event.places?.length ? (
        <Section title="Places">
          {bookingDisabledReason && (
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--pink)', margin: '0 0 12px' }}>Réservations fermées — {bookingDisabledReason}</p>
          )}
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

      {/* MENU (affichage seul pour les visiteurs non connectés — la
          précommande interactive vit dans EventCheckoutPanel une fois une
          place sélectionnée) */}
      {!session?.user && event.menu?.length ? (
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

      {/* RÉSERVATION */}
      {session?.user ? (
        <EventCheckoutPanel
          eventId={event.id}
          eventMinAge={event.minAge || 0}
          currency={currency}
          places={checkoutPlaces}
          menu={checkoutMenu}
          preorderEnabled={Boolean(event.preorder)}
          bookingDisabledReason={bookingDisabledReason}
          canBook={canBook}
          blockedReason={blockedReason}
          loginHref={loginHref}
          paymentCancelled={paiement === 'annule'}
        />
      ) : checkoutPlaces.length > 0 ? (
        <div style={{ padding: '24px 22px 0', textAlign: 'center' }}>
          {bookingDisabledReason ? (
            <p style={{ display: 'inline-block', padding: '14px 32px', borderRadius: 999, fontSize: 14, fontWeight: 700, color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {bookingDisabledReason}
            </p>
          ) : (event.minAge || 0) >= 18 ? (
            <AgeVerificationGate minAge={event.minAge || 18} href={loginHref} label="Se connecter pour réserver" />
          ) : (
            <Link
              href={loginHref}
              style={{ display: 'inline-block', padding: '14px 32px', borderRadius: 999, fontSize: 14, fontWeight: 700, color: '#04120e', background: 'var(--teal-solid)', textDecoration: 'none' }}
            >
              Se connecter pour réserver
            </Link>
          )}
          {!bookingDisabledReason && (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 10 }}>Connecte-toi avec un compte client pour réserver une place.</p>
          )}
        </div>
      ) : !session?.user ? (
        <div style={{ padding: '24px 22px 0', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>La billetterie n&apos;est pas encore disponible pour cet événement.</p>
        </div>
      ) : null}
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
