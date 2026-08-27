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
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
import { hasAuthSessionCookie } from '@/lib/server/authSessionCookie'
import HomeGreeting from './HomeGreeting'
import HeroScrollIndicator from './HeroScrollIndicator'
import { ActionLink, Card, EditorialImageCard, Mascot } from '@/app/components/ui'
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
  pink: { dot: '#ff6b00', soft: 'rgba(255,107,0,0.14)', border: 'rgba(255,107,0,0.4)' },
}

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
    <div style={{ position: 'absolute', top: 12, left: 12, minWidth: 38, background: 'rgba(18,18,20,.82)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 12, padding: '5px 8px', textAlign: 'center', lineHeight: 1.1 }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.72)', letterSpacing: '.04em' }}>{MONTHS_FR[d.getMonth()]}</p>
      <p style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 700, color: '#fff' }}>{d.getDate()}</p>
    </div>
  )
}

export default async function AccueilPage() {
  const cookieStore = await cookies()
  const hasSessionCookie = hasAuthSessionCookie(cookieStore.getAll())
  const [allEventsResult, providerDirectory, actualiteConfig, boostedIds, session] = await Promise.all([
    getCachedPublicEventsDirectory({ page: 1, pageSize: 30, includeTotal: false }),
    getCachedPublicProvidersDirectory({ page: 1, pageSize: 4, includeTotal: false }),
    getPublicHomepageConfig(),
    getBoostedEventIds(),
    hasSessionCookie ? auth() : Promise.resolve(null),
  ])
  const allEvents = allEventsResult.events
  const providers = providerDirectory.providers

  const events = [...allEvents].sort((a, b) => eventStartMs(a) - eventStartMs(b)).slice(0, 6)
  const featuredProviders = providers.slice(0, 4)
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
      <section id="home-hero" className={styles.hero}>
        <Image
          src="/images/live-in-black/hero-nightlife.jpg"
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>Votre nuit, simplement.</p>
          {session?.user && <HomeGreeting firstName={session.user.name ? session.user.name.trim().split(' ')[0] : ''} />}
          <h1 className={styles.heroTitle}>
            Les meilleures soirées.
            <br />
            <span>à portée de main.</span>
          </h1>
          <p className={styles.heroDescription}>
            Découvre les événements qui te ressemblent et réserve ton billet en quelques secondes.
          </p>
          <div className={styles.heroActions}>
            <Link href="/events" className={styles.primaryButton} data-growth-event="cta_click" data-growth-surface="home_hero" data-growth-target="events">Voir les événements</Link>
            <Link href={session?.user ? '/profile/billets' : '/login?mode=register'} className={styles.secondaryButton} data-growth-event="cta_click" data-growth-surface="home_hero" data-growth-target={session?.user ? 'tickets' : 'signup'}>{session?.user ? 'Mes billets' : 'Créer un compte'}</Link>
          </div>
          <ul className={styles.heroProof} aria-label="Avantages">
            <li>Compte gratuit</li>
            <li>Billet instantané</li>
            <li>Accessible sur le web</li>
          </ul>
        </div>
        <HeroScrollIndicator />
      </section>

      {session?.user && topThree.length > 0 && (
        <Section eyebrow="Le classement" title="Top 3 du moment" sub="Les événements mis en avant et les prochaines dates à ne pas manquer.">
          <div className={`${styles.contentGrid} ${styles.mobileRail}`}>
            {topThree.map((event, index) => <HomeEventCard key={event.id} event={event} badge={`0${index + 1}`} boosted={boostedIds.has(event.id)} />)}
          </div>
        </Section>
      )}

      {/* ACTUALITÉ (carrousel éditorial curé par l'agent) */}
      {actualiteEvents.length > 0 && (
        <section className={styles.newsSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 8, background: actualiteAccent.soft, border: `1px solid ${actualiteAccent.border}` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: actualiteAccent.dot }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: actualiteAccent.dot }}>{actualiteConfig.title}</span>
            </span>
            {actualiteConfig.subtitle && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{actualiteConfig.subtitle}</span>}
          </div>
          <div className={styles.horizontalRail}>
            {actualiteEvents.map((e) => {
              const prices = (e.places || []).map((p) => Number(p.price) || 0).filter(Boolean)
              const min = prices.length ? Math.min(...prices) : null
              return (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    className="lb-card"
                    style={{ ...card, flexShrink: 0, width: 'clamp(280px,24vw,320px)', overflow: 'hidden', display: 'block', textDecoration: 'none', color: 'inherit', scrollSnapAlign: 'start' }}
                  >
                    <div style={{ position: 'relative', aspectRatio: '16/9', background: `linear-gradient(135deg, ${'var(--violet)'}44, var(--obsidian))` }}>
                    <Image
                      src={e.imageUrl || placeholderPhotoUrl(e.id, 440, 248)}
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
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#0b0d14',
                        background: actualiteAccent.dot,
                        padding: '3px 7px',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                      }}
                    >
                      À la une
                    </span>
                    <DateBadge dateISO={e.date} />
                    {min != null && (
                      <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10.5, fontWeight: 800, color: 'var(--gold)', background: 'rgba(5,6,10,.92)', padding: '4px 8px', borderRadius: 999, border: '1px solid var(--primary-a04)' }}>
                        dès {fmtMoney(min, eventCurrency(e))}
                      </span>
                    )}
                  </div>
                  <div style={{ minHeight: 64, padding: '8px 10px 9px' }}>
                    <p style={{ fontSize: 15, lineHeight: 1.18, fontWeight: 800, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{e.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{[e.dateDisplay, e.city].filter(Boolean).join(' · ') || 'Bientôt'}</p>
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
            <Link href="/profile" style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>Régler mes goûts →</Link>
          </div>
          <div className={`${styles.contentGrid} ${styles.mobileRail}`}>
            {recommendations.map(({ event, reason }) => <HomeEventCard key={event.id} event={event} reason={reason} />)}
          </div>
        </Section>
      )}

      {session?.user && needsPreferences && (
        <section style={{ maxWidth: 860, margin: '38px auto 0', padding: '0 22px' }}>
          <Card
            accent="var(--primary-a35)"
            style={{ borderRadius: card.borderRadius, boxShadow: card.boxShadow, padding: '22px 24px', background: 'linear-gradient(120deg,var(--primary-a12),rgba(159, 224, 34,.04)),var(--surface)' }}
          >
            <p style={{ margin: 0, color: '#c9b0ff', fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em' }}>Personnalise ton expérience</p>
            <h2 style={{ margin: '7px 0 5px', fontSize: 16 }}>Des soirées vraiment faites pour toi</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.55 }}>Indique tes styles, tes villes et ton budget. Cela prend moins d&apos;une minute et reste modifiable.</p>
            <Link href="/profile" style={{ ...btnPrimary, marginTop: 14, padding: '10px 17px', fontSize: 12.5 }}>Régler mes goûts</Link>
          </Card>
        </section>
      )}

      {/* ÉVÉNEMENTS À DÉCOUVRIR */}
      {(!session?.user || recommendations.length === 0) && <Section eyebrow="À l'affiche" title="Des soirées à découvrir" sub="Explore librement. Pour réserver et garder ton billet, il te suffit d'un compte.">
        {events.length === 0 ? (
          <EmptyCard text="De nouvelles soirées arrivent très vite." ctaHref="/events" ctaLabel="Voir la page événements" />
        ) : (
          <>
            <div className={`${styles.contentGrid} ${styles.mobileRail}`}>
              {events.map((event, index) => <HomeEventCard key={event.id} event={event} eager={index === 0} />)}
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
          <EmptyCard text="Les premiers prestataires arrivent très vite." ctaHref="/providers" ctaLabel="Voir l'annuaire" />
        ) : (
          <>
            <div className={`${styles.contentGrid} ${styles.mobileRail}`}>
              {featuredProviders.map((p, index) => {
                const categories = getProviderCategories(p)
                const pc = categories[0] || getProviderCategory(p.prestataireType)
                const coverImage = p.coverUrl || firstOfferImage(p.catalog) || p.photoUrl || placeholderPhotoUrl(p.userId, 440, 248)
                return (
                  <Link key={p.userId} href={`/providers/${encodeURIComponent(p.userId)}`} className="lb-card" style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ position: 'relative', minHeight: 150, background: `linear-gradient(135deg, ${pc.color}44, ${pc.color}12 55%, var(--obsidian))`, overflow: 'hidden' }}>
                      <Image src={coverImage} alt="" fill loading={index === 0 ? 'eager' : undefined} style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 220px" />
                      <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10.5, fontWeight: 800, color: '#fff', background: `${pc.color}cc`, padding: '4px 9px', borderRadius: 999 }}>
                        {pc.label}
                        {categories.length > 1 ? ` +${categories.length - 1}` : ''}
                      </span>
                      <div style={{ position: 'absolute', left: 18, bottom: -24, width: 48, height: 48, borderRadius: '50%', border: '3px solid var(--surface)', overflow: 'hidden', background: pc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, color: 'var(--obsidian)', boxShadow: '0 10px 24px rgba(0,0,0,.3)' }}>
                        {p.photoUrl ? (
                          <Image src={p.photoUrl} alt={p.name} width={64} height={64} style={{ objectFit: 'cover' }} />
                        ) : (
                          p.name?.[0]?.toUpperCase() || '?'
                        )}
                      </div>
                    </div>
                    <div style={{ minHeight: 124, padding: '32px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <p style={{ fontSize: 17, lineHeight: 1.2, fontWeight: 800, margin: 0 }}>{p.name}</p>
                      {(p.city || p.location || p.country) && (
                        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>{[p.city || p.location, p.country].filter(Boolean).join(' · ')}</p>
                      )}
                      <span style={{ marginTop: 'auto', paddingTop: 18, borderTop: '1px solid var(--border)', fontSize: 13.5, fontWeight: 800, color: 'var(--teal)' }}>Voir le profil →</span>
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
              <p style={{ fontSize: 17, fontWeight: 650, margin: 0 }}>{t}</p>
              <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '7px 0 0', lineHeight: 1.5 }}>{d}</p>
            </Card>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <Link href="/login?mode=register" className={styles.primaryButton}>Créer mon compte gratuitement</Link>
        </div>
      </Section>}

      {/* COMMENT ÇA MARCHE */}
      {!session?.user && <Section eyebrow="Simple" title="Comment ça marche">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: 14 }}>
          {[
            ['01', '/images/live-in-black/journey-discover.jpg', 'Deux amis découvrent les lieux de sortie disponibles', 'Découvre une soirée', 'Parcours les événements près de chez toi et trouve l’ambiance qui te ressemble.'],
            ['02', '/images/live-in-black/journey-reserve.jpg', 'Deux amies réservent leur billet depuis un téléphone', 'Réserve ton billet', 'Choisis ton offre et paie en quelques secondes dans un parcours clair et sécurisé.'],
            ['03', '/images/live-in-black/journey-enter.jpg', 'Un billet numérique est contrôlé à l’entrée d’un concert', 'Présente ton QR', 'Retrouve ton billet dans ton compte, fais-le scanner à l’entrée et profite.'],
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: 12 }}>
          <Card accent="var(--border-strong)" style={{ ...CARD_OVERRIDE, padding: 18, borderLeft: '3px solid var(--primary)' }}>
            <p style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', fontFamily: 'var(--font-display), sans-serif', color: 'var(--primary)', margin: 0 }}>Organisateur</p>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: '10px 0 12px', letterSpacing: '-.5px' }}>Crée, vends, gère tes soirées</h3>
            <ul style={featList}>
              {['Crée et publie ton événement', 'Vends tes billets en ligne', 'Gère les invités & la guestlist', 'Scanne les QR à l\'entrée', 'Précommandes & POS sur place', 'Booste ta visibilité', 'Statistiques en temps réel'].map((f) => (
                <li key={f} style={featItem}><span style={{ color: 'var(--primary)' }}>◆</span> {f}</li>
              ))}
            </ul>
            <Link href="/login?mode=register" style={{ ...btnSolid, marginTop: 16, background: 'var(--violet-cta)', color: 'var(--primary-ink)' }}>Créer un espace organisateur</Link>
          </Card>
          <Card accent="var(--border-strong)" style={{ ...CARD_OVERRIDE, padding: 18, borderLeft: '3px solid var(--primary-a75)' }}>
            <p style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', fontFamily: 'var(--font-display), sans-serif', color: 'var(--gold)', margin: 0 }}>Prestataire</p>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: '10px 0 12px', letterSpacing: '-.5px' }}>Développe ton activité</h3>
            <ul style={featList}>
              {['Crée un profil public (vitrine)', 'Présente tes services & ton portfolio', 'Sois visible des organisateurs & clients', 'Reçois des demandes et devis', 'DJ, photo, vidéo, déco, sécurité…', 'Gère tes commandes'].map((f) => (
                <li key={f} style={featItem}><span style={{ color: 'var(--gold)' }}>◆</span> {f}</li>
              ))}
            </ul>
            <Link href="/login?mode=register" style={{ ...btnSolid, marginTop: 16, background: 'var(--gold)', color: 'var(--primary-ink)' }}>Devenir prestataire</Link>
          </Card>
        </div>
      </Section>}

      {/* CE QUE TON COMPTE DÉBLOQUE */}
      {/* CTA FINAL */}
      <section className={styles.finalSection}>
        <div className={styles.finalCard}>
          <h2 style={{ fontSize: 'clamp(28px,6vw,42px)', letterSpacing: '-.04em', margin: 0 }}>{session?.user ? 'Ta prochaine sortie commence ici' : 'Rejoins Live in Black'}</h2>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '12px auto 0', maxWidth: 440, lineHeight: 1.5 }}>
            {session?.user ? 'Retrouve tes recommandations et tous tes billets au même endroit.' : 'Découvre les meilleures soirées autour de toi, et ne rate plus jamais une sortie.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
            <Link href={session?.user ? '/profile/billets' : '/login?mode=register'} className={styles.primaryButton} data-growth-event="cta_click" data-growth-surface="home_final" data-growth-target={session?.user ? 'tickets' : 'signup'}>{session?.user ? 'Voir mes billets' : 'Créer mon compte'}</Link>
            <Link href="/events" className={styles.secondaryButton} data-growth-event="cta_click" data-growth-surface="home_final" data-growth-target="events">Découvrir les événements</Link>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
            <Link href="/organizer-signup" data-growth-event="cta_click" data-growth-surface="home_final" data-growth-target="organizer_signup" style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', color: 'var(--teal)', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>Devenir organisateur →</Link>
            <Link href="/provider-signup" data-growth-event="cta_click" data-growth-surface="home_final" data-growth-target="provider_signup" style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', color: 'var(--gold)', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>Devenir prestataire →</Link>
          </div>
          {!session?.user && <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 24 }}>
            Déjà un compte ? <Link href="/login" style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', color: 'var(--teal)', fontWeight: 700, textDecoration: 'none' }}>Me connecter</Link>
          </p>}
        </div>
      </section>
      </main>
    </>
  )
}

function HomeEventCard({ event, badge, boosted = false, reason, eager = false }: { event: PublicEvent; badge?: string; boosted?: boolean; reason?: string; eager?: boolean }) {
  const prices = (event.places || []).map((place) => Number(place.price)).filter((price) => Number.isFinite(price) && price >= 0)
  const minPrice = prices.length ? Math.min(...prices) : null
  // Cartes du "Top 3 du classement" (badge 01/02/03) avec des tailles de
  // texte plus grandes que les autres grilles d'événements de la home —
  // retour client : titres/labels du classement trop petits pour du contenu
  // mis en avant. Le titre à 22px reste cohérent avec la hiérarchie du
  // reste de la home (proche des 20-22px utilisés pour les titres de carte
  // prestataires/section juste en dessous).
  const isRanking = Boolean(badge)
  return (
    <Link href={`/events/${event.id}`} className="lb-card" style={{ ...card, overflow: 'hidden', display: 'block', color: 'inherit', textDecoration: 'none', position: 'relative' }}>
      <div style={{ position: 'relative', aspectRatio: '16/9', background: `radial-gradient(circle at 25% 10%,${event.color || '#8444ff'}55,transparent 58%),var(--surface-2)` }}>
        <Image
          src={event.imageUrl || placeholderPhotoUrl(event.id, 460, 259)}
          alt={event.name}
          fill
          loading={eager ? 'eager' : undefined}
          style={{ objectFit: 'cover' }}
          sizes="(max-width: 768px) 100vw, 230px"
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(4,4,11,.74),transparent 58%)' }} />
        {badge ? (
                      <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 16, lineHeight: 1, fontWeight: 900, color: badge === '01' ? 'var(--gold)' : '#fff', textShadow: '0 2px 12px #000' }}>{badge}</span>
        ) : (
          <DateBadge dateISO={event.date} />
        )}
        {boosted && <span style={{ position: 'absolute', top: 10, right: 10, borderRadius: 999, background: 'var(--gold)', color: '#181104', padding: '4px 8px', fontSize: isRanking ? 10.5 : 9.5, fontWeight: 900 }}>À LA UNE</span>}
        {reason && <span style={{ position: 'absolute', left: 10, bottom: 10, maxWidth: 'calc(100% - 20px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 999, border: '1px solid rgba(132,68,255,.48)', background: 'rgba(5,6,10,.86)', color: '#e5d8ff', padding: '5px 9px', fontSize: 10.5, fontWeight: 700 }}>{reason}</span>}
      </div>
      <div style={{ minHeight: 112, padding: '14px 14px 15px', display: 'flex', flexDirection: 'column' }}>
        <p style={{ margin: 0, color: '#fff', fontSize: isRanking ? 19 : 17, lineHeight: 1.2, fontWeight: 800, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{event.name}</p>
        <p style={{ margin: '7px 0 0', color: 'var(--text-muted)', fontSize: isRanking ? 13.5 : 13 }}>{[event.dateDisplay, event.city].filter(Boolean).join(' · ') || 'Bientôt'}</p>
        <p style={{ margin: 'auto 0 0', paddingTop: 9, color: 'var(--gold)', fontSize: isRanking ? 13.5 : 12.5, fontWeight: 800 }}>{minPrice == null || minPrice <= 0 ? 'Gratuit' : `Dès ${fmtMoney(minPrice, eventCurrency(event))}`}</p>
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

function EmptyCard({ text, ctaHref, ctaLabel }: { text: string; ctaHref: string; ctaLabel: string }) {
  return (
    <Card accent="var(--border-strong)" style={{ ...CARD_OVERRIDE, padding: 24, textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
      <Mascot mood="sleeping" size={126} />
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{text}</p>
      <Link href={ctaHref} style={{ ...btnGhost, minHeight: 42, marginTop: 14, padding: '10px 18px', display: 'inline-flex' }}>{ctaLabel}</Link>
    </Card>
  )
}

// Boutons rectangulaires, texte MAJUSCULES + tracking — langage visuel du
// site de référence (chillandgroovefestival.com : "PRENDRE MON PASS",
// "Acheter"), couleurs LIVEINBLACK inchangées (décision client : polices/
// mise en page oui, palette non).
const card: React.CSSProperties = { background: 'rgba(24,24,27,.92)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 15, boxShadow: '0 16px 42px rgba(0,0,0,.2)' }
// Overrides passés à <Card> pour les usages non-<Link> ci-dessus : mêmes
// tokens que `card` (fond dégradé, rayon xl, ombre), mais composés via le
// primitif partagé plutôt que dupliqués — `card` reste nécessaire tel quel
// pour les usages sur <Link>, que Card (toujours un <div>) ne peut pas
// remplacer sans étendre son API avec un prop `as` (hors scope ici).
const CARD_OVERRIDE: React.CSSProperties = { background: card.background, borderRadius: card.borderRadius, boxShadow: card.boxShadow }
const btnPrimary: React.CSSProperties = { minHeight: 34, padding: '7px 14px', borderRadius: 13, fontSize: 12.5, fontWeight: 650, color: 'var(--primary-ink)', background: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const btnGhost: React.CSSProperties = { minHeight: 34, padding: '7px 14px', borderRadius: 13, fontSize: 12.5, fontWeight: 650, color: '#fff', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.18)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const btnSolid: React.CSSProperties = { minHeight: 34, padding: '7px 14px', borderRadius: 13, fontSize: 12.5, fontWeight: 650, textTransform: 'none', letterSpacing: 'normal', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }
const featList: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }
const featItem: React.CSSProperties = { fontSize: 14, lineHeight: 1.42, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'baseline' }
