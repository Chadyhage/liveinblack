import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck } from 'lucide-react'
import { OrganizerFollowButtonClient, PublicProfileActions } from '@/app/components/features'
import Image from 'next/image'
import { auth } from '@/auth'
import { getOrganizerBySlug, getOrganizerEvents } from '@/lib/server/organizer/organizers'
import { isFollowing } from '@/lib/server/organizer/organizerFollows'
import { getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { reliablePhotoUrl } from '@/lib/shared/placeholderImage'
import { Mascot } from '@/app/components/ui'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Contenu partagé entre la page dédiée
// (app/(public)/organizers/[slug]/page.tsx) et la route interceptée qui
// l'affiche en modal glissante depuis les listes
// (app/(public)/@modal/(.)organizers/[slug]/page.tsx).
//
// Profil public complet : abonnement, contact, partage et signalement.
export default async function OrganizerDetailContent({ slug }: { slug: string }) {
  const organizer = await getOrganizerBySlug(slug)
  if (!organizer) notFound()

  const session = await auth()
  const isSelf = session?.user?.id === organizer.userId
  const [{ upcoming, past }, followState] = await Promise.all([
    getOrganizerEvents(organizer.userId),
    session?.user && !isSelf ? isFollowing({ id: session.user.id }, { organizerId: organizer.userId }) : Promise.resolve({ ok: true as const, following: false }),
  ])
  const zones = getEntityRegionIds(organizer).map(getRegionName).filter(Boolean)
  const visibleMedia = (organizer.media || []).filter((m) => m.visibility !== 'hidden')
  const showLongDescription = organizer.longDescription && organizer.longDescription !== organizer.shortDescription
  const publicUrl = `${SITE}/organizers/${organizer.slug}`
  const organizerJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${publicUrl}#organization`,
        name: organizer.publicName,
        url: publicUrl,
        description: organizer.longDescription || organizer.shortDescription || undefined,
        image: organizer.bannerUrl || organizer.avatarUrl || undefined,
        logo: organizer.avatarUrl || undefined,
        address: organizer.city || organizer.country ? {
          '@type': 'PostalAddress',
          addressLocality: organizer.city || undefined,
          addressCountry: organizer.country || undefined,
        } : undefined,
        areaServed: zones.length > 0 ? zones : undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/home` },
          { '@type': 'ListItem', position: 2, name: 'Organisateurs', item: `${SITE}/organizers` },
          { '@type': 'ListItem', position: 3, name: organizer.publicName, item: publicUrl },
        ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizerJsonLd).replace(/</g, '\\u003c') }} />
      <div style={{ padding: 'var(--space-4) var(--page-gutter) 0' }}>
        <Link href="/organizers" style={{ minHeight: 'var(--control-height-md)', fontSize: 'var(--font-size-body-sm)', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} /> Organisateurs
        </Link>
      </div>
      <div style={{ position: 'relative', height: 220, margin: 'var(--space-3) var(--page-gutter) 0', borderRadius: 'var(--radius-card)', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface-2)', boxShadow: '0 16px 48px rgba(var(--black-rgb), .32)' }}>
        <Image src={reliablePhotoUrl(organizer.bannerUrl, organizer.userId, 1200, 500)} alt="" fill loading="eager" style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 960px" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 35%, var(--media-scrim) 100%)' }} />
      </div>

      <div style={{ padding: '0 var(--page-gutter) var(--space-8)', marginTop: -36, position: 'relative', zIndex: 2 }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, border: '4px solid var(--surface)', overflow: 'hidden', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-large-title)', fontWeight: 900, color: 'var(--primary-ink)', boxShadow: '0 12px 32px rgba(var(--black-rgb), .45)' }}>
          {organizer.avatarUrl ? (
            <Image src={organizer.avatarUrl} alt={organizer.publicName} width={72} height={72} style={{ objectFit: 'cover' }} />
          ) : (
            organizer.publicName[0]?.toUpperCase()
          )}
        </div>
        <h1 className="font-display" style={{ fontSize: 'clamp(24px, 2.5vw, 32px)', fontWeight: 800, letterSpacing: '-.03em', margin: '12px 0 0', color: 'var(--text)' }}>
          {organizer.publicName}
          {organizer.isVerified && (
            <span style={{ fontFamily: 'var(--font-open-sans), sans-serif', textTransform: 'none', fontWeight: 700, marginLeft: 10, fontSize: 'var(--font-size-body)', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <BadgeCheck size={16} /> vérifié
            </span>
          )}
        </h1>
        {(organizer.city || zones.length > 0) && <p style={{ fontSize: 'var(--font-size-headline)', color: 'var(--text-muted)', margin: '4px 0 0', fontWeight: 600 }}>{[organizer.city, ...zones].filter(Boolean).join(' · ')}</p>}
        <div style={{ marginTop: 12 }}>
          <PublicProfileActions targetUserId={organizer.userId} displayName={organizer.publicName} isAuthenticated={Boolean(session?.user)} isSelf={isSelf} />
        </div>

        {!isSelf && (
          <div style={{ marginTop: 14 }}>
            <OrganizerFollowButtonClient
              organizerId={organizer.userId}
              organizerName={organizer.publicName}
              initialFollowing={followState.following}
              isAuthenticated={Boolean(session?.user)}
              appearance="outline"
            />
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)', lineHeight: 1.45, margin: '8px 0 0', maxWidth: 640 }}>
              En t&apos;abonnant, tu acceptes de partager ton e-mail avec cet organisateur afin de recevoir ses actualités. Tu peux personnaliser tes alertes ou
              te désabonner à tout moment depuis{' '}
              <Link href="/profile/followed-organizers" style={{ minHeight: 'var(--control-height-md)', display: 'inline-flex', alignItems: 'center', color: 'var(--primary)', fontWeight: 650 }}>
                tes organisateurs suivis
              </Link>
              .
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 24, marginTop: 16, padding: '12px 16px', borderRadius: 'var(--radius-card)', background: 'var(--card-bg)', border: '1px solid var(--fill-secondary)', width: 'fit-content' }}>
          <KPI value={organizer.followersCount} label="Abonnés" />
          <KPI value={Math.max(organizer.totalEventsCount, upcoming.length + past.length)} label="Événements" />
        </div>

        <Section title="Événements à venir">
          {upcoming.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <Mascot mood="sleeping" size={180} />
              <p style={{ fontSize: 'var(--font-size-body-lg)', color: 'var(--text-faint)', margin: '8px 0 0' }}>Aucun événement à venir pour le moment.</p>
            </div>
          ) : (
            <div className="lb-card-grid-compact" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 14, marginTop: 10 }}>
              {upcoming.map((e) => {
                const prices = (e.places || []).map((p) => Number(p.price) || 0).filter(Boolean)
                const min = prices.length ? Math.min(...prices) : null
                return (
                  <Link key={e.id} href={`/events/${e.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                    <div style={{ aspectRatio: '16/9', position: 'relative', background: `linear-gradient(135deg, ${e.color || 'var(--primary)'}33, var(--obsidian))` }}>
                      {e.imageUrl && (
                        <Image src={reliablePhotoUrl(e.imageUrl, e.id, 480, 270)} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 45vw, 240px" />
                      )}
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      <p style={{ fontSize: 'var(--font-size-headline)', fontWeight: 700, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', color: 'var(--text)' }}>{e.name}</p>
                      <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[e.dateDisplay, e.city].filter(Boolean).join(' · ')}</p>
                      {min != null && <p style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--gold)', fontWeight: 800, margin: '4px 0 0' }}>dès {fmtMoney(min, eventCurrency(e))}</p>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Section>

        {past.length > 0 && (
          <Section title="Événements passés">
            <div className="lb-card-grid-compact" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 10, marginTop: 10 }}>
              {past.map((e) => (
                <Link key={e.id} href={`/events/${e.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--card-bg)', border: '1px solid var(--fill-secondary)', borderRadius: 'var(--radius-card)', padding: '12px 14px', opacity: 0.82 }}>
                  <p style={{ fontSize: 'var(--font-size-body-lg)', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{e.name}</p>
                  <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)', margin: '4px 0 0' }}>{e.dateDisplay}</p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {visibleMedia.length > 0 && (
          <Section title="Photos & vidéos">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
              {visibleMedia.map((m) => (
                <div key={m.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--fill-secondary)' }}>
                  {m.type === 'video' ? (
                    <video src={m.url} controls preload="metadata" playsInline aria-label={m.title || `Vidéo de ${organizer.publicName}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Image src={m.url} alt={m.title || ''} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 50vw, 160px" />
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {showLongDescription && (
          <Section title="À propos">
            <p style={{ fontSize: 'var(--font-size-headline-xl)', color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', margin: 0 }}>{organizer.longDescription}</p>
          </Section>
        )}

        {(organizer.city || organizer.proPhone) && (
          <Section title="Contact">
            {organizer.city && <p style={{ fontSize: 'var(--font-size-headline)', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>{[organizer.city, organizer.country].filter(Boolean).join(', ')}</p>}
            {organizer.proPhone && (
              <a href={`tel:${organizer.proPhone.replace(/[^+\d]/g, '')}`} style={{ minHeight: 'var(--control-height-md)', display: 'inline-flex', alignItems: 'center', fontSize: 'var(--font-size-body-lg)', fontWeight: 650, color: 'var(--primary)', marginTop: 6, textDecoration: 'none' }}>
                📞 {organizer.proPhone}
              </a>
            )}
          </Section>
        )}
      </div>
    </>
  )
}

function KPI({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p style={{ fontSize: 'var(--font-size-title-2)', fontWeight: 800, margin: 0, color: 'var(--text)' }}>{value}</p>
      <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)', margin: '2px 0 0', fontWeight: 600 }}>{label}</p>
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
