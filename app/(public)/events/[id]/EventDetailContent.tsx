import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { getEventById } from '@/lib/server/events/events'
import { getPublicOrganizerByUserId } from '@/lib/server/organizer/organizers'
import { isEventInterested } from '@/lib/server/events/eventInterests'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { getEventCountdown, isCountdownUrgent, getStockBadge } from '@/lib/shared/eventUrgency'
import { isEventEnded } from '@/lib/shared/event-time'
import { normalizeShowOptions } from '@/lib/shared/showOptions'
import { reliablePhotoUrl } from '@/lib/shared/placeholderImage'
import { canBook as canBookFn, getBookingBlockedReason } from '@/lib/server/permissions'
import { EventCheckoutPanel, EventInterestButtonClient, ResaleListingsSection } from '@/app/components/features'
import AgeVerificationGate from '@/app/components/layout/AgeVerificationGate'
import EventShareButton from './EventShareButton'
import EventVenueMap from './EventVenueMap'
import { Card } from '@/app/components/ui'
import styles from './EventDetailContent.module.css'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Contenu partagé entre la page dédiée (app/(public)/events/[id]/page.tsx) et
// la route interceptée qui l'affiche en modal glissante depuis les listes
// (app/(public)/@modal/(.)events/[id]/page.tsx). Le fetch de données et le
// rendu vivent ici une seule fois ; seul le wrapper (<main> plein-page vs.
// coquille de modal) diffère entre les deux appelants.

export async function resolveEvent(id: string) {
  return getEventById(id)
}

export default async function EventDetailContent({
  id,
  paiement,
  presentation = 'page',
}: {
  id: string
  paiement?: string
  presentation?: 'page' | 'modal'
}) {
  const result = await resolveEvent(id)

  if (result.status === 'not_found') notFound()

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
  const publicUrl = `${SITE}/events/${event.id}`
  const prices = (event.places || []).map((place) => Number(place.price)).filter(Number.isFinite)
  const minimumPrice = prices.length > 0 ? Math.min(...prices) : null
  const keywordSet = new Set(
    [
      event.category,
      event.eventType,
      event.city,
      event.region,
      ...(event.tags || []),
      ...(event.musicStyles || []),
      ...(event.ambiances || []),
      'événement au Bénin',
      'soirée au Bénin',
      'billetterie LIVEINBLACK',
    ].filter((value): value is string => Boolean(value?.trim()))
  )
  const performerNames = [
    ...(event.artists || []).map((artist) => artist.name),
    event.dj,
    ...(event.performers || []),
  ].filter((value): value is string => Boolean(value?.trim()))
  const performerSet = new Set(performerNames)
  const startDateTime = event.date ? `${event.date}T${event.time || '00:00'}:00` : undefined
  const endDateTime = event.date && event.endTime
    ? `${event.endTime <= (event.time || '00:00') ? new Date(new Date(`${event.date}T00:00:00`).getTime() + 86_400_000).toISOString().slice(0, 10) : event.date}T${event.endTime}:00`
    : undefined
  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Event',
        '@id': `${publicUrl}#event`,
        name: event.name,
        description: event.description || event.subtitle || undefined,
        keywords: [...keywordSet].join(', '),
        image: event.imageUrl ? [event.imageUrl] : undefined,
        url: publicUrl,
        startDate: startDateTime,
        endDate: endDateTime,
        eventStatus: event.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: event.location || event.city || event.region ? {
          '@type': 'Place',
          name: event.location || event.city || event.region,
          address: {
            '@type': 'PostalAddress',
            addressLocality: event.city || undefined,
            addressRegion: event.region || undefined,
            addressCountry: 'BJ',
          },
        } : undefined,
        organizer: {
          '@type': 'Organization',
          name: organizerProfile?.publicName || event.organizerName || event.organizer || 'LIVEINBLACK',
          url: organizerProfile?.slug ? `${SITE}/organizers/${organizerProfile.slug}` : undefined,
        },
        performer: [...performerSet].map((name) => ({ '@type': 'Person', name })),
        offers: minimumPrice != null ? {
          '@type': 'Offer',
          url: publicUrl,
          price: minimumPrice,
          priceCurrency: currency,
          availability: soldOut ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
        } : undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/home` },
          { '@type': 'ListItem', position: 2, name: 'Événements', item: `${SITE}/events` },
          { '@type': 'ListItem', position: 3, name: event.name, item: publicUrl },
        ],
      },
    ],
  }

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
    cancellationOptionEnabled: Boolean(p.cancellationOptionEnabled),
    photos: p.photos ?? [],
    included: p.included ?? [],
  }))
  const checkoutMenu = (event.menu || []).filter((m) => m.available !== false).map((m) => ({
    name: m.name,
    emoji: m.emoji || '',
    imageUrl: m.imageUrl || null,
    price: m.price ?? 0,
    description: m.description || '',
    hasShow: Boolean(m.hasShow),
    showOptions: normalizeShowOptions(m.showOptions),
    excludedPlaces: m.excludedPlaces ?? [],
  }))

  const isModal = presentation === 'modal'

  return (
    <div className={isModal ? styles.modalRoot : styles.pageRoot}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd).replace(/</g, '\\u003c') }} />
      {isModal ? (
        <div className={styles.modalToolbar}>
          <div>
            <small>Détails de l’événement</small>
            <strong>{[event.city, event.category].filter(Boolean).join(' · ') || 'LIVEINBLACK'}</strong>
          </div>
        </div>
      ) : <div className={styles.breadcrumb} style={{ padding: '18px 0 0', fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-faint)' }}>
        <Link href="/events" style={{ minHeight: 38, display: 'inline-flex', alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
          Événements
        </Link>
        {event.city && <span> · {event.city}</span>}
        <span> · {event.name}</span>
      </div>}

      {/* HERO */}
      <div className={styles.hero} style={{ position: 'relative', margin: '12px 0 0', borderRadius: 20, overflow: 'hidden', height: 220, background: 'var(--surface-2)', boxShadow: '0 16px 48px rgba(var(--black-rgb), .32)' }}>
        <Image
          src={reliablePhotoUrl(event.imageUrl, event.id, 880, 495)}
          alt={event.name}
          fill
          loading="eager"
          className={styles.heroImage}
          style={{ objectFit: 'cover' }}
          sizes="(max-width: 768px) 100vw, 880px"
        />
        <div className={styles.heroOverlay} style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 35%, var(--media-scrim-strong) 100%)' }} />
        <div className={styles.heroActions} style={{ position: 'absolute', top: 12, right: isModal ? 68 : 12, display: 'flex', alignItems: 'center', gap: 8, zIndex: 10 }}>
          <EventShareButton eventName={event.name} />
          <EventInterestButtonClient eventId={event.id} initialInterested={interestState.interested} isAuthenticated={Boolean(session?.user)} floating />
        </div>
        <div className={styles.heroCopy} style={{ position: 'absolute', left: 18, right: 18, bottom: 16 }}>
          {event.cancelled && (
            <span style={{ display: 'inline-block', marginBottom: 8, fontSize: 'var(--font-size-footnote)', fontWeight: 800, color: 'var(--text)', background: 'var(--pink)', padding: '4px 12px', borderRadius: 999 }}>ANNULÉ</span>
          )}
          <h1 className={`font-display ${styles.title}`} style={{ fontSize: 'clamp(26px, 3.2vw, 36px)', margin: 0, letterSpacing: '-.02em', lineHeight: 1.2, textShadow: '0 2px 8px rgba(var(--black-rgb), .80)', color: 'var(--text)' }}>{event.name}</h1>
          {event.subtitle && <p className={styles.subtitle} style={{ fontSize: 'var(--font-size-headline-lg)', color: 'var(--text)', margin: '6px 0 0', lineHeight: 1.4 }}>{event.subtitle}</p>}
          {event.tags?.length ? (
            <div className={styles.tags} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {event.tags.map((tag) => (
                <span key={tag} style={{ fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700, color: 'var(--text)', background: 'var(--border-strong)', padding: '3px 10px', borderRadius: 999 }}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* QUICK INFO STRIP */}
      <div className={styles.quickInfo} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 16px 0' }}>
        {countdown && <Chip label={countdown} tone={urgent ? 'urgent' : 'default'} />}
        {stock && <Chip label={stock.label} color={stock.color} ink={stock.ink} />}
        <Chip label={[event.dateDisplay, event.time].filter(Boolean).join(' · ')} />
        {event.location && <Chip label={event.location} />}
        {event.minAge ? <Chip label={`${event.minAge}+`} /> : null}
      </div>

      {event.playlist && (
        <div style={{ padding: '12px 16px 0' }}>
          <Link
            href={session?.user ? `/playlist/${event.id}` : `/login?next=${encodeURIComponent(`/playlist/${event.id}`)}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--primary-a35)', background: 'var(--primary-a12)', color: 'var(--primary)', fontSize: 'var(--font-size-body)', fontWeight: 800, textDecoration: 'none' }}
          >
            🎵 Playlist interactive · Proposer un son
          </Link>
        </div>
      )}

      <div className={styles.contentGrid} style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14, alignItems: 'start', marginTop: 12 }}>
          {/* DESCRIPTION */}
          {event.description && (
            <Section title="Description">
              <p style={{ fontSize: 'var(--font-size-headline-xl)', color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', margin: 0 }}>{event.description}</p>
            </Section>
          )}

          {/* ARTISTS */}
          {(event.artists?.length || event.dj) ? (
            <Section title="Line-up">
              {event.artists?.length ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {event.artists.map((a) => (
                    <li key={a.name} style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px' }}>
                      <strong>{a.name}</strong> <span style={{ color: 'var(--text-muted)' }}>· {a.role}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 'var(--font-size-headline)', color: 'var(--text-muted)' }}>{event.dj}</p>
              )}
            </Section>
          ) : null}

          {/* ORGANIZER */}
          <Section title="Organisateur">
            {organizerProfile ? (
              <Link href={`/organizers/${organizerProfile.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: 'var(--primary)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 'var(--font-size-headline-lg)',
                    color: 'var(--primary-ink)',
                  }}
                >
                  {organizerProfile.avatarUrl ? (
                    <Image src={organizerProfile.avatarUrl} alt="" width={44} height={44} style={{ objectFit: 'cover' }} />
                  ) : (
                    organizerProfile.publicName?.[0]?.toUpperCase() || '?'
                  )}
                </div>
                <span style={{ fontSize: 'var(--font-size-headline-xl)', fontWeight: 750, color: 'var(--text)' }}>{organizerProfile.publicName}</span>
              </Link>
            ) : (
              <p style={{ fontSize: 'var(--font-size-headline)', color: 'var(--text-muted)' }}>{event.organizerName || event.organizer || 'Organisateur'}</p>
            )}
          </Section>

          {/* VENUE */}
          {(event.location || event.city) && (
            <Section title="Lieu">
              <p style={{ fontSize: 'var(--font-size-headline)', color: 'var(--text)', margin: 0, fontWeight: 600 }}>{[event.location, event.city, event.region].filter(Boolean).join(', ')}</p>
              <EventVenueMap address={[event.location, event.city, event.region].filter(Boolean).join(', ')} />
            </Section>
          )}
      </div>

      {!session?.user && event.places?.length ? (
        <Section title="Places">
          {bookingDisabledReason && (
            <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 700, color: 'var(--pink)', margin: '0 0 10px' }}>Réservations fermées — {bookingDisabledReason}</p>
          )}
          <div className="lb-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 12, marginTop: 8 }}>
            {event.places.map((place) => {
              const fillPct = place.total > 0 ? Math.round(((place.total - place.available) / place.total) * 100) : 0
              return (
                <Card key={place.id} style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 18, background: 'var(--surface-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 'var(--font-size-headline-xl)', fontWeight: 750, color: 'var(--text)' }}>{place.type}</span>
                    <span style={{ fontSize: 'var(--font-size-headline-xl)', fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(place.price, currency)}</span>
                  </div>
                  {place.groupType === 'group' && (
                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-a14)', padding: '3px 10px', borderRadius: 999 }}>
                      Place de groupe · {place.groupMin}-{place.groupMax} pers.
                    </span>
                  )}
                  <p style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    {place.available > 0 ? `${place.available}/${place.total} restantes` : 'Complet'}
                  </p>
                  <div style={{ height: 4, borderRadius: 999, background: 'var(--surface-2)', marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fillPct}%`, background: 'var(--primary)' }} />
                  </div>
                </Card>
              )
            })}
          </div>
        </Section>
      ) : null}

      {!session?.user && event.menu?.length ? (
        <Section title="Carte / précommande">
          <div className="lb-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 12, marginTop: 8 }}>
            {event.menu.filter((item) => item.available !== false).map((item) => (
              <Card key={item.name} style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 18, background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 'var(--font-size-headline)', fontWeight: 750, color: 'var(--text)' }}>
                    {item.imageUrl ? <Image src={item.imageUrl} alt="" width={32} height={32} style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} /> : item.emoji ? <span aria-hidden="true">{item.emoji}</span> : null}
                    {item.name}
                  </span>
                  <span style={{ fontSize: 'var(--font-size-headline)', fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(item.price, currency)}</span>
                </div>
                {item.description && <p style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>{item.description}</p>}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      <ResaleListingsSection eventId={event.id} isAuthenticated={Boolean(session?.user)} />

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
          closingDate={event.closingDate ? new Date(event.closingDate).toISOString() : null}
        />
      ) : checkoutPlaces.length > 0 ? (
        <div style={{ padding: '20px 16px 0', textAlign: 'center' }}>
          {bookingDisabledReason ? (
            <p style={{ display: 'inline-block', padding: '12px 22px', borderRadius: 999, fontSize: 'var(--font-size-body-sm)', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}>
              {bookingDisabledReason}
            </p>
          ) : (event.minAge || 0) >= 18 ? (
            <AgeVerificationGate minAge={event.minAge || 18} href={loginHref} label="Se connecter pour réserver" />
          ) : (
            <Link
              href={loginHref}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, padding: '12px 28px', borderRadius: 14, fontSize: 'var(--font-size-headline-xl)', fontWeight: 750, color: 'var(--primary-ink)', background: 'var(--primary)', textDecoration: 'none', boxShadow: '0 6px 20px var(--primary-a28)' }}
            >
              Se connecter pour réserver
            </Link>
          )}
          {!bookingDisabledReason && (
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', marginTop: 8 }}>Connecte-toi avec un compte client pour réserver une place.</p>
          )}
        </div>
      ) : !session?.user ? (
        <div style={{ padding: '20px 16px 0', textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--font-size-body-lg)', color: 'var(--text-muted)' }}>La billetterie n&apos;est pas encore disponible pour cet événement.</p>
        </div>
      ) : null}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lb-detail-section" style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 'var(--font-size-body)', fontWeight: 800, margin: '0 0 10px', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-display), sans-serif' }}>{title}</h2>
      {children}
    </section>
  )
}

function Chip({ label, tone, color, ink }: { label: string; tone?: 'urgent' | 'default'; color?: string; ink?: string }) {
  return (
    <span
      style={{
        fontSize: 'var(--font-size-callout)',
        fontWeight: 700,
        padding: '5px 12px',
        borderRadius: 999,
        color: ink || (tone === 'urgent' ? 'var(--text)' : 'var(--text)'),
        background: color ? color : tone === 'urgent' ? 'var(--pink)' : 'var(--surface-2)',
        border: color || tone === 'urgent' ? 'none' : '1px solid var(--border-strong)',
      }}
    >
      {label}
    </span>
  )
}
