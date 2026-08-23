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
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
import { Mascot } from '@/app/components/ui'

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

  return (
    <>
      <div style={{ padding: '18px 0 0' }}>
        <Link href="/organizers" style={{ minHeight: 44, fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeft size={14} /> Organisateurs
        </Link>
      </div>
      <div style={{ position: 'relative', height: 220, margin: '14px 0 0', borderRadius: 'var(--radius-xl)', overflow: 'hidden', border: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--surface-2), rgba(139,92,246,.22))' }}>
        <Image src={organizer.bannerUrl || placeholderPhotoUrl(organizer.userId, 1200, 500)} alt="" fill loading="eager" style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 960px" />
      </div>

      <div style={{ padding: '0 22px', marginTop: -32, position: 'relative' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', border: '3px solid var(--obsidian)', overflow: 'hidden', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 }}>
          {organizer.avatarUrl ? (
            <Image src={organizer.avatarUrl} alt={organizer.publicName} width={72} height={72} style={{ objectFit: 'cover' }} />
          ) : (
            organizer.publicName[0]?.toUpperCase()
          )}
        </div>
        <h1 className="font-display" style={{ fontSize: 30, letterSpacing: '.01em', margin: '12px 0 0' }}>
          {organizer.publicName}
          {organizer.isVerified && (
            <span style={{ fontFamily: 'var(--font-open-sans), sans-serif', textTransform: 'none', fontWeight: 700, marginLeft: 8, fontSize: 13, color: 'var(--teal)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <BadgeCheck size={14} /> vérifié
            </span>
          )}
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
              appearance="outline"
            />
            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5, margin: '10px 0 0', maxWidth: 620 }}>
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
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <Mascot mood="sleeping" size={118} />
              <p style={{ fontSize: 13.5, color: 'var(--text-faint)', margin: 0 }}>Aucun événement à venir pour le moment.</p>
            </div>
          ) : (
            <div className="lb-card-grid-compact">
              {upcoming.map((e) => {
                const prices = (e.places || []).map((p) => Number(p.price) || 0).filter(Boolean)
                const min = prices.length ? Math.min(...prices) : null
                return (
                  <Link key={e.id} href={`/events/${e.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ aspectRatio: '4/3', position: 'relative', background: `linear-gradient(135deg, ${e.color || '#b8f34a'}33, var(--obsidian))` }}>
                      {e.imageUrl && (
                        <Image src={e.imageUrl} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 45vw, 180px" />
                      )}
                    </div>
                    <div style={{ padding: '8px 9px' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{e.name}</p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[e.dateDisplay, e.city].filter(Boolean).join(' · ')}</p>
                      {min != null && <p style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, margin: '3px 0 0' }}>dès {fmtMoney(min, eventCurrency(e))}</p>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Section>

        {past.length > 0 && (
          <Section title="Événements passés">
            <div className="lb-card-grid-compact">
              {past.map((e) => (
                <Link key={e.id} href={`/events/${e.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px', opacity: 0.75 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>{e.dateDisplay}</p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {visibleMedia.length > 0 && (
          <Section title="Photos & vidéos">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {visibleMedia.map((m) => (
                <div key={m.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
                  {m.type === 'video' ? (
                    <video src={m.url} controls preload="metadata" playsInline aria-label={m.title || `Vidéo de ${organizer.publicName}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Image src={m.url} alt={m.title || ''} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 50vw, 140px" />
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
              <a href={`tel:${organizer.proPhone.replace(/[^+\d]/g, '')}`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 13.5, color: 'var(--teal)', marginTop: 6, textDecoration: 'none' }}>
                {organizer.proPhone}
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
      <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>{label}</p>
    </div>
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
