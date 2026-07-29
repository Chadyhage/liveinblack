import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { auth } from '@/auth'
import { getCachedPublicOrganizersWithNextEvent as listPublicOrganizersWithNextEvent } from '@/lib/server/publicCache'
import { listMyFollowedOrganizers } from '@/lib/server/organizerFollows'
import {
  normalizeGeoText,
  getEntityRegionIds,
  getRegionName,
  matchesEntityRegion,
} from '@/lib/shared/locations'
import { regions } from '@/lib/shared/regions'
import OrganizerFollowButtonClient from '@/app/components/OrganizerFollowButtonClient'
import FilterSelect from '../_components/FilterSelect'
import { Button, Checkbox, Input, PageLinks, pageSlice } from '@/app/components/ui'

const PAGE_SIZE = 20

export const metadata: Metadata = {
  title: 'Organisateurs — LIVEINBLACK',
  description: "Découvrez les organisateurs d'événements et de soirées et suivez ceux qui font la nuit sur LIVEINBLACK.",
}

export const dynamic = 'force-dynamic'

type DirectoryParams = {
  q?: string
  region?: string
  upcoming?: string
  sort?: string
  page?: string
}

export default async function PublicOrganizersPage({ searchParams }: { searchParams: Promise<DirectoryParams> }) {
  const [{ q, region = '', upcoming, sort = 'popular', page: pageParam }, organizers, session] = await Promise.all([
    searchParams,
    listPublicOrganizersWithNextEvent(),
    auth(),
  ])
  const search = (q || '').trim()
  const upcomingOnly = upcoming === '1'
  const requestedPage = Math.max(1, Number(pageParam) || 1)

  const followResult = session?.user
    ? await listMyFollowedOrganizers({ id: session.user.id })
    : { ok: true as const, follows: [] }
  const followedIds = new Set(followResult.ok ? followResult.follows.map((follow) => follow.organizerId) : [])

  const filtered = organizers
    .filter((organizer) => {
      if (upcomingOnly && !organizer.nextEvent) return false
      if (!matchesEntityRegion(organizer, region, organizer.eventRegions)) return false
      if (!search) return true
      const zoneNames = getEntityRegionIds(organizer, organizer.eventRegions).map(getRegionName)
      const hay = [
        organizer.publicName,
        organizer.city,
        organizer.country,
        organizer.shortDescription,
        organizer.nextEvent?.name,
        ...zoneNames,
      ]
        .filter(Boolean)
        .map(normalizeGeoText)
        .join(' ')
      return hay.includes(normalizeGeoText(search))
    })
    .sort((a, b) => {
      if (sort !== 'recent') return (b.followersCount || 0) - (a.followersCount || 0)
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })

  const { pageItems: paged, pageCount, safePage } = pageSlice(filtered, requestedPage, PAGE_SIZE)
  function makeHref(p: number) {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (region) params.set('region', region)
    if (upcomingOnly) params.set('upcoming', '1')
    if (sort !== 'popular') params.set('sort', sort)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/organizers?${qs}` : '/organizers'
  }

  return (
    <main className="organizer-directory">
      <style>{`
        .organizer-directory{width:100%;min-height:100vh;padding:56px 22px 88px;background:radial-gradient(circle 700px at 5% 0%,rgba(184, 243, 74,.10),transparent 64%),radial-gradient(circle 700px at 96% 18%,rgba(159, 224, 34,.07),transparent 60%)}
        .organizer-directory__wrap{max-width:1240px;margin:0 auto}
        .organizer-directory__filters{display:grid;grid-template-columns:minmax(280px,1.8fr) minmax(180px,.8fr) minmax(180px,.8fr) auto auto;gap:10px;align-items:center;max-width:1100px;margin:30px auto 42px}
        .organizer-directory__field{min-width:0;padding:11px 14px;border-radius:999px;border:1px solid var(--border-strong);background:#0b0c12;color:var(--text);font-size:13px}
        .organizer-directory__check{min-height:42px;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 13px;border-radius:999px;border:1px solid var(--border-strong);background:rgba(255,255,255,.04);font-size:12px;color:var(--text-muted);white-space:nowrap}
        .organizer-directory__grid{display:flex;flex-direction:column;gap:16px}
        .organizer-directory__card{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(360px,1.2fr) 220px;min-height:260px;overflow:hidden;border:1px solid var(--border);border-radius:var(--radius-xl);background:var(--surface);box-shadow:0 18px 45px rgba(0,0,0,.2);transition:transform .25s ease,border-color .25s ease}
        .organizer-directory__card:hover{transform:translateY(-3px);border-color:rgba(184, 243, 74,.35)}
        .organizer-directory__cover{position:relative;min-height:230px;overflow:hidden;background:linear-gradient(135deg,rgba(139,92,246,.35),rgba(200,169,110,.12),var(--obsidian))}
        .organizer-directory__cover:after{content:'';position:absolute;inset:0;background:linear-gradient(to top,rgba(4,4,11,.82),transparent 65%)}
        .organizer-directory__body{position:relative;padding:38px 34px;color:inherit;text-decoration:none;display:flex;flex-direction:column;justify-content:center}
        .organizer-directory__actions{padding:32px 24px;border-left:1px solid var(--border);display:flex;flex-direction:column;justify-content:center;gap:12px}
        @media(max-width:820px){.organizer-directory__filters{grid-template-columns:1fr 1fr}.organizer-directory__filters button{grid-column:span 1}.organizer-directory__card{grid-template-columns:minmax(210px,.8fr) 1.2fr}.organizer-directory__actions{grid-column:1/-1;border-left:0;border-top:1px solid var(--border);padding:16px 20px;flex-direction:row;align-items:center}.organizer-directory__actions>*{flex:1}}
        @media(max-width:620px){.organizer-directory{padding:32px 14px 92px}.organizer-directory__filters{grid-template-columns:1fr}.organizer-directory__filters button{grid-column:auto}.organizer-directory__card{grid-template-columns:1fr}.organizer-directory__cover{min-height:170px}.organizer-directory__body{padding:30px 20px}.organizer-directory__actions{grid-column:auto}}
      `}</style>
      <div className="organizer-directory__wrap">
        <header style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--gold)', fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', fontFamily: 'var(--font-display), sans-serif' }}>L&apos;annuaire</p>
          <h1 className="font-display" style={{ margin: '10px 0 0', fontSize: 'clamp(34px, 7.5vw, 58px)', lineHeight: 1, letterSpacing: '.01em' }}>
            Les organisateurs qui font<br /><span style={{ color: 'var(--gold)' }}>vibrer la nuit.</span>
          </h1>
          <p style={{ maxWidth: 570, margin: '16px auto 0', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>
            Découvre leur univers, suis leur actualité et retrouve leurs prochains rendez-vous.
          </p>
        </header>

        <form action="/organizers" method="get" className="organizer-directory__filters">
          <Input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Nom, ville, événement…"
            style={{ minWidth: 0, minHeight: 48, borderRadius: 999, background: '#0b0c12', fontSize: 14 }}
          />
          <FilterSelect
            name="region"
            defaultValue={region}
            ariaLabel="Filtrer par région"
            options={[{ value: '', label: 'Toutes les régions' }, ...regions.map((item) => ({ value: item.id, label: `${item.flag} ${item.name}` }))]}
            style={{ minHeight: 48, borderRadius: 999, background: '#0b0c12', fontSize: 14 }}
          />
          <FilterSelect
            name="sort"
            defaultValue={sort}
            ariaLabel="Trier les organisateurs"
            options={[
              { value: 'popular', label: 'Plus populaires' },
              { value: 'recent', label: 'Plus récents' },
            ]}
            style={{ minHeight: 48, borderRadius: 999, background: '#0b0c12', fontSize: 14 }}
          />
          <Checkbox
            name="upcoming"
            value="1"
            defaultChecked={upcomingOnly}
            label="Événement à venir"
            style={{ minHeight: 42, padding: '0 13px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'rgba(255,255,255,.04)', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
          />
          <Button
            type="submit"
            variant="primary"
            style={{ minHeight: 48, padding: '0 22px', borderRadius: 999, textTransform: 'none', letterSpacing: 'normal', fontSize: 13 }}
          >
            Filtrer
          </Button>
        </form>

        <p style={{ margin: '0 0 14px', color: 'var(--text-faint)', fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', fontFamily: 'var(--font-display), sans-serif' }}>
          {filtered.length} organisateur{filtered.length !== 1 ? 's' : ''}
        </p>

        {filtered.length === 0 ? (
          <div style={{ maxWidth: 520, margin: '0 auto', padding: 38, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 18, background: 'var(--surface)' }}>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Aucun organisateur ne correspond à ces critères.</p>
            <Link href="/organizers" style={{ display: 'inline-block', marginTop: 14, color: 'var(--teal)', fontWeight: 700 }}>Effacer les filtres</Link>
          </div>
        ) : (
          <div className="organizer-directory__grid">
            {paged.map((organizer) => {
              const zones = getEntityRegionIds(organizer).map(getRegionName).filter(Boolean)
              const isSelf = session?.user?.id === organizer.userId
              return (
                  <article key={organizer.userId} className="organizer-directory__card lb-card">
                  <Link href={`/organizers/${organizer.slug}`} className="organizer-directory__cover" aria-label={`Découvrir ${organizer.publicName}`}>
                    {organizer.bannerUrl && (
                      <Image src={organizer.bannerUrl} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 820px) 100vw, 240px" />
                    )}
                    <div style={{ position: 'absolute', zIndex: 2, left: 18, bottom: 18, width: 58, height: 58, borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(4,4,11,.9)', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--teal)', fontSize: 23, fontWeight: 800 }}>
                      {organizer.avatarUrl ? (
                        <Image src={organizer.avatarUrl} alt={organizer.publicName} width={58} height={58} style={{ objectFit: 'cover' }} />
                      ) : organizer.publicName?.[0]?.toUpperCase()}
                    </div>
                  </Link>
                  <Link href={`/organizers/${organizer.slug}`} className="organizer-directory__body">
                    <h2 style={{ margin: 0, fontSize: 27, lineHeight: 1.1 }}>{organizer.publicName}</h2>
                    {(organizer.city || zones.length > 0) && <p style={{ margin: '7px 0 0', color: 'var(--gold)', fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', fontFamily: 'var(--font-display), sans-serif' }}>{[organizer.city, ...zones].filter(Boolean).slice(0, 3).join(' · ')}</p>}
                    <p style={{ margin: '14px 0 0', color: 'var(--text-muted)', fontSize: 13.5, lineHeight: 1.6 }}>{organizer.shortDescription || 'Découvre sa programmation et son univers.'}</p>
                    {organizer.nextEvent && (
                      <p style={{ margin: '16px 0 0', paddingTop: 13, borderTop: '1px solid var(--border)', color: 'var(--text-faint)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Prochain événement · <span style={{ color: '#fff' }}>{organizer.nextEvent.name}</span>
                      </p>
                    )}
                  </Link>
                  <div className="organizer-directory__actions">
                    <Link href={`/organizers/${organizer.slug}`} style={{ display: 'block', padding: '13px 16px', borderRadius: 999, textAlign: 'center', textDecoration: 'none', color: 'var(--primary-ink)', background: 'var(--primary)', fontWeight: 700, textTransform: 'none', letterSpacing: 'normal', fontSize: 12.5 }}>Découvrir la page</Link>
                    {!isSelf && (
                      <OrganizerFollowButtonClient
                        organizerId={organizer.userId}
                        organizerName={organizer.publicName}
                        initialFollowing={followedIds.has(organizer.userId)}
                        isAuthenticated={Boolean(session?.user)}
                        appearance="premium"
                      />
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <PageLinks page={safePage} pageCount={pageCount} makeHref={makeHref} totalItems={filtered.length} pageSize={PAGE_SIZE} />
      </div>
    </main>
  )
}
