import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import PublicNav from '../components/PublicNav'
import { useAuth } from '../context/AuthContext'
import { getEntityRegionIds, getRegionName, normalizeGeoText } from '../utils/locations'
import { getProviderCategories, getProviderCategory } from '../utils/providerCategories'
import { getAllProviderProfiles } from '../utils/services'
import { getLocalOrganizerProfiles } from '../utils/organizers'
import { isClientDiscoverableEvent } from '../utils/eventDiscovery'

const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', violet: '#8b5cf6' }
const FONT = 'Inter, system-ui, sans-serif'

function containsQuery(query, ...values) {
  return query && values.filter(Boolean).map(normalizeGeoText).join(' ').includes(query)
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function readLocalArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch { return [] }
}

function mergeSearchItems(localItems, remoteItems, keys = ['id', 'userId', 'slug']) {
  const byKey = new Map()
  for (const item of [...(localItems || []), ...(remoteItems || [])]) {
    if (!item) continue
    const key = keys.map(k => item[k]).find(Boolean)
    if (!key) continue
    byKey.set(String(key), item)
  }
  return [...byKey.values()]
}

function readLocalEvents() {
  return mergeSearchItems(readLocalArray('lib_created_events'), readLocalArray('lib_events_cache'), ['id'])
}

function ResultCard({ item, type, onOpen }) {
  const isEvent = type === 'event'
  const isOrganizer = type === 'organizer'
  const providerCategories = !isEvent && !isOrganizer ? getProviderCategories(item) : []
  const category = !isEvent && !isOrganizer ? (providerCategories[0] || getProviderCategory(item.prestataireType)) : null
  const title = isEvent ? item.name : isOrganizer ? item.publicName : item.name
  const image = isEvent
    ? item.imageUrl || item.image
    : isOrganizer ? item.avatarUrl || item.bannerUrl : item.photoUrl || item.coverUrl
  const accent = isEvent ? (item.accentColor || C.teal) : isOrganizer ? C.violet : category.color
  const label = isEvent ? 'Événement' : isOrganizer ? 'Organisateur' : `${category.singular}${providerCategories.length > 1 ? ` +${providerCategories.length - 1}` : ''}`
  const location = isEvent
    ? item.city || item.location
    : isOrganizer ? [item.city, item.country].filter(Boolean).join(' · ') : [item.city || item.location, item.country].filter(Boolean).join(' · ')
  const meta = isEvent
    ? [formatDate(item.date || item.startDate), location, item.category].filter(Boolean)
    : [location].filter(Boolean)
  const description = isEvent
    ? item.subtitle || item.description
    : isOrganizer ? item.shortDescription || item.longDescription : item.description

  return (
    <button className="search-result" onClick={onOpen} aria-label={`Ouvrir ${title}`}>
      <div className="search-result-media" style={{ background: `linear-gradient(135deg,${accent}45,rgba(8,10,18,.95))` }}>
        {image ? <img src={image} alt="" /> : <span style={{ color: accent }}>{title?.charAt(0)?.toUpperCase() || '?'}</span>}
      </div>
      <div className="search-result-copy">
        <span className="search-result-type" style={{ color: accent }}>{label}</span>
        <h3>{title}</h3>
        {meta.length > 0 && <p className="search-result-meta">{meta.join(' · ')}</p>}
        {description && <p className="search-result-description">{description}</p>}
      </div>
      <span className="search-result-arrow" style={{ color: accent }}>→</span>
    </button>
  )
}

function ResultSection({ title, items, type, onOpen }) {
  return (
    <section>
      <div className="search-section-title">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      {items.length === 0
        ? <p className="search-empty">Aucun résultat dans cette catégorie.</p>
        : <div className="search-results">{items.map(item => <ResultCard key={item.id || item.userId} item={item} type={type} onOpen={() => onOpen(item)} />)}</div>}
    </section>
  )
}

export default function GlobalSearchPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const searchParamQuery = searchParams.get('q') || ''
  const [query, setQuery] = useState(searchParamQuery)
  const [events, setEvents] = useState(() => readLocalEvents())
  const [organizers, setOrganizers] = useState(() => getLocalOrganizerProfiles().filter(profile => profile.status === 'public'))
  const [providers, setProviders] = useState(() => getAllProviderProfiles())

  useEffect(() => {
    setQuery(searchParamQuery)
  }, [searchParamQuery])

  useEffect(() => {
    let stopEvents = () => {}
    let stopOrganizers = () => {}
    let stopProviders = () => {}
    import('../utils/firestore-sync').then(({ listenEvents, listenOrganizerProfiles, listenProviders }) => {
      stopEvents = listenEvents(items => setEvents(prev => mergeSearchItems(prev, items, ['id'])))
      stopOrganizers = listenOrganizerProfiles(items => setOrganizers(prev => mergeSearchItems(prev, items, ['id', 'userId', 'slug'])))
      stopProviders = listenProviders(items => setProviders(prev => mergeSearchItems(prev, items, ['userId', 'id'])))
    }).catch(() => {})
    return () => { stopEvents(); stopOrganizers(); stopProviders() }
  }, [])

  const normalizedQuery = normalizeGeoText(query)
  const searchableEvents = useMemo(() => events.filter(event => isClientDiscoverableEvent(event)), [events])
  const searchableOrganizers = useMemo(() => organizers.filter(organizer => organizer.status === 'public'), [organizers])
  const searchableProviders = useMemo(() => providers.filter(provider => provider?.name && (
    provider.photoUrl || provider.description || provider.city || provider.location || provider.regionId || provider.country || provider.zonesIntervention?.length
  )), [providers])
  const results = useMemo(() => ({
    events: normalizedQuery ? searchableEvents.filter(event => containsQuery(normalizedQuery, event.name, event.city, event.region, event.category, event.subtitle, event.description)).slice(0, 8) : [],
    organizers: normalizedQuery ? searchableOrganizers.filter(organizer => containsQuery(normalizedQuery, organizer.publicName, organizer.city, organizer.country, organizer.shortDescription, ...(organizer.vibes || []))).slice(0, 8) : [],
    providers: normalizedQuery ? searchableProviders.filter(provider => containsQuery(normalizedQuery, provider.name, provider.city, provider.location, provider.country, provider.description, provider.specialitesLibre, ...getProviderCategories(provider).flatMap(category => [category.label, category.singular]), ...getEntityRegionIds(provider).map(getRegionName))).slice(0, 8) : [],
  }), [normalizedQuery, searchableEvents, searchableOrganizers, searchableProviders])

  const content = (
    <div className="global-search-page">
      <style>{`
        .global-search-page{min-height:100vh;background:radial-gradient(circle 850px at 8% 4%,rgba(139,92,246,.12),transparent 60%),${C.obsidian};color:#fff;font-family:${FONT}}
        .global-search-main{max-width:980px;margin:0 auto;padding:48px 20px 110px}
        .global-search-title{font:clamp(48px,8vw,76px)/.95 'Bebas Neue',Impact,sans-serif;letter-spacing:.02em;margin:0 0 28px}
        .global-search-input{width:100%;box-sizing:border-box;padding:18px 20px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.16);color:#fff;font:15px ${FONT};outline:none;transition:border-color .2s,box-shadow .2s}
        .global-search-input:focus{border-color:rgba(78,232,200,.58);box-shadow:0 0 0 3px rgba(78,232,200,.07)}
        .search-sections{display:grid;gap:38px;margin-top:38px}
        .search-section-title{display:flex;align-items:center;gap:10px;margin-bottom:12px}
        .search-section-title h2{font:32px 'Bebas Neue',Impact,sans-serif;letter-spacing:.025em;margin:0}
        .search-section-title span{display:grid;place-items:center;min-width:22px;height:22px;border-radius:99px;background:rgba(78,232,200,.1);color:${C.teal};font:10px 'DM Mono',monospace}
        .search-results{display:grid;gap:10px}
        .search-result{width:100%;display:grid;grid-template-columns:88px minmax(0,1fr) 32px;gap:16px;align-items:center;padding:12px;background:rgba(9,11,20,.68);border:1px solid rgba(255,255,255,.09);color:#fff;text-align:left;cursor:pointer;transition:transform .2s,border-color .2s,background .2s}
        .search-result:hover{transform:translateY(-2px);border-color:rgba(78,232,200,.28);background:rgba(13,16,27,.82)}
        .search-result-media{width:88px;height:88px;overflow:hidden;display:grid;place-items:center}
        .search-result-media img{width:100%;height:100%;object-fit:cover}
        .search-result-media span{font:38px 'Bebas Neue',Impact,sans-serif}
        .search-result-copy{min-width:0}
        .search-result-type{font:700 9px 'DM Mono',monospace;letter-spacing:.12em;text-transform:uppercase}
        .search-result-copy h3{font:700 17px ${FONT};margin:5px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .search-result-meta{font:11px ${FONT};color:rgba(255,255,255,.48);margin:5px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .search-result-description{font:12.5px/1.45 ${FONT};color:rgba(255,255,255,.58);margin:7px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .search-result-arrow{font-size:22px;text-align:center;transition:transform .2s}
        .search-result:hover .search-result-arrow{transform:translateX(3px)}
        .search-empty{margin:0;padding:16px;border-top:1px solid rgba(255,255,255,.07);color:rgba(255,255,255,.35);font-size:12px}
        .search-hint{color:rgba(255,255,255,.42);margin-top:24px}
        @media(max-width:600px){.global-search-main{padding:34px 14px 100px}.global-search-title{margin-bottom:20px}.search-result{grid-template-columns:68px minmax(0,1fr) 22px;gap:11px;padding:10px}.search-result-media{width:68px;height:74px}.search-result-description{-webkit-line-clamp:1}.search-result-copy h3{font-size:15px}.search-result-meta{font-size:10px}}
      `}</style>
      {!user && <PublicNav />}
      <main className="global-search-main">
        <h1 className="global-search-title">Rechercher</h1>
        <input className="global-search-input" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Événement, organisateur, prestataire, ville…" />
        {!normalizedQuery
          ? <p className="search-hint">Saisis au moins un mot pour lancer la recherche.</p>
          : <div className="search-sections">
              <ResultSection title="Événements" items={results.events} type="event" onOpen={item => navigate(`/evenements/${item.id}`)} />
              <ResultSection title="Organisateurs" items={results.organizers} type="organizer" onOpen={item => navigate(`/organisateurs/${item.slug}`)} />
              <ResultSection title="Prestataires" items={results.providers} type="provider" onOpen={item => navigate(`/prestataires/${item.userId}`)} />
            </div>}
      </main>
    </div>
  )

  return user ? <Layout>{content}</Layout> : content
}
