import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import PublicNav from '../components/PublicNav'
import OrganizerFollowButton from '../components/OrganizerFollowButton'
import { useAuth } from '../context/AuthContext'
import { cacheOrganizerProfiles, getLocalOrganizerProfiles } from '../utils/organizers'

const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa' }
const FONT = 'Inter, system-ui, sans-serif'
const DISPLAY = 'Bebas Neue, Impact, sans-serif'
const UI = 'DM Mono, monospace'

const dateValue = event => {
  const value = event?.date || event?.startDate
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function formatCompact(value) {
  return new Intl.NumberFormat('fr-FR', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value || 0)
}

export default function PublicOrganizers() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState(() => getLocalOrganizerProfiles().filter(p => p.status === 'public'))
  const [events, setEvents] = useState([])
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
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

  const cities = useMemo(() => [...new Set(profiles.flatMap(profile => [
    profile.city,
    ...(eventData.byOrganizer[profile.id] || []).map(event => event.city),
  ]).map(value => value?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [profiles, eventData])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = profiles.filter(profile => {
      const ownEvents = eventData.byOrganizer[profile.id] || []
      const next = ownEvents.find(e => !e.cancelled && dateValue(e) >= eventData.now)
      const profileCities = [profile.city, ...ownEvents.map(event => event.city)].filter(Boolean)
      if (city && !profileCities.includes(city)) return false
      if (upcomingOnly && !next) return false
      if (!q) return true
      return [profile.publicName, profile.city, profile.country, profile.shortDescription, ...(profile.eventTypes || []), ...(profile.vibes || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    return list.sort((a, b) => sort === 'recent'
      ? (b.createdAt || 0) - (a.createdAt || 0)
      : (b.followersCount || 0) - (a.followersCount || 0))
  }, [profiles, eventData, query, city, upcomingOnly, sort])

  const content = (
    <div className="org-directory">
      <style>{`
        .org-directory{min-height:100vh;color:#fff;background:radial-gradient(circle 850px at 16% 0%,rgba(78,232,200,.08),transparent 60%),radial-gradient(circle 850px at 100% 35%,rgba(139,92,246,.13),transparent 60%),${C.obsidian};font-family:${FONT}}
        .org-wrap{max-width:1180px;margin:0 auto;padding:54px 24px 80px}
        .org-title{font-family:${DISPLAY};font-size:clamp(52px,8vw,88px);line-height:.95;letter-spacing:.02em;margin:0;text-align:center}
        .org-sub{max-width:560px;margin:14px auto 0;text-align:center;color:rgba(255,255,255,.58);font-size:16px;line-height:1.6}
        .org-search{max-width:620px;margin:30px auto 0;display:flex;align-items:center;gap:12px;padding:0 18px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.035);height:54px}
        .org-search input{flex:1;background:none;border:0;outline:0;color:#fff;font:14px ${FONT}}
        .org-filters{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin:18px auto 42px}
        .org-filter{height:39px;padding:0 13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.72);font:9px ${UI};letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
        .org-filter.active{color:${C.teal};border-color:rgba(78,232,200,.48);background:rgba(78,232,200,.07)}
        .org-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
        .org-card{overflow:hidden;background:rgba(9,11,18,.72);border:1px solid rgba(255,255,255,.1);transition:.28s ease;min-width:0}
        .org-card:hover{transform:translateY(-4px);border-color:rgba(78,232,200,.34)}
        .org-cover{height:168px;position:relative;background:linear-gradient(135deg,rgba(139,92,246,.24),rgba(78,232,200,.08))}
        .org-cover:after{content:'';position:absolute;inset:0;background:linear-gradient(to top,#090b12,transparent 72%)}
        .org-card-body{padding:0 18px 18px;position:relative}
        .org-avatar{width:76px;height:76px;border-radius:50%;overflow:hidden;border:3px solid #090b12;background:#11151d;display:grid;place-items:center;position:relative;margin-top:-38px;z-index:1;font:34px ${DISPLAY};color:${C.teal}}
        .org-actions{display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:18px}
        .org-view{border:1px solid rgba(200,169,110,.5);background:rgba(200,169,110,.07);color:${C.gold};font:9px ${UI};letter-spacing:.13em;text-transform:uppercase;cursor:pointer}
        .org-empty{padding:64px 20px;text-align:center;border:1px solid rgba(255,255,255,.09);color:rgba(255,255,255,.55)}
        @media(max-width:640px){.org-wrap{padding:34px 14px 100px}.org-title{font-size:56px}.org-sub{font-size:14px}.org-grid{grid-template-columns:1fr}.org-cover{height:145px}.org-actions{grid-template-columns:1fr 1fr}}
      `}</style>
      {!user && <PublicNav />}
      <main className="org-wrap">
        <h1 className="org-title">Organisateurs</h1>
        <p className="org-sub">Découvre les organisateurs d’événements sur Live in Black</p>
        <label className="org-search">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un organisateur, une ville…" />
        </label>
        <div className="org-filters">
          {cities.length > 0 && <select className="org-filter" value={city} onChange={e => setCity(e.target.value)} aria-label="Filtrer par ville">
            <option value="">Toutes les villes</option>{cities.map(value => <option key={value}>{value}</option>)}
          </select>}
          <button className={`org-filter ${upcomingOnly ? 'active' : ''}`} onClick={() => setUpcomingOnly(v => !v)}>Événements à venir</button>
          <select className="org-filter" value={sort} onChange={e => setSort(e.target.value)} aria-label="Trier les organisateurs">
            <option value="popular">Les plus populaires</option><option value="recent">Les plus récents</option>
          </select>
        </div>

        {filtered.length === 0 ? <div className="org-empty">{profiles.length === 0 ? 'Aucune page organisateur publique n’est encore activée.' : 'Aucun organisateur ne correspond à ta recherche.'}</div> : (
          <div className="org-grid">
            {filtered.map(profile => {
              const ownEvents = eventData.byOrganizer[profile.id] || []
              const next = ownEvents.find(e => !e.cancelled && dateValue(e) >= eventData.now)
              const total = Math.max(Number(profile.totalEventsCount) || 0, ownEvents.length)
              return (
                <article className="org-card" key={profile.id}>
                  <div className="org-cover" style={profile.bannerUrl ? { background: `url(${profile.bannerUrl}) center/cover` } : undefined} />
                  <div className="org-card-body">
                    <div className="org-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} /> : (profile.publicName?.[0] || 'O')}</div>
                    <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:12,flexWrap:'wrap' }}>
                      <h2 style={{ fontFamily:DISPLAY,fontSize:30,letterSpacing:'.025em',margin:0 }}>{profile.publicName}</h2>
                    </div>
                    <p style={{ fontFamily:UI,fontSize:10,color:C.gold,letterSpacing:'.08em',margin:'3px 0 0' }}>{[profile.city, profile.country].filter(Boolean).join(' · ') || 'Live in Black'}</p>
                    <p style={{ color:'rgba(255,255,255,.55)',fontSize:13,lineHeight:1.55,minHeight:40,margin:'13px 0 0' }}>{profile.shortDescription || 'Découvre ses prochains événements et son univers.'}</p>
                    <div style={{ display:'flex',gap:22,paddingTop:14,marginTop:14,borderTop:'1px solid rgba(255,255,255,.08)',fontFamily:UI,fontSize:9,color:'rgba(255,255,255,.48)',textTransform:'uppercase',letterSpacing:'.09em' }}>
                      <span><b style={{color:'#fff',fontSize:14}}>{formatCompact(profile.followersCount)}</b><br/>abonnés</span>
                      <span><b style={{color:'#fff',fontSize:14}}>{total}</b><br/>événements</span>
                    </div>
                    {next && <p style={{ margin:'13px 0 0',fontFamily:UI,fontSize:9,color:'rgba(255,255,255,.5)',letterSpacing:'.07em' }}>PROCHAIN · <span style={{color:'#fff'}}>{next.name}</span></p>}
                    <div className="org-actions">
                      <button className="org-view" onClick={() => navigate(`/organisateurs/${profile.slug}`)}>Voir la page</button>
                      <OrganizerFollowButton organizer={profile} compact />
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
