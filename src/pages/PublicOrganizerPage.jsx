import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import PublicNav from '../components/PublicNav'
import OrganizerFollowButton from '../components/OrganizerFollowButton'
import { useAuth } from '../context/AuthContext'
import { cacheOrganizerProfiles, getOrganizerProfile, reportOrganizer } from '../utils/organizers'
import { createDirectConversation, getUserId } from '../utils/messaging'
import { fmtMoney, eventCurrency } from '../utils/money'

const C = { obsidian:'#04040b', teal:'#4ee8c8', gold:'#c8a96e', pink:'#e05aaa' }
const DISPLAY = 'Bebas Neue, Impact, sans-serif'
const UI = 'DM Mono, monospace'
const FONT = 'Inter, system-ui, sans-serif'

const eventTime = event => {
  const time = new Date(event?.date || event?.startDate || 0).getTime()
  return Number.isFinite(time) ? time : 0
}
const formatDate = value => value ? new Date(value).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : 'Date à venir'
const compact = value => new Intl.NumberFormat('fr-FR', { notation: Number(value) >= 1000 ? 'compact' : 'standard', maximumFractionDigits:1 }).format(Number(value) || 0)
const externalUrl = value => !value ? null : /^https?:\/\//i.test(value) ? value : `https://${value}`

function EventCard({ event, past, onOpen }) {
  const prices = (event.places || []).map(p => Number(p.price)).filter(Number.isFinite)
  const remaining = (event.places || []).reduce((sum, p) => sum + (Number(p.available) || 0), 0)
  const total = (event.places || []).reduce((sum, p) => sum + (Number(p.total) || 0), 0)
  const status = event.cancelled ? 'Annulé' : past ? 'Terminé' : remaining <= 0 && total > 0 ? 'Complet' : total > 0 && remaining / total < .15 ? 'Bientôt complet' : 'Disponible'
  return <article className="op-event">
    <div className="op-event-img" style={{background:event.imageUrl ? `url(${event.imageUrl}) center/cover` : 'linear-gradient(135deg,rgba(139,92,246,.35),rgba(78,232,200,.12))'}} />
    <div className="op-event-body">
      <h3>{event.name}</h3>
      <p>{formatDate(event.date)} · {event.city || event.location || 'Lieu à venir'}</p>
      <p>{prices.length ? `À partir de ${fmtMoney(Math.min(...prices), eventCurrency(event))}` : 'Entrée gratuite ou sur invitation'}</p>
      <span className={`op-status ${status === 'Annulé' || status === 'Complet' ? 'danger' : ''}`}>{status}</span>
      <button onClick={() => onOpen(event)}>Voir l’événement</button>
    </div>
  </article>
}

export default function PublicOrganizerPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user, openAuthModal } = useAuth()
  const uid = user?.uid || user?.id
  const [profile, setProfile] = useState(() => getOrganizerProfile(slug))
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('faux_organisateur')
  const [reportText, setReportText] = useState('')
  const [reportState, setReportState] = useState('')

  useEffect(() => {
    let stopProfiles = () => {}
    let stopEvents = () => {}
    const timeout = setTimeout(() => setLoading(false), 1500)
    import('../utils/firestore-sync').then(({ listenOrganizerProfiles, listenEvents }) => {
      stopProfiles = listenOrganizerProfiles(items => {
        cacheOrganizerProfiles(items)
        setProfile(items.find(p => p.slug === slug || p.id === slug) || null)
        setLoading(false)
      })
      stopEvents = listenEvents(setEvents)
    }).catch(() => setLoading(false))
    return () => { clearTimeout(timeout); stopProfiles(); stopEvents() }
  }, [slug])

  useEffect(() => {
    if (!profile || profile.status !== 'public') return
    const previousTitle = document.title
    const description = `Découvre les événements, photos, vidéos et prochaines dates de ${profile.publicName} sur Live in Black.`
    document.title = `${profile.publicName} — Organisateur sur Live in Black`
    let meta = document.querySelector('meta[name="description"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta) }
    const previousDescription = meta.content
    meta.content = description
    const metaValues = {
      'og:title': document.title,
      'og:description': description,
      'og:type': 'profile',
      'og:url': window.location.href,
      'og:image': profile.bannerUrl || profile.avatarUrl || `${window.location.origin}/og-image.png`,
      'twitter:card': 'summary_large_image',
    }
    const touched = []
    for (const [property, content] of Object.entries(metaValues)) {
      let node = document.querySelector(`meta[property="${property}"],meta[name="${property}"]`)
      if (!node) { node = document.createElement('meta'); node.setAttribute(property.startsWith('twitter:') ? 'name' : 'property', property); document.head.appendChild(node) }
      touched.push([node, node.content])
      node.content = content
    }
    const robots = document.querySelector('meta[name="robots"]')
    if (robots) robots.content = 'index,follow'
    if (uid) import('../utils/firestore-sync').then(({ syncIncrement }) => syncIncrement(`organizer_profiles/${profile.id}`, 'viewsCount', 1)).catch(() => {})
    return () => { document.title = previousTitle; meta.content = previousDescription; touched.forEach(([node, value]) => { node.content = value }) }
  }, [profile?.id])

  const ownEvents = useMemo(() => events.filter(e => !e.isPrivate && (e.organizerId === profile?.id || e.createdBy === profile?.id)), [events, profile?.id])
  const upcoming = useMemo(() => ownEvents.filter(e => eventTime(e) >= Date.now()).sort((a,b) => eventTime(a)-eventTime(b)), [ownEvents])
  const past = useMemo(() => ownEvents.filter(e => eventTime(e) < Date.now()).sort((a,b) => eventTime(b)-eventTime(a)), [ownEvents])
  const media = (profile?.media || []).filter(item => item.visibility !== 'hidden')

  function openEvent(event) {
    if (uid) import('../utils/firestore-sync').then(({ syncIncrement }) => syncIncrement(`organizer_profiles/${profile.id}`, 'eventClicksCount', 1)).catch(() => {})
    navigate(`/evenements/${event.id}`)
  }

  // ── Contacter l'organisateur : conversation directe dans la messagerie ──
  // (même modèle que la page prestataire : la mise en relation passe par l'appli)
  const organizerUid = profile?.userId || profile?.id
  const isSelf = !!uid && uid === organizerUid
  function startConversation(account = user) {
    const myId = getUserId(account) || account?.uid
    if (!myId || !organizerUid || myId === organizerUid) return
    const conv = createDirectConversation(myId, account?.name || 'Membre LIVE IN BLACK', organizerUid, profile.publicName || 'Organisateur')
    navigate('/messagerie', { state: { conversationId: conv.id } })
  }
  function handleContact() {
    if (isSelf) return
    if (!user) {
      openAuthModal(`Connecte-toi pour écrire à ${profile?.publicName || 'cet organisateur'}.`, loggedInUser => startConversation(loggedInUser))
      return
    }
    startConversation(user)
  }

  async function share() {
    const payload = { title:`${profile.publicName} — Live in Black`, text:profile.shortDescription || '', url:window.location.href }
    try {
      if (navigator.share) await navigator.share(payload)
      else { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    } catch {}
  }

  async function submitReport(e) {
    e.preventDefault()
    if (!uid) { setReportOpen(false); openAuthModal('Connecte-toi pour signaler cette page organisateur.'); return }
    setReportState('sending')
    try { await reportOrganizer(uid, profile.id, reportReason, reportText); setReportState('sent') }
    catch { setReportState('error') }
  }

  if (!profile || profile.status !== 'public') return <div style={{minHeight:'100vh',background:C.obsidian,color:'#fff'}}>{!user && <PublicNav/>}<div style={{maxWidth:640,margin:'0 auto',padding:'100px 24px',textAlign:'center'}}><h1 style={{fontFamily:DISPLAY,fontSize:46}}>Cette page organisateur n’est pas disponible.</h1><p style={{color:'rgba(255,255,255,.5)'}}>{loading ? 'Chargement…' : 'Elle est peut-être privée, masquée ou suspendue.'}</p><button className="btn-gold" onClick={() => navigate('/organisateurs')}>Voir les organisateurs</button></div></div>

  const page = <div className="organizer-public">
    <style>{`
      .organizer-public{min-height:100vh;background:${C.obsidian};color:#fff;font-family:${FONT}}
      .op-shell{max-width:1240px;margin:0 auto;padding:0 24px 90px}.op-hero{position:relative;height:min(52vw,500px);min-height:310px;overflow:hidden;background:linear-gradient(135deg,#15102a,#071818)}
      .op-hero-bg{position:absolute;inset:0;background-position:center;background-size:cover}.op-hero-bg:after{content:'';position:absolute;inset:0;background:linear-gradient(to top,${C.obsidian} 0%,rgba(4,4,11,.15) 55%,rgba(4,4,11,.2) 100%)}
      .op-identity{position:absolute;left:clamp(18px,5vw,58px);right:clamp(18px,5vw,58px);bottom:26px;display:flex;align-items:flex-end;gap:20px;z-index:2}.op-avatar{width:116px;height:116px;flex:0 0 auto;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,.9);background:#090b12;display:grid;place-items:center;font:46px ${DISPLAY};color:${C.teal}}
      .op-name{font:clamp(40px,7vw,78px)/.9 ${DISPLAY};letter-spacing:.025em;margin:0}.op-meta{font:10px ${UI};letter-spacing:.1em;color:${C.gold};margin:8px 0 0;text-transform:uppercase}.op-hero-actions{margin-left:auto;display:flex;gap:9px;align-items:center}.op-secondary{padding:12px 18px;background:rgba(4,4,11,.66);border:1px solid rgba(255,255,255,.3);color:#fff;font:10px ${UI};letter-spacing:.13em;text-transform:uppercase;cursor:pointer}
      .op-summary{display:grid;grid-template-columns:1.4fr .8fr;gap:45px;padding:38px 0;border-bottom:1px solid rgba(255,255,255,.09)}.op-summary p{color:rgba(255,255,255,.67);line-height:1.75;margin:0}.op-kpis{display:flex;gap:32px;align-items:flex-start}.op-kpis b{display:block;font:26px ${DISPLAY}}.op-kpis span{font:9px ${UI};color:rgba(255,255,255,.45);letter-spacing:.12em;text-transform:uppercase}
      .op-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}.op-tag{padding:6px 9px;border:1px solid rgba(78,232,200,.28);color:${C.teal};font:8px ${UI};letter-spacing:.1em;text-transform:uppercase}
      .op-section{padding:46px 0 0}.op-section h2{font:36px ${DISPLAY};letter-spacing:.025em;margin:0 0 18px}.op-event-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:13px}.op-event{display:grid;grid-template-columns:42% 58%;min-height:190px;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.025);overflow:hidden}.op-event-img{min-height:190px}.op-event-body{padding:17px;display:flex;flex-direction:column;align-items:flex-start}.op-event h3{font:25px ${DISPLAY};letter-spacing:.02em;margin:0 0 7px}.op-event p{font:9px ${UI};color:rgba(255,255,255,.48);letter-spacing:.06em;line-height:1.55;margin:3px 0}.op-event button{margin-top:auto;padding:9px 11px;background:${C.teal};border:0;color:${C.obsidian};font:8px ${UI};font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer}.op-status{font:8px ${UI};color:${C.teal};margin-top:5px}.op-status.danger{color:${C.pink}}
      .op-media{display:grid;grid-template-columns:repeat(12,1fr);grid-auto-rows:120px;gap:8px}.op-media button{grid-column:span 3;grid-row:span 2;padding:0;border:0;background:#111;overflow:hidden;position:relative;cursor:pointer}.op-media button:first-child{grid-column:span 6;grid-row:span 3}.op-media img,.op-media video{width:100%;height:100%;object-fit:cover}.op-empty{padding:30px;border:1px solid rgba(255,255,255,.09);color:rgba(255,255,255,.45);font:11px ${UI}}
      .op-about{display:grid;grid-template-columns:1fr 1fr;gap:38px;margin-top:48px;padding:34px;background:rgba(255,255,255,.025);border-top:1px solid rgba(200,169,110,.25)}.op-about h2{font:34px ${DISPLAY};margin:0 0 10px}.op-about p{color:rgba(255,255,255,.57);font-size:13px;line-height:1.7}.op-report{background:none;border:0;color:rgba(255,255,255,.35);font:9px ${UI};text-decoration:underline;cursor:pointer;padding:0}
      .op-modal{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.88);display:grid;place-items:center;padding:20px}.op-modal-card{width:min(520px,100%);padding:24px;background:#0b0d14;border:1px solid rgba(255,255,255,.14)}
      @media(max-width:760px){.op-shell{padding:0 14px 110px}.op-hero{height:470px}.op-identity{display:grid;grid-template-columns:78px 1fr;align-items:end;bottom:18px}.op-avatar{width:78px;height:78px;font-size:34px}.op-name{font-size:45px}.op-hero-actions{grid-column:1/-1;margin:8px 0 0;width:100%}.op-hero-actions>div{flex:1}.op-summary{grid-template-columns:1fr;gap:24px}.op-event-list{grid-template-columns:1fr}.op-media{grid-auto-rows:88px}.op-media button,.op-media button:first-child{grid-column:span 6;grid-row:span 2}.op-about{grid-template-columns:1fr;padding:24px}.op-kpis{justify-content:space-between}.op-secondary{flex:1}}
    `}</style>
    {!user && <PublicNav/>}
    <main className="op-shell">
      <section className="op-hero">
        <div className="op-hero-bg" style={profile.bannerUrl ? {backgroundImage:`url(${profile.bannerUrl})`} : {background:'radial-gradient(circle at 70% 20%,rgba(139,92,246,.55),transparent 40%),linear-gradient(135deg,#18122f,#071719)'}} />
        <div className="op-identity">
          <div className="op-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : profile.publicName?.[0]}</div>
          <div><div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><h1 className="op-name">{profile.publicName}</h1></div><p className="op-meta">{[profile.city,profile.country].filter(Boolean).join(' · ') || 'Live in Black'}</p></div>
          <div className="op-hero-actions">{!isSelf && <button className="op-secondary" style={{background:C.teal,border:'1px solid transparent',color:C.obsidian,fontWeight:700}} onClick={handleContact}>Envoyer un message</button>}<OrganizerFollowButton organizer={profile}/><button className="op-secondary" onClick={share}>{copied ? 'Lien copié' : 'Partager'}</button></div>
        </div>
      </section>
      <section className="op-summary"><div><p>{profile.longDescription || profile.shortDescription || 'Découvre les prochains événements et l’univers de cet organisateur.'}</p><div className="op-tags">{[...(profile.eventTypes||[]),...(profile.vibes||[])].slice(0,10).map(tag=><span className="op-tag" key={tag}>{tag}</span>)}</div>{Object.entries(profile.socialLinks||{}).filter(([,url])=>url).length>0&&<div style={{display:'flex',gap:13,marginTop:18}}>{Object.entries(profile.socialLinks||{}).filter(([,url])=>url).map(([network,url])=><a key={network} href={externalUrl(url)} target="_blank" rel="noreferrer" style={{color:'rgba(255,255,255,.55)',font:`9px ${UI}`,textTransform:'uppercase',letterSpacing:'.09em'}}>{network}</a>)}</div>}</div><div className="op-kpis"><div><b>{compact(profile.followersCount)}</b><span>Abonnés</span></div><div><b>{Math.max(profile.totalEventsCount||0,ownEvents.length)}</b><span>Événements</span></div></div></section>
      <section className="op-section"><h2>Événements à venir</h2>{upcoming.length ? <div className="op-event-list">{upcoming.map(event=><EventCard key={event.id} event={event} onOpen={openEvent}/>)}</div> : <div className="op-empty">Aucun événement à venir pour le moment.</div>}</section>
      <section className="op-section"><h2>Événements passés</h2>{past.length ? <div className="op-event-list">{past.slice(0,6).map(event=><EventCard key={event.id} event={event} past onOpen={openEvent}/>)}</div> : <div className="op-empty">Cet organisateur n’a pas encore d’événement passé.</div>}</section>
      <section className="op-section"><h2>Photos & vidéos</h2>{media.length ? <div className="op-media">{media.map(item=><button key={item.id} onClick={()=>setMediaOpen(item)} aria-label={`Ouvrir ${item.title||'le média'}`}>{item.type==='video'?<video src={item.url} muted preload="metadata"/>:<img src={item.url} alt={item.title||''}/>} {item.type==='video'&&<span style={{position:'absolute',inset:'auto 12px 12px auto',width:34,height:34,borderRadius:'50%',display:'grid',placeItems:'center',background:'rgba(4,4,11,.75)',color:'#fff'}}>▶</span>}</button>)}</div> : <div className="op-empty">Cet organisateur n’a pas encore publié de médias.</div>}</section>
      <section className="op-about"><div><h2>À propos</h2><p>{profile.shortDescription || profile.longDescription || 'Page publique organisateur Live in Black.'}</p></div><div><p>Profil créé le {formatDate(profile.createdAt)}<br/>{[profile.city,profile.country].filter(Boolean).join(', ') || 'Localisation non renseignée'}</p>{/* Numéro PRO (partagé au niveau du compte) = contact business public. Clic = appel. */}{profile.proPhone && <a href={`tel:${String(profile.proPhone).replace(/[^\d+]/g,'')}`} style={{display:'inline-flex',alignItems:'center',gap:8,margin:'10px 0 14px',color:C.gold,font:`11px ${UI}`,letterSpacing:'.06em',textDecoration:'none'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>{profile.proPhone}</a>}<br/><button className="op-report" onClick={()=>uid?setReportOpen(true):openAuthModal('Connecte-toi pour signaler cette page organisateur.')}>Signaler cette page</button></div></section>
    </main>
    {/* stopPropagation sur le média : cliquer la vidéo (play/pause…) ne doit pas fermer l'overlay — seul un clic sur le fond ou la croix ferme */}
    {mediaOpen && <div className="op-modal" onClick={()=>setMediaOpen(null)}><button onClick={()=>setMediaOpen(null)} aria-label="Fermer" style={{position:'fixed',right:20,top:20,background:'none',border:0,color:'#fff',fontSize:32,cursor:'pointer',zIndex:2}}>×</button>{mediaOpen.type==='video'?<video src={mediaOpen.url} controls autoPlay onClick={e=>e.stopPropagation()} style={{maxWidth:'92vw',maxHeight:'86vh'}}/>:<img src={mediaOpen.url} alt={mediaOpen.title||''} onClick={e=>e.stopPropagation()} style={{maxWidth:'92vw',maxHeight:'86vh',objectFit:'contain'}}/>}</div>}
    {reportOpen && <div className="op-modal"><form className="op-modal-card" onSubmit={submitReport}><h2 style={{font: '34px Bebas Neue',margin:'0 0 16px'}}>Signaler cette page</h2>{reportState==='sent'?<p style={{color:C.teal}}>Merci, le signalement a été transmis.</p>:<><select className="input-dark" value={reportReason} onChange={e=>setReportReason(e.target.value)}><option value="faux_organisateur">Faux organisateur</option><option value="contenu_trompeur">Contenu trompeur</option><option value="contenu_inapproprie">Contenu inapproprié</option><option value="arnaque">Suspicion d’arnaque</option><option value="usurpation">Usurpation d’identité</option><option value="autre">Autre</option></select><textarea className="input-dark" value={reportText} onChange={e=>setReportText(e.target.value)} placeholder="Précisions facultatives" rows={4} style={{marginTop:10}}/><div style={{display:'flex',gap:9,marginTop:14}}><button type="button" className="btn-outline" onClick={()=>setReportOpen(false)}>Annuler</button><button className="btn-gold" disabled={reportState==='sending'}>{reportState==='sending'?'Envoi…':'Envoyer'}</button></div>{reportState==='error'&&<p style={{color:C.pink}}>Impossible d’envoyer le signalement.</p>}</>}</form></div>}
  </div>
  return user ? <Layout>{page}</Layout> : page
}
