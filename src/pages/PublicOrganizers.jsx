import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import PublicNav from '../components/PublicNav'
import OrganizerFollowButton from '../components/OrganizerFollowButton'
import { useAuth } from '../context/AuthContext'
import { cacheOrganizerProfiles, getLocalOrganizerProfiles } from '../utils/organizers'
import { regions } from '../data/regions'
import { matchesEntityRegion, normalizeGeoText } from '../utils/locations'

const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa' }
const FONT = 'Inter, system-ui, sans-serif'
const DISPLAY = 'Bebas Neue, Impact, sans-serif'
const UI = 'Inter, sans-serif'

const dateValue = event => {
  const value = event?.date || event?.startDate
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

export default function PublicOrganizers() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState(() => getLocalOrganizerProfiles().filter(p => p.status === 'public'))
  const [events, setEvents] = useState([])
  const [query, setQuery] = useState('')
  const [regionId, setRegionId] = useState('')
  const [upcomingOnly, setUpcomingOnly] = useState(false)
  const [sort, setSort] = useState('popular')

  useEffect(() => {
    let stopProfiles = () => {}
    let stopEvents = () => {}
    import('../utils/firestore-sync').then(({ listenOrganizerProfiles, listenEvents }) => {
      stopProfiles = listenOrganizerProfiles(items => {
        cacheOrganizerProfiles(items)
        setProfiles(items)
      })
      stopEvents = listenEvents(setEvents)
    }).catch(() => {})
    return () => { stopProfiles(); stopEvents() }
  }, [])

  const eventData = useMemo(() => {
    const now = Date.now()
    const byOrganizer = {}
    for (const event of events) {
      if (event.isPrivate) continue
      const id = event.organizerId || event.createdBy
      if (!id) continue
      if (!byOrganizer[id]) byOrganizer[id] = []
      byOrganizer[id].push(event)
    }
    for (const list of Object.values(byOrganizer)) list.sort((a, b) => dateValue(a) - dateValue(b))
    return { now, byOrganizer }
  }, [events])

  const filtered = useMemo(() => {
    const q = normalizeGeoText(query)
    const list = profiles.filter(profile => {
      const ownEvents = eventData.byOrganizer[profile.id] || []
      const next = ownEvents.find(e => !e.cancelled && dateValue(e) >= eventData.now)
      if (!matchesEntityRegion(profile, regionId, ownEvents)) return false
      if (upcomingOnly && !next) return false
      if (!q) return true
      return [profile.publicName, profile.city, profile.country, profile.shortDescription, ...(profile.eventTypes || []), ...(profile.vibes || [])]
        .filter(Boolean).map(normalizeGeoText).join(' ').includes(q)
    })
    return list.sort((a, b) => sort === 'recent'
      ? (b.createdAt || 0) - (a.createdAt || 0)
      : (b.followersCount || 0) - (a.followersCount || 0))
  }, [profiles, eventData, query, regionId, upcomingOnly, sort])

  const content = (
    <div className="org-directory">
      <style>{`
        .org-directory{min-height:100vh;color:#fff;background:radial-gradient(circle 900px at 0% 4%,rgba(139,92,246,.18),transparent 58%),radial-gradient(circle 760px at 100% 90%,rgba(224,90,170,.12),transparent 58%),${C.obsidian};font-family:${FONT};overflow:hidden}
        .org-wrap{max-width:1280px;margin:0 auto;padding:64px 30px 96px;position:relative}
        .org-hero{display:grid;grid-template-columns:minmax(520px,.95fr) minmax(500px,1.05fr);gap:40px;align-items:end;margin-bottom:64px}
        .org-title{font-family:${DISPLAY};font-size:clamp(68px,6.7vw,104px);line-height:.84;letter-spacing:.015em;margin:0;text-transform:uppercase;white-space:nowrap}
        .org-title-line{width:68px;height:2px;margin:24px 0;background:linear-gradient(90deg,${C.gold},transparent)}
        .org-sub{max-width:390px;margin:0;color:rgba(255,255,255,.62);font-size:17px;line-height:1.6}
        .org-controls{padding:18px;border:1px solid rgba(255,255,255,.1);background:#12131c;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.45)}
        .org-search{display:flex;align-items:center;gap:13px;padding:0 17px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#0b0c12;height:58px;transition:border-color .2s,box-shadow .2s}
        .org-search:focus-within{border-color:#8444ff;box-shadow:0 0 0 3px rgba(132,68,255,.12)}
        .org-search input{flex:1;background:none;border:0;outline:0;color:#fff;font:14px ${FONT}}
        .org-filters{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px}
        .org-filter{height:44px;padding:0 12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:rgba(255,255,255,.75);font:600 11px ${UI};letter-spacing:.04em;text-transform:uppercase;cursor:pointer;min-width:0}
        .org-filter.active{color:${C.teal};border-color:rgba(78,232,200,.48);background:rgba(78,232,200,.12)}
        .org-results-head{display:flex;align-items:center;gap:18px;margin-bottom:18px;color:${C.gold};font:700 11px ${UI};letter-spacing:.08em;text-transform:uppercase}
        .org-results-head:after{content:'';height:1px;flex:1;background:rgba(255,255,255,.1)}
        .org-grid{display:flex;flex-direction:column;gap:18px}
        .org-card{display:grid;grid-template-columns:minmax(320px,1.05fr) minmax(300px,.8fr) 210px;min-height:276px;background:#0e0f16;border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:visible;box-shadow:0 8px 24px rgba(0,0,0,.35);transition:transform .28s ease,border-color .28s ease,box-shadow .28s ease;min-width:0}
        .org-card:hover{transform:translateY(-3px);border-color:rgba(78,232,200,.38);box-shadow:0 28px 70px rgba(0,0,0,.35)}
        .org-cover{min-height:276px;position:relative;background:linear-gradient(135deg,rgba(139,92,246,.22),rgba(139,92,246,.04));overflow:hidden;border-radius:16px 0 0 16px}
        .org-cover:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 45%,rgba(7,9,16,.2)),linear-gradient(to top,rgba(7,9,16,.85),transparent 55%)}
        .org-card-body{padding:38px 34px;position:relative;display:flex;flex-direction:column;justify-content:center;min-width:0}
        .org-avatar{width:82px;height:82px;border-radius:50%;overflow:hidden;border:3px solid #0e0f16;background:#11151d;display:grid;place-items:center;position:absolute;left:-43px;bottom:22px;z-index:2;font:36px ${DISPLAY};color:${C.teal};box-shadow:0 10px 30px rgba(0,0,0,.45)}
        .org-action-panel{border-left:1px solid rgba(255,255,255,.09);padding:32px 24px;display:flex;flex-direction:column;justify-content:center;gap:10px}
        .org-actions{display:flex;flex-direction:column;gap:10px}
        .org-view{min-height:48px;border:none;border-radius:12px;background:${C.gold};color:#090a0f;font:700 13px ${FONT};letter-spacing:.015em;cursor:pointer;transition:transform .2s ease,filter .2s ease}
        .org-view:hover{filter:brightness(1.08);transform:translateY(-1px)}
        .org-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:16px}
        .org-tag{padding:4px 10px;border-radius:8px;background:rgba(200,169,110,.14);border:1px solid rgba(200,169,110,.35);color:${C.gold};font:700 11px ${UI};letter-spacing:.04em;text-transform:uppercase}
        .org-empty{padding:64px 20px;text-align:center;background:#0e0f16;border:1px solid rgba(255,255,255,.08);border-radius:16px;color:rgba(255,255,255,.55);font:500 14px ${UI}}
        @media(max-width:1120px){.org-hero{grid-template-columns:1fr;gap:30px}.org-title{white-space:normal}.org-card{grid-template-columns:minmax(260px,.8fr) 1fr}.org-cover{border-radius:16px 0 0 0}.org-action-panel{grid-column:1/-1;border-left:0;border-top:1px solid rgba(255,255,255,.09);padding:18px 24px}.org-actions{display:grid;grid-template-columns:1fr auto}.org-avatar{left:-40px}}
        @media(max-width:640px){.org-wrap{padding:38px 14px 108px}.org-title{font-size:66px}.org-sub{font-size:14px}.org-controls{padding:10px}.org-filters{grid-template-columns:1fr}.org-card{grid-template-columns:1fr}.org-cover{min-height:190px;border-radius:16px 16px 0 0}.org-card-body{padding:48px 18px 24px}.org-avatar{left:18px;top:-41px;bottom:auto}.org-action-panel{grid-column:auto;padding:16px 18px 20px}.org-actions{grid-template-columns:1fr 1fr}}
      `}</style>
      {!user && <PublicNav />}
      <main className="org-wrap">
        <section className="org-hero">
          <div>
            <h1 className="org-title">Organisateurs</h1>
            <div className="org-title-line" />
            <p className="org-sub">Découvre celles et ceux qui donnent vie aux événements.</p>
          </div>
          <div className="org-controls">
            <label className="org-search">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.48)" strokeWidth="1.7"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un organisateur ou une ville" />
            </label>
            <div className="org-filters">
              <select className="org-filter" value={regionId} onChange={e => setRegionId(e.target.value)} aria-label="Filtrer par région">
                <option value="">Toutes les régions</option>{regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
              </select>
              <button className={`org-filter ${upcomingOnly ? 'active' : ''}`} onClick={() => setUpcomingOnly(v => !v)}>Événements à venir</button>
              <select className="org-filter" value={sort} onChange={e => setSort(e.target.value)} aria-label="Trier les organisateurs">
                <option value="popular">Les plus populaires</option><option value="recent">Les plus récents</option>
              </select>
            </div>
          </div>
        </section>

        <div className="org-results-head">
          {query || regionId || upcomingOnly ? `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}` : 'Tous les organisateurs'}
        </div>

        {filtered.length === 0 ? <div className="org-empty">{profiles.length === 0 ? 'Aucune page organisateur n’est disponible pour le moment.' : 'Aucun organisateur ne correspond à ta recherche.'}</div> : (
          <div className="org-grid">
            {filtered.map(profile => {
              const ownEvents = eventData.byOrganizer[profile.id] || []
              const next = ownEvents.find(e => !e.cancelled && dateValue(e) >= eventData.now)
              const tags = [...new Set([...(profile.vibes || []), ...(profile.eventTypes || [])])].slice(0, 4)
              return (
                <article className="org-card" key={profile.id}>
                  <div className="org-cover" style={profile.bannerUrl ? { background: `url(${profile.bannerUrl}) center/cover` } : undefined} />
                  <div className="org-card-body">
                    <div className="org-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} /> : (profile.publicName?.[0] || 'O')}</div>
                    <h2 style={{ fontFamily:DISPLAY,fontSize:'clamp(30px,3.3vw,44px)',lineHeight:1,letterSpacing:'.025em',margin:0 }}>{profile.publicName}</h2>
                    <p style={{ fontFamily:UI,fontSize:11,fontWeight:700,color:C.gold,letterSpacing:'.06em',margin:'9px 0 0',textTransform:'uppercase' }}>{[profile.city, profile.country].filter(Boolean).join(' · ') || 'Live in Black'}</p>
                    <p style={{ color:'rgba(255,255,255,.58)',fontSize:13.5,lineHeight:1.65,margin:'15px 0 0' }}>{profile.shortDescription || 'Découvre ses prochains événements et son univers.'}</p>
                    {tags.length > 0 && <div className="org-tags">{tags.map(tag => <span className="org-tag" key={tag}>{tag}</span>)}</div>}
                    {next && <p style={{ margin:'16px 0 0',paddingTop:14,borderTop:'1px solid rgba(255,255,255,.08)',fontFamily:UI,fontSize:11,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.05em',textTransform:'uppercase' }}>Prochain événement · <span style={{color:'#fff'}}>{next.name}</span></p>}
                  </div>
                  <div className="org-action-panel">
                    <p style={{ margin:0,fontFamily:UI,fontSize:12,lineHeight:1.6,color:'rgba(255,255,255,.5)' }}>Découvre sa programmation, son univers et ses prochains rendez-vous.</p>
                    <div className="org-actions">
                      <button className="org-view" onClick={() => navigate(`/organisateurs/${profile.slug}`)}>Découvrir la page</button>
                      <OrganizerFollowButton organizer={profile} compact appearance="premium" />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )

  return user ? <Layout>{content}</Layout> : content
}
