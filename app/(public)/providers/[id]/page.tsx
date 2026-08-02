import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getProviderByUserId } from '@/lib/server/providers'
import { getPublishedReviews, getMyReviewFor } from '@/lib/server/providerReviews'
import { getProviderCategories } from '@/lib/shared/providerCategories'
import { REGION_OPTIONS } from '@/lib/shared/locations'
import { fmtMoney } from '@/lib/shared/money'
import { auth } from '@/auth'
import { canOrderServices } from '@/lib/server/permissions'
import { ProviderReviewsClient, PublicProfileActions } from '@/app/components/features'
import ProviderCatalogInquiry from '@/app/components/ProviderCatalogInquiry'
import { socialUrl } from '@/lib/shared/social'

export const dynamic = 'force-dynamic'

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const provider = await getProviderByUserId(id)
  if (!provider) return { title: 'Prestataire — LIVEINBLACK' }
  return { title: `${provider.name} — LIVEINBLACK`, description: provider.description?.slice(0, 160) }
}

// Port de src/pages/PublicPrestatairePage.jsx. La modale "Demander ce
// service" (ProviderCatalogInquiry, un composant client par item de
// catalogue) était restée différée à l'origine, faute de messagerie côté
// nouvelle stack — elle existe désormais (voir lib/server/messaging.ts),
// fermant cette intégration qui restait morte côté client.
export default async function PublicPrestatairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const provider = await getProviderByUserId(id, session?.user ? { activeRole: session.user.activeRole, id: session.user.id } : null)
  if (!provider) notFound()

  const isSelf = session?.user?.id === id
  // Anonyme : le bouton reste visible (redirige vers /login au clic, comme
  // avant) ; connecté : seul un rôle actif prestataire ne peut pas commander
  // de service à un autre prestataire (canOrderServices).
  const canOrderCatalog = !session?.user || canOrderServices(session.user)
  const [reviews, myReview] = await Promise.all([getPublishedReviews(id), session?.user ? getMyReviewFor({ id: session.user.id }, id) : Promise.resolve(null)])

  const categories = getProviderCategories(provider)
  const visibleCatalog = (provider.catalog || []).filter((item) => item.available !== false)
  const socialEntries = Object.entries(provider.socialLinks || {})
    .filter(([key]) => key !== 'website')
    .map(([key, value]) => [key, socialUrl(key, value)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  const websiteUrl = socialUrl('website', provider.website)

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(14px, 3vw, 42px) 88px', width: '100%' }}>
      <div style={{ padding: '18px 0 0' }}>
        <Link href="/providers" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← Prestataires
        </Link>
      </div>
      <div style={{ position: 'relative', height: 230, margin: '18px 0 0', borderRadius: 'var(--radius-xl)', overflow: 'hidden', border: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--surface-2), rgba(184,243,74,.18))' }}>
        {provider.coverUrl && (
          <Image src={provider.coverUrl} alt="" fill loading="eager" style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 880px" />
        )}
        {!provider.coverUrl && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: 22, color: 'rgba(255,255,255,.5)', fontFamily: 'var(--font-display), sans-serif', fontSize: 'clamp(24px,5vw,48px)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {provider.name}
          </div>
        )}
      </div>

      <div style={{ padding: '0 22px', marginTop: -32, position: 'relative' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', border: '3px solid var(--obsidian)', overflow: 'hidden', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 }}>
          {provider.photoUrl ? (
            <Image src={provider.photoUrl} alt={provider.name} width={72} height={72} style={{ objectFit: 'cover' }} />
          ) : (
            provider.name[0]?.toUpperCase()
          )}
        </div>
        <h1 className="font-display" style={{ fontSize: 30, letterSpacing: '.01em', margin: '12px 0 0' }}>{provider.name}</h1>
        {provider.headline && <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>{provider.headline}</p>}
        <PublicProfileActions targetUserId={provider.userId} displayName={provider.name} isAuthenticated={Boolean(session?.user)} isSelf={isSelf} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {categories.map((c) => (
            <span key={c.id} style={{ minHeight: 30, display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 800, color: 'var(--primary-ink)', background: 'var(--primary)', padding: '5px 11px', borderRadius: 999 }}>
              {c.label}
            </span>
          ))}
        </div>

        {provider.description && (
          <Section title="À propos">
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{provider.description}</p>
          </Section>
        )}

        {socialEntries.length > 0 && (
          <Section title="Réseaux">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {socialEntries.map(([key, value]) => (
                <a key={key} href={value as string} target="_blank" rel="noopener noreferrer" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 13, color: 'var(--primary)', textDecoration: 'none', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px' }}>
                  {SOCIAL_LABELS[key] || key}
                </a>
              ))}
            </div>
          </Section>
        )}

        <Section title="Coordonnées">
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0 }}>
            {[provider.city || provider.location, provider.country].filter(Boolean).join(', ')}
          </p>
          {provider.zonesIntervention?.length ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '4px 0 0' }}>
              Intervient : {provider.zonesIntervention.map((z) => { const r = REGION_OPTIONS.find((o) => o.id === z); return r ? `${r.flag} ${r.name}` : z }).join(', ')}
            </p>
          ) : null}
          {websiteUrl && (
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ minHeight: 44, fontSize: 13, color: 'var(--teal)', display: 'inline-flex', alignItems: 'center', marginTop: 6, textDecoration: 'none' }}>
              {provider.website}
            </a>
          )}
          {provider.phone && (
            <a href={`tel:${provider.phone.replace(/[^+\d]/g, '')}`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 13, color: 'var(--teal)', marginTop: 6, textDecoration: 'none' }}>
              {provider.phone}
            </a>
          )}
        </Section>

        {visibleCatalog.length > 0 && (
          <Section title="Catalogue">
            <div className="lb-card-grid">
              {visibleCatalog.map((item) => {
                // Même règle que getOfferMedia (legacy PublicPrestatairePage.jsx) :
                // la vignette de l'image d'aperçu privilégie une image, jamais
                // une vidéo, avec repli sur le premier média quel qu'il soit.
                const inquiryImage = item.media?.find((m) => m.type !== 'video')?.url || item.media?.[0]?.url || null
                return (
                  <div key={item.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                    {item.media?.[0]?.url && (
                      <div style={{ aspectRatio: '4/3', position: 'relative' }}>
                        {item.media[0].type === 'video' ? (
                          <video src={item.media[0].url} controls preload="metadata" playsInline aria-label={`Vidéo de ${item.name}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Image src={item.media[0].url} alt={item.name} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 220px" />
                        )}
                      </div>
                    )}
                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{item.name}</span>
                        {item.price != null && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                            {fmtMoney(item.price, item.currency || provider.catalogCurrency)}
                            {item.unit ? ` / ${item.unit}` : ''}
                          </span>
                        )}
                      </div>
                      {item.description && <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '6px 0 0' }}>{item.description}</p>}
                      {!isSelf && canOrderCatalog && (
                        <div style={{ marginTop: 12 }}>
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
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        <ProviderReviewsClient providerId={id} providerName={provider.name} isAuthenticated={Boolean(session?.user)} isSelf={isSelf} initialReviews={reviews} initialMyReview={myReview} />
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lb-detail-section">
      <h2 style={{ fontSize: 14, fontWeight: 400, margin: '0 0 10px', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif' }}>{title}</h2>
      {children}
    </section>
  )
}
