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
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
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
  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Event',
        '@id': `${publicUrl}#event`,
        name: event.name,
        description: event.description || event.subtitle || undefined,
        image: event.imageUrl ? [event.imageUrl] : undefined,
        url: publicUrl,
        startDate: event.date ? `${event.date}T${event.time || '00:00'}:00` : undefined,
        eventStatus: event.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: event.location || event.city || event.region ? {
          '@type': 'Place',
          name: event.location || event.city || event.region,
          address: {
            '@type': 'PostalAddress',
            addressLocality: event.city || undefined,
            addressRegion: event.region || undefined,
          },
        } : undefined,
        organizer: {
          '@type': 'Organization',
          name: organizerProfile?.publicName || event.organizerName || event.organizer || 'LIVEINBLACK',
          url: organizerProfile?.slug ? `${SITE}/organizers/${organizerProfile.slug}` : undefined,
        },
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
      ) : <div className={styles.breadcrumb} style={{ padding: '18px 0 0', fontSize: 12.5, color: 'var(--text-faint)' }}>
        <Link href="/events" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
          Événements
        </Link>
        {event.city && <span> · {event.city}</span>}
        <span> · {event.name}</span>
      </div>}

      {/* HERO */}
      {/* Hauteur fixe (~1/3 de l'ancien aspectRatio 16/9, retour client) au
          lieu d'un aspectRatio qui poussait description/line-up/organisateur/
          lieu trop bas sur desktop comme mobile. */}
      <div className={styles.hero} style={{ position: 'relative', margin: '14px 0 0', borderRadius: 18, overflow: 'hidden', height: 130, background: `linear-gradient(135deg, ${event.color || '#b8f34a'}99, var(--surface))` }}>
        <Image
          src={event.imageUrl || placeholderPhotoUrl(event.id, 880, 495)}
          alt={event.name}
          fill
          loading="eager"
          className={styles.heroImage}
          style={{ objectFit: 'cover' }}
          sizes="(max-width: 768px) 100vw, 880px"
        />
        <div className={styles.heroOverlay} style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,4,11,.92), transparent 55%)' }} />
        <div className={styles.heroActions} style={{ position: 'absolute', top: 14, right: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <EventShareButton eventName={event.name} />
          <EventInterestButtonClient eventId={event.id} initialInterested={interestState.interested} isAuthenticated={Boolean(session?.user)} floating />
        </div>
        <div className={styles.heroCopy} style={{ position: 'absolute', left: 20, right: 20, bottom: 16 }}>
          {event.cancelled && (
            <span style={{ display: 'inline-block', marginBottom: 8, fontSize: 11, fontWeight: 800, color: '#fff', background: 'var(--pink)', padding: '4px 10px', borderRadius: 999 }}>ANNULÉ</span>
          )}
          {/* Ombre resserrée (6px vs 12px) : un flou large sur une police
              condensée à traits fins, posée sur une photo, se lisait comme un
              double contour fantôme plutôt qu'une vraie ombre portée. */}
          <h1 className={`font-display ${styles.title}`} style={{ fontSize: 'clamp(26px, 6vw, 44px)', margin: 0, letterSpacing: '.01em', textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>{event.name}</h1>
          {event.subtitle && <p className={styles.subtitle} style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0' }}>{event.subtitle}</p>}
          {event.tags?.length ? (
            <div className={styles.tags} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
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
      <div className={styles.quickInfo} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 22px 0' }}>
        {countdown && <Chip label={countdown} tone={urgent ? 'urgent' : 'default'} />}
        {stock && <Chip label={stock.label} color={stock.color} ink={stock.ink} />}
        <Chip label={[event.dateDisplay, event.time].filter(Boolean).join(' · ')} />
        {event.location && <Chip label={event.location} />}
        {event.minAge ? <Chip label={`${event.minAge}+`} /> : null}
      </div>

      {event.playlist && (
        <div style={{ padding: '14px 22px 0' }}>
          <Link
            href={session?.user ? `/playlist/${event.id}` : `/login?next=${encodeURIComponent(`/playlist/${event.id}`)}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 15px', borderRadius: 999, border: '1px solid rgba(224,90,170,.35)', background: 'rgba(224,90,170,.1)', color: 'var(--pink)', fontSize: 12.5, fontWeight: 800, textDecoration: 'none' }}
          >
            Playlist interactive · Proposer un son
          </Link>
        </div>
      )}

      {/* DESCRIPTION / LINE-UP / ORGANISATEUR / LIEU — regroupés dans une
          grille responsive (retour client : bloc trop étiré verticalement en
          empilant chaque section pleine largeur) au lieu d'un empilement
          strict. Pattern auto-fit/minmax déjà utilisé ailleurs dans l'app
          (voir app/globals.css et ex. app/(app)/profile/ProfilClient.tsx). */}
      {/* L'Organisateur est toujours rendu (fallback texte), donc cette
          grille est toujours affichée — pas de condition supplémentaire ici. */}
      <div className={styles.contentGrid} style={{ padding: '0 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 8, alignItems: 'start' }}>
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
                    <Image src={organizerProfile.avatarUrl} alt="" width={40} height={40} style={{ objectFit: 'cover' }} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                <a
                  href={`https://www.google.com/maps/search/${encodeURIComponent([event.location, event.city].filter(Boolean).join(', '))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 13, color: 'var(--teal)', textDecoration: 'none' }}
                >
                  Ouvrir dans Google Maps →
                </a>
              </div>
              <EventVenueMap address={[event.location, event.city, event.region].filter(Boolean).join(', ')} />
            </Section>
          )}
      </div>

      {/* PLACES (lecture seule pour les visiteurs non connectés — la version
          interactive/cliquable est EventCheckoutPanel ci-dessous, réservée
          aux utilisateurs connectés) */}
      {!session?.user && event.places?.length ? (
        <Section title="Places">
          {bookingDisabledReason && (
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--pink)', margin: '0 0 12px' }}>Réservations fermées — {bookingDisabledReason}</p>
          )}
          <div className="lb-card-grid">
            {event.places.map((place) => {
              const fillPct = place.total > 0 ? Math.round(((place.total - place.available) / place.total) * 100) : 0
              return (
                <Card key={place.id} style={{ padding: 16 }}>
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
                </Card>
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
          <div className="lb-card-grid">
            {event.menu.filter((item) => item.available !== false).map((item) => (
              <Card key={item.name} style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13, fontWeight: 700 }}>
                    {item.imageUrl ? <Image src={item.imageUrl} alt="" width={34} height={34} style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} /> : item.emoji ? <span aria-hidden="true">{item.emoji}</span> : null}
                    {item.name}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{fmtMoney(item.price, currency)}</span>
                </div>
                {item.description && <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '4px 0 0' }}>{item.description}</p>}
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
              style={{ display: 'inline-block', padding: '15px 32px', borderRadius: 3, fontSize: 14, fontWeight: 500, textTransform: 'none', letterSpacing: 'normal', color: 'var(--primary-ink)', background: 'var(--teal-solid)', textDecoration: 'none' }}
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
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lb-detail-section">
      <h2 style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', fontFamily: 'var(--font-display), sans-serif', color: 'var(--teal)', margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  )
}

function Chip({ label, tone, color, ink }: { label: string; tone?: 'urgent' | 'default'; color?: string; ink?: string }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        padding: '5px 11px',
        borderRadius: 999,
        color: ink || (tone === 'urgent' ? '#fff' : 'var(--text)'),
        background: color ? color : tone === 'urgent' ? 'var(--pink)' : 'var(--surface)',
        border: color || tone === 'urgent' ? 'none' : '1px solid var(--border)',
      }}
    >
      {label}
    </span>
  )
}
