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
import styles from './OrganizerDetailContent.module.css'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Profil public dédié : abonnement, contact, partage et signalement.
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
  const aboutText = organizer.longDescription || organizer.shortDescription
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
    <div className={styles.root}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizerJsonLd).replace(/</g, '\\u003c') }} />
      <div className={styles.backWrap}>
        <Link href="/organizers" className={styles.back}>
          <ArrowLeft size={16} /> Organisateurs
        </Link>
      </div>
      <div className={styles.hero}>
        <Image src={reliablePhotoUrl(organizer.bannerUrl, organizer.userId, 1200, 500)} alt="" fill loading="eager" style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 960px" />
        <div className={styles.heroOverlay} />
      </div>

      <div className={styles.content}>
        <section className={styles.profileCard}>
          <div className={styles.identityBlock}>
            <div className={styles.avatar}>
              {organizer.avatarUrl ? (
                <Image src={organizer.avatarUrl} alt={organizer.publicName} width={72} height={72} className={styles.avatarImage} />
              ) : (
                organizer.publicName[0]?.toUpperCase()
              )}
            </div>
            <div className={styles.identityCopy}>
              <h1 className={styles.title}>
                {organizer.publicName}
                {organizer.isVerified && (
                  <span className={styles.verified}>
                    <BadgeCheck size={15} /> Vérifié
                  </span>
                )}
              </h1>
              {(organizer.city || zones.length > 0) && <p className={styles.location}>{[organizer.city, ...zones].filter(Boolean).join(' · ')}</p>}
              {organizer.shortDescription && <p className={styles.summary}>{organizer.shortDescription}</p>}
              <div className={styles.kpis}>
                <KPI value={organizer.followersCount} label="Abonnés" />
                <KPI value={Math.max(organizer.totalEventsCount, upcoming.length + past.length)} label="Événements" />
              </div>
            </div>
          </div>

          <div className={styles.actionColumn}>
            <div className={styles.profileActions}>
              <PublicProfileActions targetUserId={organizer.userId} displayName={organizer.publicName} isAuthenticated={Boolean(session?.user)} isSelf={isSelf} />
            </div>
            {!isSelf && (
              <div className={styles.followBlock}>
                <OrganizerFollowButtonClient
                  organizerId={organizer.userId}
                  organizerName={organizer.publicName}
                  initialFollowing={followState.following}
                  isAuthenticated={Boolean(session?.user)}
                  appearance="outline"
                />
                <p>
                  L’abonnement partage ton e-mail avec cet organisateur. Gère tes préférences depuis{' '}
                  <Link href="/profile/followed-organizers">tes organisateurs suivis</Link>.
                </p>
              </div>
            )}
          </div>
        </section>

        <div className={styles.detailsGrid}>
          <div className={styles.mainColumn}>

        <Section title="Événements à venir">
          {upcoming.length === 0 ? (
            <div className={styles.emptyEvents}>
              <p>Aucun événement à venir pour le moment.</p>
            </div>
          ) : (
            <div className={styles.eventGrid}>
              {upcoming.map((e) => {
                const prices = (e.places || []).map((p) => Number(p.price) || 0).filter(Boolean)
                const min = prices.length ? Math.min(...prices) : null
                return (
                  <Link key={e.id} href={`/events/${e.id}`} className={styles.eventCard}>
                    <div className={styles.eventVisual}>
                      <Image src={reliablePhotoUrl(e.imageUrl, e.id, 480, 270)} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 45vw, 240px" />
                    </div>
                    <div className={styles.eventBody}>
                      <h3>{e.name}</h3>
                      <p>{[e.dateDisplay, e.city].filter(Boolean).join(' · ')}</p>
                      {min != null && <strong>dès {fmtMoney(min, eventCurrency(e))}</strong>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Section>

        {past.length > 0 && (
          <Section title="Événements passés">
            <div className={styles.pastGrid}>
              {past.map((e) => (
                <Link key={e.id} href={`/events/${e.id}`} className={styles.pastCard}>
                  <h3>{e.name}</h3>
                  <p>{e.dateDisplay}</p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {visibleMedia.length > 0 && (
          <Section title="Photos & vidéos">
            <div className={styles.mediaGrid}>
              {visibleMedia.map((m) => (
                <div key={m.id} className={styles.mediaItem}>
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
          </div>

          {(aboutText || organizer.city || organizer.proPhone) && (
            <aside className={styles.sideColumn}>
              {aboutText && (
                <Section title="À propos">
                  <p className={styles.about}>{aboutText}</p>
                </Section>
              )}

              {(organizer.city || organizer.proPhone) && (
                <Section title="Contact">
                  {organizer.city && <p className={styles.contactLocation}>{[organizer.city, organizer.country].filter(Boolean).join(', ')}</p>}
                  {organizer.proPhone && <a href={`tel:${organizer.proPhone.replace(/[^+\d]/g, '')}`} className={styles.phone}>📞 {organizer.proPhone}</a>}
                </Section>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

function KPI({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p style={{ fontSize: 'var(--font-size-title-3)', fontWeight: 500, margin: 0, color: 'var(--text)' }}>{value}</p>
      <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)', margin: '2px 0 0', fontWeight: 500 }}>{label}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lb-detail-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
