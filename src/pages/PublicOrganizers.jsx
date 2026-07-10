import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import PublicNav from '../components/PublicNav'
import OrganizerFollowButton from '../components/OrganizerFollowButton'
import { useAuth } from '../context/AuthContext'
import { cacheOrganizerProfiles, getLocalOrganizerProfiles } from '../utils/organizers'
import { regions } from '../data/regions'
import { matchesEntityRegion, normalizeGeoText, normalizeRegionIds, getRegionName } from '../utils/locations'

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
      return [profile.publicName, profile.city, profile.country, profile.shortDescription]
        .filter(Boolean).map(normalizeGeoText).join(' ').includes(q)
    })
    return list.sort((a, b) => sort === 'recent'
      ? (b.createdAt || 0) - (a.createdAt || 0)
      : (b.followersCount || 0) - (a.followersCount || 0))
  }, [profiles, eventData, query, regionId, upcomingOnly, sort])

  const content = (
    <div className="org-directory">
      <style>{`
        .org-directory{min-height:100vh;color:#fff;background:radial-gradient(circle 900px at 6% 4%,rgba(139,92,246,.28),transparent 60%),radial-gradient(circle 820px at 96% 30%,rgba(200,169,110,.14),transparent 56%),radial-gradient(circle 950px at 50% 100%,rgba(224,90,170,.15),transparent 60%),${C.obsidian};background-attachment:fixed;font-family:${FONT};overflow-x:hidden}
        .org-wrap{max-width:1120px;margin:0 auto;padding:48px 22px 72px;position:relative}
        .org-hero{text-align:center;margin-bottom:8px}
        .org-eyebrow{font:800 11px ${UI};letter-spacing:.08em;text-transform:uppercase;color:${C.gold};margin:0}
        .org-title{font:800 clamp(30px,7vw,52px)/1.05 ${UI};letter-spacing:-1.2px;margin:10px 0 0}
        .org-title span{color:${C.gold}}
        .org-sub{max-width:540px;margin:16px auto 0;color:rgba(255,255,255,.6);font-size:clamp(14px,4vw,17px);line-height:1.5}
        .org-searchbar{display:flex;align-items:center;gap:10px;max-width:520px;margin:26px auto 0;padding:4px 4px 4px 16px;border-radius:999px;background:#0b0c12;border:1px solid rgba(255,255,255,.14);transition:border-color .2s}
        .org-searchbar:focus-within{border-color:rgba(78,232,200,.5)}
        .org-searchbar input{flex:1;background:none;border:0;outline:0;color:#fff;font:14px ${FONT};padding:11px 0}
        .org-filters{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin:16px auto 0}
        .org-pill{height:40px;padding:0 15px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.72);font:600 12.5px ${UI};cursor:pointer;outline:none}
        .org-pill.active{color:${C.teal};border-color:rgba(78,232,200,.5);background:rgba(78,232,200,.12)}
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
        @media(max-width:1120px){.org-card{grid-template-columns:minmax(260px,.8fr) 1fr}.org-cover{border-radius:16px 0 0 0}.org-action-panel{grid-column:1/-1;border-left:0;border-top:1px solid rgba(255,255,255,.09);padding:18px 24px}.org-actions{display:grid;grid-template-columns:1fr auto}.org-avatar{left:-40px}}
        @media(max-width:640px){.org-wrap{padding:34px 14px 108px}.org-card{grid-template-columns:1fr}.org-cover{min-height:190px;border-radius:16px 16px 0 0}.org-card-body{padding:48px 18px 24px}.org-avatar{left:18px;top:-41px;bottom:auto}.org-action-panel{grid-column:auto;padding:16px 18px 20px}.org-actions{grid-template-columns:1fr 1fr}}
      `}</style>
      {!user && <PublicNav />}
      <main className="org-wrap">
        <section className="org-hero">
          <p className="org-eyebrow">L'annuaire</p>
          <h1 className="org-title">Les organisateurs qui font<br /><span>vibrer la nuit.</span></h1>
          <p className="org-sub">Découvre celles et ceux qui donnent vie aux événements, suis-les et ne rate plus une soirée.</p>
          <label className="org-searchbar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un organisateur, une ville…" />
          </label>
          <div className="org-filters">
            <select className="org-pill" value={regionId} onChange={e => setRegionId(e.target.value)} aria-label="Filtrer par région">
              <option value="">Toutes les régions</option>{regions.map(region => <option key={region.id} value={region.id}>{region.flag} {region.name}</option>)}
            </select>
            <button className={`org-pill ${upcomingOnly ? 'active' : ''}`} onClick={() => setUpcomingOnly(v => !v)}>Événements à venir</button>
            <select className="org-pill" value={sort} onChange={e => setSort(e.target.value)} aria-label="Trier les organisateurs">
              <option value="popular">Les plus populaires</option><option value="recent">Les plus récents</option>
            </select>
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
              return (
                <article className="org-card" key={profile.id}>
                  <div className="org-cover" style={profile.bannerUrl ? { background: `url(${profile.bannerUrl}) center/cover` } : undefined} />
                  <div className="org-card-body">
                    <div className="org-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} /> : (profile.publicName?.[0] || 'O')}</div>
                    <h2 style={{ fontFamily:DISPLAY,fontSize:'clamp(30px,3.3vw,44px)',lineHeight:1,letterSpacing:'.025em',margin:0 }}>{profile.publicName}</h2>
                    <p style={{ fontFamily:UI,fontSize:11,fontWeight:700,color:C.gold,letterSpacing:'.06em',margin:'9px 0 0',textTransform:'uppercase' }}>{[profile.city, ...normalizeRegionIds(profile.zonesIntervention?.length ? profile.zonesIntervention : [profile.regionId || profile.country]).map(getRegionName)].filter(Boolean).join(' · ') || 'Live in Black'}</p>
                    <p style={{ color:'rgba(255,255,255,.58)',fontSize:13.5,lineHeight:1.65,margin:'15px 0 0' }}>{profile.shortDescription || 'Découvre ses prochains événements et son univers.'}</p>
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
