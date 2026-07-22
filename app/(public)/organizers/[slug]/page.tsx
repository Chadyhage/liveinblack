import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/auth'
import { getOrganizerBySlug, getOrganizerEvents } from '@/lib/server/organizers'
import { isFollowing } from '@/lib/server/organizerFollows'
import { getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import OrganizerFollowButtonClient from '@/app/components/OrganizerFollowButtonClient'
import PublicProfileActions from '@/app/components/PublicProfileActions'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const organizer = await getOrganizerBySlug(slug)
  if (!organizer) return { title: 'Organisateur — LIVEINBLACK' }
  return { title: `${organizer.publicName} — LIVEINBLACK`, description: organizer.shortDescription?.slice(0, 160) }
}

// Profil public complet : abonnement, contact, partage et signalement.
export default async function PublicOrganizerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
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

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '0 0 60px', width: '100%' }}>
      <div style={{ padding: '14px 22px 0' }}>
        <Link href="/organizers" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← Organisateurs
        </Link>
      </div>
      <div style={{ position: 'relative', height: 200, margin: '14px 22px 0', borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(135deg, rgba(139,92,246,.3), var(--obsidian))' }}>
        {organizer.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={organizer.bannerUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>

      <div style={{ padding: '0 22px', marginTop: -32, position: 'relative' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', border: '3px solid var(--obsidian)', overflow: 'hidden', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 }}>
          {organizer.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={organizer.avatarUrl} alt={organizer.publicName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            organizer.publicName[0]?.toUpperCase()
          )}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '12px 0 0' }}>
          {organizer.publicName}
          {organizer.isVerified && <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--teal)' }}>✓ vérifié</span>}
        </h1>
        {(organizer.city || zones.length > 0) && <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>{[organizer.city, ...zones].filter(Boolean).join(' · ')}</p>}
        <PublicProfileActions targetUserId={organizer.userId} displayName={organizer.publicName} isAuthenticated={Boolean(session?.user)} isSelf={isSelf} />

        {!isSelf && (
          <div style={{ marginTop: 14 }}>
            <OrganizerFollowButtonClient
              organizerId={organizer.userId}
              organizerName={organizer.publicName}
              initialFollowing={followState.following}
              isAuthenticated={Boolean(session?.user)}
            />
            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5, margin: '10px 0 0', maxWidth: 420 }}>
              En t&apos;abonnant, tu acceptes de partager ton e-mail avec cet organisateur afin de recevoir ses actualités. Tu peux personnaliser tes alertes ou
              te désabonner à tout moment depuis{' '}
              <Link href="/profile/followed-organizers" style={{ color: 'var(--teal)' }}>
                tes organisateurs suivis
              </Link>
              .
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
          <KPI value={organizer.followersCount} label="Abonnés" />
          <KPI value={Math.max(organizer.totalEventsCount, upcoming.length + past.length)} label="Événements" />
        </div>

        <Section title="Événements à venir">
          {upcoming.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>Aucun événement à venir pour le moment.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {upcoming.map((e) => {
                const prices = (e.places || []).map((p) => Number(p.price) || 0).filter(Boolean)
                const min = prices.length ? Math.min(...prices) : null
                return (
                  <Link key={e.id} href={`/events/${e.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ aspectRatio: '4/3', position: 'relative', background: `linear-gradient(135deg, ${e.color || '#c8a96e'}33, var(--obsidian))` }}>
                      {e.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>{e.name}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '3px 0 0' }}>{[e.dateDisplay, e.city].filter(Boolean).join(' · ')}</p>
                      {min != null && <p style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, margin: '4px 0 0' }}>dès {fmtMoney(min, eventCurrency(e))}</p>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Section>

        {past.length > 0 && (
          <Section title="Événements passés">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {past.map((e) => (
                <Link key={e.id} href={`/events/${e.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', opacity: 0.75 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{e.name}</p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '3px 0 0' }}>{e.dateDisplay}</p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {visibleMedia.length > 0 && (
          <Section title="Photos & vidéos">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {visibleMedia.map((m) => (
                <div key={m.id} style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
                  {m.type === 'video' ? (
                    <video src={m.url} controls preload="metadata" playsInline aria-label={m.title || `Vidéo de ${organizer.publicName}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {showLongDescription && (
          <Section title="À propos">
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{organizer.longDescription}</p>
          </Section>
        )}

        {(organizer.city || organizer.proPhone) && (
          <Section title="Contact">
            {organizer.city && <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0 }}>{[organizer.city, organizer.country].filter(Boolean).join(', ')}</p>}
            {organizer.proPhone && (
              <a href={`tel:${organizer.proPhone.replace(/[^+\d]/g, '')}`} style={{ display: 'inline-block', fontSize: 13.5, color: 'var(--teal)', marginTop: 6, textDecoration: 'none' }}>
                {organizer.proPhone}
              </a>
            )}
          </Section>
        )}
      </div>
    </main>
  )
}

function KPI({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>{label}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h2>
      {children}
    </section>
  )
}
