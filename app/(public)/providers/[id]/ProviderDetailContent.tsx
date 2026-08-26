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
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
import { Card } from '@/app/components/ui'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
}

// Contenu partagé entre la page dédiée (app/(public)/providers/[id]/page.tsx)
// et la route interceptée qui l'affiche en modal glissante depuis les listes
// (app/(public)/@modal/(.)providers/[id]/page.tsx).
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
      <div style={{ padding: '14px 18px 0' }}>
        <Link href="/providers" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← Prestataires
        </Link>
      </div>
      <div style={{ position: 'relative', height: 198, margin: '12px 0 0', overflow: 'hidden', border: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--surface-2), rgba(184,243,74,.18))' }}>
        <Image src={provider.coverUrl || placeholderPhotoUrl(id, 1200, 500)} alt="" fill loading="eager" style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 880px" />
      </div>

      <div style={{ padding: '0 18px', marginTop: -28, position: 'relative' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid var(--obsidian)', overflow: 'hidden', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
          {provider.photoUrl ? (
            <Image src={provider.photoUrl} alt={provider.name} width={72} height={72} style={{ objectFit: 'cover' }} />
          ) : (
            provider.name[0]?.toUpperCase()
          )}
        </div>
        <h1 className="font-display" style={{ fontSize: 18, letterSpacing: '.01em', margin: '10px 0 0' }}>{provider.name}</h1>
        {provider.headline && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>{provider.headline}</p>}
        <PublicProfileActions targetUserId={provider.userId} displayName={provider.name} isAuthenticated={Boolean(session?.user)} isSelf={isSelf} />

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
          {categories.map((c) => (
            <span key={c.id} style={{ minHeight: 28, display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 800, color: 'var(--primary-ink)', background: 'var(--primary)', padding: '4px 10px', borderRadius: 999 }}>
              {c.label}
            </span>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, alignItems: 'start' }}>
          {provider.description && (
            <Section title="À propos">
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.58, whiteSpace: 'pre-wrap' }}>{provider.description}</p>
            </Section>
          )}

          <Section title="Coordonnées">
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
              {[provider.city || provider.location, provider.country].filter(Boolean).join(', ')}
            </p>
            {provider.zonesIntervention?.length ? (
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '3px 0 0' }}>
                Intervient : {provider.zonesIntervention.map((z) => { const r = REGION_OPTIONS.find((o) => o.id === z); return r ? `${r.flag} ${r.name}` : z }).join(', ')}
              </p>
            ) : null}
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ minHeight: 40, fontSize: 12.5, color: 'var(--teal)', display: 'inline-flex', alignItems: 'center', marginTop: 5, textDecoration: 'none' }}>
                {provider.website}
              </a>
            )}
            {provider.phone && (
              <a href={`tel:${provider.phone.replace(/[^+\d]/g, '')}`} style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, color: 'var(--teal)', marginTop: 5, textDecoration: 'none' }}>
                {provider.phone}
              </a>
            )}
          </Section>

          {socialEntries.length > 0 && (
            <Section title="Réseaux">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {socialEntries.map(([key, value]) => (
                  <a key={key} href={value as string} target="_blank" rel="noopener noreferrer" style={{ minHeight: 38, display: 'inline-flex', alignItems: 'center', fontSize: 12, color: 'var(--primary)', textDecoration: 'none', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 12px' }}>
                    {SOCIAL_LABELS[key] || key}
                  </a>
                ))}
              </div>
            </Section>
          )}
        </div>

        {visibleCatalog.length > 0 && (
          <Section title="Catalogue">
            <div className="lb-card-grid">
              {visibleCatalog.map((item) => {
                // Même règle que getOfferMedia (legacy PublicPrestatairePage.jsx) :
                // la vignette de l'image d'aperçu privilégie une image, jamais
                // une vidéo, avec repli sur le premier média quel qu'il soit.
                const inquiryImage = item.media?.find((m) => m.type !== 'video')?.url || item.media?.[0]?.url || null
                return (
                  <Card key={item.id} style={{ padding: 0, overflow: 'hidden' }}>
                    {item.media?.[0]?.url && (
                      <div style={{ aspectRatio: '4/3', position: 'relative' }}>
                        {item.media[0].type === 'video' ? (
                          <video src={item.media[0].url} controls preload="metadata" playsInline aria-label={`Vidéo de ${item.name}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Image src={item.media[0].url} alt={item.name} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 220px" />
                        )}
                      </div>
                    )}
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{item.name}</span>
                        {item.price != null && (
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                            {fmtMoney(item.price, item.currency || provider.catalogCurrency)}
                            {item.unit ? ` / ${item.unit}` : ''}
                          </span>
                        )}
                      </div>
                      {item.description && <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '5px 0 0' }}>{item.description}</p>}
                      {!isSelf && canOrderCatalog && (
                        <div style={{ marginTop: 10 }}>
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
          </Section>
        )}

        {pastEvents.length > 0 && (
          <Section title="Événements passés">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {pastEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/events/${ev.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none' }}
                >
                  {ev.imageUrl && (
                    <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                      <Image src={ev.imageUrl} alt="" fill sizes="44px" style={{ objectFit: 'cover' }} />
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--text-faint)' }}>
                      {ev.dateDisplay}
                      {ev.city ? ` · ${ev.city}` : ''}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <ProviderReviewsClient providerId={id} providerName={provider.name} isAuthenticated={Boolean(session?.user)} isSelf={isSelf} initialReviews={reviews} initialMyReview={myReview} />
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lb-detail-section">
      <h2 style={{ fontSize: 12, fontWeight: 400, margin: '0 0 8px', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3px', fontFamily: 'var(--font-display), sans-serif' }}>{title}</h2>
      {children}
    </section>
  )
}
