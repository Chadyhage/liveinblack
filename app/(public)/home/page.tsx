import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { type PublicEvent } from '@/lib/server/events/events'
import { type CatalogItem } from '@/lib/server/provider/providers'
import {
  getCachedPublicHomepageConfig as getPublicHomepageConfig,
  getCachedBoostedEventIds as getBoostedEventIds,
  getCachedPublicEventsDirectory,
  getCachedPublicProvidersDirectory,
} from '@/lib/server/publicCache'
import { getMyProfile } from '@/lib/server/users/profile'
import { listActiveInterestSignals } from '@/lib/server/events/eventInterests'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { getProviderCategories, getProviderCategory } from '@/lib/shared/providerCategories'
import { eventStartMs } from '@/lib/shared/event-time'
import { getRecommendedEvents, type RecommendationPreferences } from '@/lib/shared/recommendations'
import { reliablePhotoUrl } from '@/lib/shared/placeholderImage'
import { hasAuthSessionCookie } from '@/lib/server/authSessionCookie'
import HomeGreeting from './HomeGreeting'
import HeroScrollIndicator from './HeroScrollIndicator'
import HomeHeroCarousel from './HomeHeroCarousel'
import { ActionLink, Card, EditorialImageCard } from '@/app/components/ui'
import styles from './home.module.css'

export const metadata: Metadata = {
  title: 'LIVEINBLACK — La marketplace de la nuit et de l’événementiel',
  description:
    "Découvrez les soirées, prestataires et organisateurs du moment et réservez votre billet en quelques clics sur LIVEINBLACK.",
  alternates: { canonical: '/home' },
  openGraph: {
    url: '/home',
    siteName: 'LIVEINBLACK',
    locale: 'fr_BJ',
    title: 'LIVEINBLACK — Événements et sorties au Bénin',
    description: 'Découvrez les événements, organisateurs et prestataires qui font vivre la scène au Bénin.',
  },
}

// Événements/prestataires changent en continu (nouvelles publications,
// stock) — sans dépendance à cookies()/searchParams, Next.js prérendrait
// sinon cette page une fois pour toutes au build.
export const revalidate = 30

// Accueil unifié : vitrine de PublicLanding pour les visiteurs, enrichie du
// Top 3 et des recommandations de HomePage pour les membres connectés.

// Accents du carrousel « Actualité » (#9 phase agent/admin, homepage-config) —
// mêmes couleurs que ACTUALITE_ACCENTS côté agent (lib/models/HomepageConfig.ts).
const ACTUALITE_ACCENTS: Record<string, { dot: string; soft: string; border: string }> = {
  teal: { dot: 'var(--primary)', soft: 'var(--primary-a14)', border: 'var(--primary-a04)' },
  gold: { dot: 'var(--primary)', soft: 'var(--primary-a14)', border: 'var(--primary-a04)' },
  pink: { dot: 'var(--accent-text)', soft: 'var(--primary-a14)', border: 'var(--primary-a42)' },
}

const HOME_EVENT_FALLBACKS = [
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
]

const HOME_PROVIDER_FALLBACKS = [
  'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=1200&q=80',
]

function firstOfferImage(catalog: CatalogItem[] = []): string | null {
  for (const item of catalog) {
    const image = (item.media || []).find((m) => m?.url && m.type !== 'video')
    if (image) return image.url
  }
  return null
}

const MONTHS_FR = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEP', 'OCT', 'NOV', 'DÉC']

// Badge date façon "billet" (mois/jour empilés) — même langage visuel que
// les cartes de pass du site de référence (chillandgroovefestival.com,
// migration design demandée par le client) et déjà porté côté mobile
// (components/EventCard.tsx), pour rester cohérent entre les deux plateformes.
function DateBadge({ dateISO }: { dateISO: string }) {
  const d = new Date(dateISO)
  if (Number.isNaN(d.getTime())) return null
  return (
    <div style={{ position: 'absolute', top: 12, left: 12, minWidth: 38, background: 'rgba(var(--night-rgb), .82)', backdropFilter: 'blur(14px)', border: '1px solid var(--border)', borderRadius: 12, padding: '5px 8px', textAlign: 'center', lineHeight: 1.1 }}>
      <p style={{ margin: 0, fontSize: 'var(--font-size-footnote)', fontWeight: 700, color: 'var(--image-text-muted)', letterSpacing: '.04em' }}>{MONTHS_FR[d.getMonth()]}</p>
      <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-title-5)', fontWeight: 700, color: 'var(--image-text)' }}>{d.getDate()}</p>
    </div>
  )
}

export default async function AccueilPage() {
  const cookieStore = await cookies()
  const hasSessionCookie = hasAuthSessionCookie(cookieStore.getAll())
  const [allEventsResult, providerDirectory, actualiteConfig, boostedIds, session] = await Promise.all([
    getCachedPublicEventsDirectory({ page: 1, pageSize: 30, includeTotal: false }),
    getCachedPublicProvidersDirectory({ page: 1, pageSize: 3, includeTotal: false }),
    getPublicHomepageConfig(),
    getBoostedEventIds(),
    hasSessionCookie ? auth() : Promise.resolve(null),
  ])
  const allEvents = allEventsResult.events
  const providers = providerDirectory.providers

  const events = [...allEvents].sort((a, b) => eventStartMs(a) - eventStartMs(b)).slice(0, 6)
  const featuredProviders = providers.slice(0, 3)
  const topThree = [...allEvents]
    .sort((a, b) => Number(boostedIds.has(b.id)) - Number(boostedIds.has(a.id)) || eventStartMs(a) - eventStartMs(b))
    .slice(0, 3)

  let recommendations: ReturnType<typeof getRecommendedEvents<PublicEvent>> = []
  let needsPreferences = false
  if (session?.user) {
    const [profile, interestHistory] = await Promise.all([getMyProfile({ id: session.user.id }), listActiveInterestSignals({ id: session.user.id })])
    if (profile && profile.privacy.personalizedRecommendations !== false) {
      needsPreferences = !profile.preferences || Object.keys(profile.preferences).length === 0
      const topIds = new Set(topThree.map((event) => event.id))
      recommendations = getRecommendedEvents({
        preferences: profile.preferences as RecommendationPreferences | null,
        interestHistory,
        events: allEvents.filter((event) => !topIds.has(event.id)),
        boostedIds,
        currentUserId: session.user.id,
        max: 6,
      })
    }
  }

  // Carrousel éditorial « Actualité » (#9 phase agent/admin) — additif : si la
  // config est inactive/vide ou qu'aucun événement curé n'est plus découvrable
  // (allEvents est déjà filtré par isClientDiscoverableEvent), la liste est
  // vide et la section ci-dessous ne rend rien — jamais de layout cassé, et le
  // reste de la page (section « À l'affiche » par défaut) n'est jamais affecté.
  const byId = new Map(allEvents.map((e) => [e.id, e]))
  const actualiteEvents = actualiteConfig.active ? actualiteConfig.eventIds.map((id) => byId.get(id)).filter((e): e is PublicEvent => Boolean(e)) : []
  const actualiteAccent = ACTUALITE_ACCENTS[actualiteConfig.accent] ?? ACTUALITE_ACCENTS.teal

  return (
    <>
      {/* HERO : hauteur utile du viewport moins la navigation sticky. */}
      <main className={styles.home}>
      <section id="home-hero" className={styles.hero} data-contrast-on-image="true">
        <HomeHeroCarousel />
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>Votre nuit, simplement.</p>
          {session?.user && <HomeGreeting firstName={session.user.name ? session.user.name.trim().split(' ')[0] : ''} />}
          <h1 className={styles.heroTitle}>
            <span className={styles.heroTitleLine}>Les meilleures soirées.</span>
            <span className={`${styles.heroTitleLine} ${styles.heroTitleAccent}`}>à portée de main.</span>
          </h1>
          <p className={styles.heroDescription}>
            Découvre les événements qui te ressemblent et réserve ton billet en quelques secondes.
          </p>
          <div className={styles.heroActions}>
            <Link href="/events" className={styles.primaryButton} data-growth-event="cta_click" data-growth-surface="home_hero" data-growth-target="events">Voir les événements</Link>
            <Link href={session?.user ? '/profile/billets' : '/login?mode=register'} className={styles.secondaryButton} data-growth-event="cta_click" data-growth-surface="home_hero" data-growth-target={session?.user ? 'tickets' : 'signup'}>{session?.user ? 'Mes billets' : 'Créer un compte'}</Link>
          </div>
        </div>
        <HeroScrollIndicator />
      </section>

      {session?.user && topThree.length > 0 && (
        <Section eyebrow="Le classement" title="Top 3 du moment" sub="Les événements mis en avant et les prochaines dates à ne pas manquer.">
          <div className={`${styles.contentGrid} ${styles.mobileRail}`}>
            {topThree.map((event, index) => <HomeEventCard key={event.id} event={event} badge={`0${index + 1}`} boosted={boostedIds.has(event.id)} fallbackImage={HOME_EVENT_FALLBACKS[index % HOME_EVENT_FALLBACKS.length]} />)}
          </div>
        </Section>
      )}

      {/* ACTUALITÉ (carrousel éditorial curé par l'agent) */}
      {actualiteEvents.length > 0 && (
        <section className={styles.newsSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 8, background: actualiteAccent.soft, border: `1px solid ${actualiteAccent.border}` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: actualiteAccent.dot }} />
              <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: actualiteAccent.dot }}>{actualiteConfig.title}</span>
            </span>
            {actualiteConfig.subtitle && <span style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)' }}>{actualiteConfig.subtitle}</span>}
          </div>
          <div className={styles.horizontalRail}>
            {actualiteEvents.map((e, index) => {
              const prices = (e.places || []).map((p) => Number(p.price) || 0).filter(Boolean)
              const min = prices.length ? Math.min(...prices) : null
              return (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    className="lb-card"
                    style={{ ...card, flexShrink: 0, width: 'clamp(280px,24vw,320px)', overflow: 'hidden', display: 'block', textDecoration: 'none', color: 'inherit', scrollSnapAlign: 'start' }}
                  >
                    <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--surface-2)' }}>
                    <Image
                      src={reliablePhotoUrl(e.imageUrl, e.id, 440, 248, HOME_EVENT_FALLBACKS[index % HOME_EVENT_FALLBACKS.length])}
                      alt={e.name}
                      fill
                      style={{ objectFit: 'cover' }}
                      sizes="(max-width: 768px) 100vw, 220px"
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 62,
                        fontSize: 'var(--font-size-caption-2)',
                        fontWeight: 700,
                        color: 'var(--primary-ink)',
                        background: actualiteAccent.dot,
                        padding: '3px 7px',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(var(--black-rgb), .40)',
                      }}
                    >
                      À la une
                    </span>
                    <DateBadge dateISO={e.date} />
                    {min != null && (
                      <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 'var(--font-size-caption-2-lg)', fontWeight: 800, color: 'var(--gold)', background: 'var(--media-panel-strong)', padding: '4px 8px', borderRadius: 999, border: '1px solid var(--primary-a04)' }}>
                        dès {fmtMoney(min, eventCurrency(e))}
                      </span>
                    )}
                  </div>
                  <div style={{ minHeight: 64, padding: '8px 10px 9px' }}>
                    <p style={{ fontSize: 'var(--font-size-headline)', lineHeight: 1.18, fontWeight: 800, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{e.name}</p>
                    <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)', margin: '4px 0 0' }}>{[e.dateDisplay, e.city].filter(Boolean).join(' · ') || 'Bientôt'}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {session?.user && recommendations.length > 0 && (
        <Section eyebrow="Rien que pour toi" title="Nos recommandations pour toi" sub="Selon tes goûts, tes favoris et tes réservations.">
          <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '-18px 0 16px' }}>
            <Link href="/profile" style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700, textDecoration: 'none' }}>Régler mes goûts →</Link>
          </div>
          <div className={`${styles.contentGrid} ${styles.mobileRail}`}>
            {recommendations.map(({ event, reason }, index) => <HomeEventCard key={event.id} event={event} reason={reason} fallbackImage={HOME_EVENT_FALLBACKS[index % HOME_EVENT_FALLBACKS.length]} />)}
          </div>
        </Section>
      )}

      {session?.user && needsPreferences && (
        <section style={{ maxWidth: 860, margin: '38px auto 0', padding: '0 22px' }}>
          <Card
            accent="var(--primary-a35)"
            style={{ borderRadius: card.borderRadius, boxShadow: card.boxShadow, padding: '22px 24px', background: 'var(--surface)' }}
          >
            <p style={{ margin: 0, color: 'var(--accent-text)', fontSize: 'var(--font-size-caption-2-lg)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em' }}>Personnalise ton expérience</p>
            <h2 style={{ margin: '7px 0 5px', fontSize: 'var(--font-size-headline-lg)' }}>Des soirées vraiment faites pour toi</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)', lineHeight: 1.55 }}>Indique tes styles, tes villes et ton budget. Cela prend moins d&apos;une minute et reste modifiable.</p>
            <Link href="/profile" style={{ ...btnPrimary, marginTop: 14, padding: '10px 17px', fontSize: 'var(--font-size-footnote-lg)' }}>Régler mes goûts</Link>
          </Card>
        </section>
      )}

      {/* ÉVÉNEMENTS À DÉCOUVRIR */}
      {(!session?.user || recommendations.length === 0) && <Section eyebrow="À l'affiche" title="Des soirées à découvrir" sub="Explore librement. Pour réserver et garder ton billet, il te suffit d'un compte.">
        {events.length === 0 ? (
          <EmptyCard kind="events" ctaHref="/events" ctaLabel="Explorer les événements" />
        ) : (
          <>
            <div className={`${styles.contentGrid} ${styles.mobileRail}`}>
              {events.map((event, index) => <HomeEventCard key={event.id} event={event} eager={index === 0} fallbackImage={HOME_EVENT_FALLBACKS[index % HOME_EVENT_FALLBACKS.length]} />)}
            </div>
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <Link href="/events" style={btnGhost}>Tout voir</Link>
            </div>
          </>
        )}
      </Section>}

      {/* PRESTATAIRES À LA UNE */}
      <Section eyebrow="L'annuaire" title="Les prestataires de la nuit" sub="DJ, salles, sono, boissons… Trouve le bon prestataire et contacte-le en un clic.">
        {featuredProviders.length === 0 ? (
          <EmptyCard kind="providers" ctaHref="/providers" ctaLabel="Explorer l’annuaire" />
        ) : (
          <>
            <div className={`${styles.contentGrid} ${styles.mobileRail}`}>
              {featuredProviders.map((p, index) => {
                const categories = getProviderCategories(p)
                const pc = categories[0] || getProviderCategory(p.prestataireType)
                const coverImage = reliablePhotoUrl(p.coverUrl || firstOfferImage(p.catalog) || p.photoUrl, p.userId, 440, 248, HOME_PROVIDER_FALLBACKS[index % HOME_PROVIDER_FALLBACKS.length])
                return (
                  <Link key={p.userId} href={`/providers/${encodeURIComponent(p.userId)}`} className="lb-card" style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--surface-2)', overflow: 'hidden' }}>
                      <Image src={coverImage} alt="" fill loading={index === 0 ? 'eager' : undefined} style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 280px" />
                      <span style={{ position: 'absolute', top: 12, left: 12, fontSize: 'var(--font-size-callout)', fontWeight: 800, color: 'var(--image-text)', background: 'var(--media-panel)', border: `1px solid ${pc.color}`, padding: '5px 11px', borderRadius: 999 }}>
                        {pc.label}
                        {categories.length > 1 ? ` +${categories.length - 1}` : ''}
                      </span>
                      <div style={{ position: 'absolute', left: 18, bottom: 12, width: 44, height: 44, borderRadius: '50%', border: `3px solid ${pc.color}`, overflow: 'hidden', background: 'var(--media-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 'var(--font-size-title-5)', color: 'var(--image-text)', boxShadow: '0 10px 24px rgba(var(--black-rgb), .40)' }}>
                        {p.photoUrl ? (
                          <Image src={p.photoUrl} alt={p.name} width={56} height={56} style={{ objectFit: 'cover' }} />
                        ) : (
                          p.name?.[0]?.toUpperCase() || '?'
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '18px 20px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <p style={{ fontSize: 'var(--font-size-title-2)', lineHeight: 1.16, fontWeight: 800, margin: 0, color: 'var(--text)' }}>{p.name}</p>
                      {(p.city || p.location || p.country) && (
                        <p style={{ fontSize: 'var(--font-size-headline-xl)', color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.45 }}>{[p.city || p.location, p.country].filter(Boolean).join(' · ')}</p>
                      )}
                      <span style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 'var(--font-size-headline-xl)', fontWeight: 800, color: 'var(--primary)' }}>Voir le profil →</span>
                    </div>
                  </Link>
                )
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <Link href="/providers" style={btnGhost}>Tous les prestataires</Link>
            </div>
          </>
        )}
      </Section>

      {/* POURQUOI CRÉER UN COMPTE */}
      {!session?.user && <Section eyebrow="Ton compte" title="Pourquoi créer un compte ?" sub="Gratuit, en 30 secondes. Et tu débloques tout ça :">
        <div className={styles.benefitGrid}>
          {[
            ['Réserve tes billets', 'Paiement sécurisé, billet instantané.'],
            ['Ton QR code partout', 'Tes billets toujours dans ta poche.'],
            ['Recommandations', 'Des soirées selon tes goûts et ta ville.'],
            ['Favoris', 'Sauvegarde les événements qui te plaisent.'],
          ].map(([t, d]) => (
            <Card key={t} accent="var(--border-strong)" style={{ ...CARD_OVERRIDE, padding: '18px 16px' }}>
              <p className={styles.benefitTitle}>{t}</p>
              <p className={styles.benefitDescription}>{d}</p>
            </Card>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <Link href="/login?mode=register" className={styles.primaryButton}>Créer mon compte gratuitement</Link>
        </div>
      </Section>}

      {/* COMMENT ÇA MARCHE */}
      {!session?.user && <Section eyebrow="Simple" title="Comment ça marche">
        <div className={styles.contentGrid}>
          {[
            ['01', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80', 'Deux amis découvrent les lieux de sortie disponibles', 'Découvre une soirée', 'Parcours les événements près de chez toi et trouve l’ambiance qui te ressemble.'],
            ['02', 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80', 'Des amis réservent leur billet depuis un téléphone', 'Réserve ton billet', 'Choisis ton offre et paie en quelques secondes dans un parcours clair et sécurisé.'],
            ['03', 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80', 'Un billet numérique est contrôlé à l’entrée d’un événement', 'Présente ton QR', 'Retrouve ton billet dans ton compte, fais-le scanner à l’entrée et profite.'],
          ].map(([n, src, alt, title, description]) => (
            <EditorialImageCard key={n} src={src} alt={alt} badge={n} title={title} description={description} />
          ))}
        </div>
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <ActionLink href="/about">Découvrir le fonctionnement complet</ActionLink>
        </div>
      </Section>}

      {/* ORGANISATEURS + PRESTATAIRES */}
      {!session?.user && <Section eyebrow="Tu fais vivre la nuit ?" title="Organisateurs & prestataires">
        <div className={styles.roleGrid}>
          <article className={`${styles.roleCard} ${styles.roleCardOrganizer}`}>
            <div className={styles.roleVisual}>
              <Image src="https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80" alt="Organisateur préparant un événement" fill className={styles.roleImage} sizes="(max-width: 640px) 100vw, 42vw" />
              <div className={styles.roleImageScrim} />
              <span className={styles.roleNumber}>01</span>
              <p className={styles.roleVisualCaption}>Tout piloter.<br />Au même endroit.</p>
            </div>
            <div className={styles.roleBody}>
              <div className={styles.roleContent}>
                <p className={styles.roleEyebrow}>Organisateur</p>
                <h3 className={styles.roleTitle}>Crée, vends, gère tes soirées</h3>
                <p className={styles.roleSummary}>De la mise en ligne au contrôle des entrées, pilote ton événement depuis un seul espace.</p>
                <ul className={styles.roleFeatures}>
                  {['Crée et publie ton événement', 'Vends tes billets en ligne', 'Gère les invités & la guestlist', 'Scanne les QR à l\'entrée', 'Précommandes & POS sur place', 'Booste ta visibilité', 'Statistiques en temps réel'].map((f) => (
                    <li key={f} className={styles.roleFeature}>
                      <span className={styles.roleFeatureMark} aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.roleActionWrap}>
                <Link href="/login?mode=register" className={`${styles.roleAction} ${styles.roleActionPrimary}`}>
                  Créer un espace organisateur <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
          </article>

          <article className={`${styles.roleCard} ${styles.roleCardProvider}`}>
            <div className={styles.roleVisual}>
              <Image src="https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=1200&q=80" alt="Prestataire événementiel en action" fill className={styles.roleImage} sizes="(max-width: 640px) 100vw, 42vw" />
              <div className={styles.roleImageScrim} />
              <span className={styles.roleNumber}>02</span>
              <p className={styles.roleVisualCaption}>Ton savoir-faire.<br />Bien présenté.</p>
            </div>
            <div className={styles.roleBody}>
              <div className={styles.roleContent}>
                <p className={styles.roleEyebrow}>Prestataire</p>
                <h3 className={styles.roleTitle}>Développe ton activité</h3>
                <p className={styles.roleSummary}>Mets en avant ton expertise et transforme ta visibilité en nouvelles opportunités.</p>
                <ul className={styles.roleFeatures}>
                  {['Crée un profil public (vitrine)', 'Présente tes services & ton portfolio', 'Sois visible des organisateurs & clients', 'Reçois des demandes et devis', 'DJ, photo, vidéo, déco, sécurité…', 'Gère tes commandes'].map((f) => (
                    <li key={f} className={styles.roleFeature}>
                      <span className={styles.roleFeatureMark} aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.roleActionWrap}>
                <Link href="/login?mode=register" className={`${styles.roleAction} ${styles.roleActionSecondary}`}>
                  Devenir prestataire <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
          </article>
        </div>
      </Section>}

      {/* CE QUE TON COMPTE DÉBLOQUE */}
      {/* CTA FINAL */}
      <section className={styles.finalSection}>
        <div className={styles.finalCard}>
          <h2 className={styles.finalTitle}>{session?.user ? 'Ta prochaine sortie commence ici' : 'Rejoins Live in Black'}</h2>
          <p className={styles.finalDescription}>
            {session?.user ? 'Retrouve tes recommandations et tous tes billets au même endroit.' : 'Découvre les meilleures soirées autour de toi, et ne rate plus jamais une sortie.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
            <Link href={session?.user ? '/profile/billets' : '/login?mode=register'} className={styles.primaryButton} data-growth-event="cta_click" data-growth-surface="home_final" data-growth-target={session?.user ? 'tickets' : 'signup'}>{session?.user ? 'Voir mes billets' : 'Créer mon compte'}</Link>
            <Link href="/events" className={styles.secondaryButton} data-growth-event="cta_click" data-growth-surface="home_final" data-growth-target="events">Découvrir les événements</Link>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
            <Link href="/organizer-signup" data-growth-event="cta_click" data-growth-surface="home_final" data-growth-target="organizer_signup" style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', color: 'var(--primary)', fontSize: 'var(--font-size-callout)', fontWeight: 800, textDecoration: 'none' }}>Devenir organisateur →</Link>
            <Link href="/provider-signup" data-growth-event="cta_click" data-growth-surface="home_final" data-growth-target="provider_signup" style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', color: 'var(--gold)', fontSize: 'var(--font-size-callout)', fontWeight: 800, textDecoration: 'none' }}>Devenir prestataire →</Link>
          </div>
          {!session?.user && <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-faint)', marginTop: 24 }}>
            Déjà un compte ? <Link href="/login" style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>Me connecter</Link>
          </p>}
        </div>
      </section>
      </main>
    </>
  )
}

function HomeEventCard({ event, badge, boosted = false, reason, eager = false, fallbackImage }: { event: PublicEvent; badge?: string; boosted?: boolean; reason?: string; eager?: boolean; fallbackImage?: string }) {
  const prices = (event.places || []).map((place) => Number(place.price)).filter((price) => Number.isFinite(price) && price >= 0)
  const minPrice = prices.length ? Math.min(...prices) : null
  const isRanking = Boolean(badge)
  return (
    <Link href={`/events/${event.id}`} className="lb-card" style={{ ...card, overflow: 'hidden', display: 'block', color: 'inherit', textDecoration: 'none', position: 'relative' }}>
      <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--surface-2)' }}>
        <Image
          src={reliablePhotoUrl(event.imageUrl, event.id, 460, 259, fallbackImage)}
          alt={event.name}
          fill
          loading={eager ? 'eager' : undefined}
          style={{ objectFit: 'cover' }}
          sizes="(max-width: 768px) 100vw, 230px"
        />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--media-black-rgb), .16)' }} />
        {badge ? (
          <span style={{ position: 'absolute', top: 12, left: 12, fontSize: 'var(--font-size-title-4)', lineHeight: 1, fontWeight: 900, color: badge === '01' ? 'var(--gold)' : 'var(--image-text)' }}>{badge}</span>
        ) : (
          <DateBadge dateISO={event.date} />
        )}
        {boosted && <span style={{ position: 'absolute', top: 12, right: 12, borderRadius: 999, background: 'var(--gold)', color: 'var(--primary-ink)', padding: '5px 10px', fontSize: 'var(--font-size-footnote)', fontWeight: 900 }}>À LA UNE</span>}
        {reason && <span style={{ position: 'absolute', left: 12, bottom: 12, maxWidth: 'calc(100% - 24px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 999, border: '1px solid var(--violet-border)', background: 'rgba(var(--media-black-rgb), .86)', color: 'var(--image-text)', padding: '6px 12px', fontSize: 'var(--font-size-callout)', fontWeight: 700 }}>{reason}</span>}
      </div>
      <div style={{ padding: '18px 20px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <p style={{ margin: 0, color: 'var(--text)', fontSize: isRanking ? 24 : 22, lineHeight: 1.16, fontWeight: 800, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{event.name}</p>
        <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-headline-xl)', fontWeight: 500, lineHeight: 1.45 }}>{[event.dateDisplay, event.city].filter(Boolean).join(' · ') || 'Bientôt'}</p>
        <p style={{ margin: 'auto 0 0', paddingTop: 14, color: 'var(--gold)', fontSize: 'var(--font-size-headline-lg)', fontWeight: 800 }}>{minPrice == null || minPrice <= 0 ? 'Gratuit' : `Dès ${fmtMoney(minPrice, eventCurrency(event))}`}</p>
      </div>
    </Link>
  )
}

function Section({ eyebrow, title, sub, children }: { eyebrow?: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        {eyebrow && <p className={styles.sectionEyebrow}>{eyebrow}</p>}
        <h2 className={styles.sectionTitle}>{title}</h2>
        {sub && <p className={styles.sectionDescription}>{sub}</p>}
      </header>
      {children}
    </section>
  )
}

const EMPTY_STATE_CONTENT = {
  events: {
    index: '01',
    visualLabel: 'Agenda',
    image: HOME_EVENT_FALLBACKS[0],
    eyebrow: 'Programmation en cours',
    title: 'Les prochaines expériences se préparent.',
    description: 'Notre sélection s’enrichit bientôt de nouvelles soirées, concerts et rendez-vous à vivre.',
  },
  providers: {
    index: '02',
    visualLabel: 'Talents',
    image: HOME_PROVIDER_FALLBACKS[0],
    eyebrow: 'Annuaire en préparation',
    title: 'Les talents qui font vivre la nuit arrivent.',
    description: 'DJ, lieux, technique et création rejoignent progressivement notre sélection de professionnels.',
  },
} as const

function EmptyCard({ kind, ctaHref, ctaLabel }: { kind: keyof typeof EMPTY_STATE_CONTENT; ctaHref: string; ctaLabel: string }) {
  const content = EMPTY_STATE_CONTENT[kind]

  return (
    <article className={styles.emptyState}>
      <div className={styles.emptyStateVisual} aria-hidden="true">
        <Image src={content.image} alt="" fill className={styles.emptyStateImage} sizes="(max-width: 640px) 100vw, 36vw" />
        <span className={styles.emptyStateIndex}>{content.index}</span>
        <span className={styles.emptyStateVisualLabel}>{content.visualLabel}</span>
      </div>
      <div className={styles.emptyStateCopy}>
        <p className={styles.emptyStateEyebrow}>{content.eyebrow}</p>
        <h3 className={styles.emptyStateText}>{content.title}</h3>
        <p className={styles.emptyStateDescription}>{content.description}</p>
        <Link href={ctaHref} className={`${styles.primaryButton} ${styles.emptyStateAction}`}>
          {ctaLabel}
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </article>
  )
}

const card: React.CSSProperties = { maxWidth: 360, width: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 24, boxShadow: '0 20px 56px rgba(var(--black-rgb), .22)', overflow: 'hidden' }
const CARD_OVERRIDE: React.CSSProperties = { background: card.background, borderRadius: card.borderRadius, boxShadow: card.boxShadow }
const btnPrimary: React.CSSProperties = { minHeight: 44, padding: '10px 18px', borderRadius: 'var(--radius-control)', fontSize: 'var(--font-size-headline)', fontWeight: 700, color: 'var(--primary-ink)', background: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const btnGhost: React.CSSProperties = { minHeight: 44, padding: '10px 18px', borderRadius: 'var(--radius-control)', fontSize: 'var(--font-size-headline)', fontWeight: 700, color: 'var(--text)', background: 'var(--fill-secondary)', border: '1px solid var(--border)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
