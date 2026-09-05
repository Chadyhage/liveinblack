import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getProviderByUserId } from '@/lib/server/provider/providers'
import { listPastEventsForProvider } from '@/lib/server/provider/providerBookingHistory'
import { getPublishedReviews, getMyReviewFor } from '@/lib/server/provider/providerReviews'
import { getProviderCategories } from '@/lib/shared/providerCategories'
import { REGION_OPTIONS } from '@/lib/shared/locations'
import { fmtMoney } from '@/lib/shared/money'
import { auth } from '@/auth'
import { canOrderServices } from '@/lib/server/permissions'
import { ProviderReviewsClient, PublicProfileActions } from '@/app/components/features'
import ProviderCatalogInquiry from '@/app/components/features/provider/ProviderCatalogInquiry'
import { socialUrl } from '@/lib/shared/social'
import { reliablePhotoUrl } from '@/lib/shared/placeholderImage'
import { Card } from '@/app/components/ui'
import styles from './ProviderDetailContent.module.css'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
}

// Contenu de la page dédiée app/(public)/providers/[id]/page.tsx. La fiche
// s'ouvre toujours en pleine page afin que le clic et le rafraîchissement
// produisent exactement le même rendu.
//
// Port de src/pages/PublicPrestatairePage.jsx. La modale "Demander ce
// service" (ProviderCatalogInquiry, un composant client par item de
// catalogue) était restée différée à l'origine, faute de messagerie côté
// nouvelle stack — elle existe désormais (voir lib/server/messaging.ts),
// fermant cette intégration qui restait morte côté client.
export default async function ProviderDetailContent({ id }: { id: string }) {
  const session = await auth()
  const provider = await getProviderByUserId(id, session?.user ? { activeRole: session.user.activeRole, id: session.user.id } : null)
  if (!provider) notFound()

  const isSelf = session?.user?.id === id
  // Anonyme : le bouton reste visible (redirige vers /login au clic, comme
  // avant) ; connecté : seul un rôle actif prestataire ne peut pas commander
  // de service à un autre prestataire (canOrderServices).
  const canOrderCatalog = !session?.user || canOrderServices(session.user)
  const [reviews, myReview, pastEvents] = await Promise.all([
    getPublishedReviews(id),
    session?.user ? getMyReviewFor({ id: session.user.id }, id) : Promise.resolve(null),
    listPastEventsForProvider(id),
  ])

  const categories = getProviderCategories(provider)
  const visibleCatalog = (provider.catalog || []).filter((item) => item.available !== false)
  const socialEntries = Object.entries(provider.socialLinks || {})
    .filter(([key]) => key !== 'website')
    .map(([key, value]) => [key, socialUrl(key, value)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  const websiteUrl = socialUrl('website', provider.website)
  const serviceAreas = (provider.zonesIntervention || []).map((zone) => REGION_OPTIONS.find((option) => option.id === zone)?.name || zone)
  const publicUrl = `${SITE}/providers/${provider.userId}`
  const providerJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfessionalService',
        '@id': `${publicUrl}#service`,
        name: provider.name,
        url: publicUrl,
        description: provider.description || provider.headline || undefined,
        image: provider.coverUrl || provider.photoUrl || undefined,
        telephone: provider.phone || undefined,
        sameAs: [...socialEntries.map(([, value]) => value), websiteUrl].filter(Boolean),
        address: provider.city || provider.location || provider.country ? {
          '@type': 'PostalAddress',
          addressLocality: provider.city || provider.location || undefined,
          addressCountry: provider.country || undefined,
        } : undefined,
        areaServed: serviceAreas.length > 0 ? serviceAreas : undefined,
        aggregateRating: provider.ratingCount > 0 ? {
          '@type': 'AggregateRating',
          ratingValue: provider.ratingAvg,
          ratingCount: provider.ratingCount,
        } : undefined,
        hasOfferCatalog: visibleCatalog.length > 0 ? {
          '@type': 'OfferCatalog',
          name: `Services de ${provider.name}`,
          itemListElement: visibleCatalog.slice(0, 20).map((item) => ({
            '@type': 'Offer',
            name: item.name,
            description: item.description || undefined,
            price: item.price ?? undefined,
            priceCurrency: item.price != null ? item.currency : undefined,
            availability: 'https://schema.org/InStock',
          })),
        } : undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/home` },
          { '@type': 'ListItem', position: 2, name: 'Prestataires', item: `${SITE}/providers` },
          { '@type': 'ListItem', position: 3, name: provider.name, item: publicUrl },
        ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(providerJsonLd).replace(/</g, '\\u003c') }} />
      <div className={styles.detail}>
      <Link href="/providers" className={styles.back}>
          ← Prestataires
      </Link>

      <div className={styles.hero}>
        <Image src={reliablePhotoUrl(provider.coverUrl, id, 1200, 500)} alt="" fill loading="eager" className={styles.heroImage} sizes="(max-width: 768px) 100vw, 1100px" />
        <div className={styles.heroOverlay} />
      </div>

      <header className={styles.summary}>
        <div className={styles.avatar}>
          {provider.photoUrl ? (
            <Image src={provider.photoUrl} alt={provider.name} width={76} height={76} className={styles.avatarImage} />
          ) : (
            provider.name[0]?.toUpperCase()
          )}
        </div>
        <div className={styles.identity}>
          <h1 className={styles.name}>{provider.name}</h1>
          {provider.headline && <p className={styles.headline}>{provider.headline}</p>}
          <div className={styles.categories}>
            {categories.map((category) => <span key={category.id} className={styles.category}>{category.label}</span>)}
          </div>
        </div>
        <div className={styles.actions}>
          <PublicProfileActions targetUserId={provider.userId} displayName={provider.name} isAuthenticated={Boolean(session?.user)} isSelf={isSelf} />
        </div>
      </header>

        <div className={styles.overview}>
          <div className={styles.primaryColumn}>
            {provider.description && (
              <section className={styles.panel}>
                <h2 className={styles.sectionTitle}>À propos</h2>
                <p className={styles.body}>{provider.description}</p>
              </section>
            )}

            {visibleCatalog.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Catalogue & prestations</h2>
                <div className={styles.catalogGrid}>
                  {visibleCatalog.map((item) => {
                    const inquiryImage = item.media?.find((m) => m.type !== 'video')?.url || item.media?.[0]?.url || null
                    return (
                      <Card key={item.id} className={styles.catalogCard}>
                        {item.media?.[0]?.url && (
                          <div className={styles.catalogMedia}>
                            {item.media[0].type === 'video' ? (
                              <video src={item.media[0].url} controls preload="metadata" playsInline aria-label={`Vidéo de ${item.name}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <Image src={item.media[0].url} alt={item.name} fill className={styles.catalogImage} sizes="(max-width: 768px) 100vw, 260px" />
                            )}
                          </div>
                        )}
                        <div className={styles.catalogContent}>
                          <div className={styles.catalogTop}>
                            <h3 className={styles.catalogName}>{item.name}</h3>
                            {item.price != null && (
                              <span className={styles.price}>
                                {fmtMoney(item.price, item.currency || provider.catalogCurrency)}
                                {item.unit ? ` / ${item.unit}` : ''}
                              </span>
                            )}
                          </div>
                          {item.description && <p className={styles.catalogDescription}>{item.description}</p>}
                          {!isSelf && canOrderCatalog && (
                            <div className={styles.catalogAction}>
                              <ProviderCatalogInquiry
                                providerId={provider.userId}
                                providerName={provider.name}
                                isAuthenticated={Boolean(session?.user)}
                                catalogDefaultCurrency={provider.catalogCurrency}
                                item={{
                                  id: item.id,
                                  name: item.name,
                                  description: item.description,
                                  price: item.price,
                                  currency: item.currency,
                                  unit: item.unit,
                                  category: item.category,
                                  image: inquiryImage,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </section>
            )}

            {pastEvents.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Événements passés</h2>
                <div className={styles.eventList}>
                  {pastEvents.map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/events/${ev.id}`}
                      className={styles.event}
                    >
                      {ev.imageUrl && (
                        <div className={styles.eventImage}>
                          <Image src={ev.imageUrl} alt="" fill sizes="42px" className={styles.eventCover} />
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <p className={styles.eventName}>{ev.name}</p>
                        <p className={styles.eventMeta}>
                          {ev.dateDisplay}
                          {ev.city ? ` · ${ev.city}` : ''}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className={styles.panel}>
            <h2 className={styles.metaTitle}>Informations</h2>
            <p className={styles.location}>
              {[provider.city || provider.location, provider.country].filter(Boolean).join(', ')}
            </p>
            {provider.zonesIntervention?.length ? (
              <p className={styles.location}>
                Intervient : {provider.zonesIntervention.map((z) => { const r = REGION_OPTIONS.find((o) => o.id === z); return r ? `${r.flag} ${r.name}` : z }).join(', ')}
              </p>
            ) : null}
            {(websiteUrl || provider.phone) && (
              <div className={styles.contactLinks}>
                {websiteUrl && <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>Site web ↗</a>}
                {provider.phone && <a href={`tel:${provider.phone.replace(/[^+\d]/g, '')}`} className={styles.contactLink}>Appeler {provider.phone}</a>}
              </div>
            )}
            {socialEntries.length > 0 && (
              <div className={styles.socials}>
                {socialEntries.map(([key, value]) => (
                  <a key={key} href={value as string} target="_blank" rel="noopener noreferrer" className={styles.social}>
                    {SOCIAL_LABELS[key] || key}
                  </a>
                ))}
              </div>
            )}
          </aside>
        </div>

        <ProviderReviewsClient providerId={id} providerName={provider.name} isAuthenticated={Boolean(session?.user)} isSelf={isSelf} initialReviews={reviews} initialMyReview={myReview} />
      </div>
    </>
  )
}
