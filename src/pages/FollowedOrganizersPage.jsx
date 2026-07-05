import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import OrganizerFollowButton from '../components/OrganizerFollowButton'
import { useAuth } from '../context/AuthContext'
import { cacheOrganizerFollows, cacheOrganizerProfiles, DEFAULT_NOTIFICATION_SETTINGS, getOrganizerFollows, getLocalOrganizerProfiles, updateOrganizerFollow } from '../utils/organizers'

const SETTINGS = [
  ['newEvent','Nouvel événement publié'], ['ticketing','Ouverture billetterie'],
  ['almostFull','Événement bientôt complet'], ['scheduleChanges','Annulation / report'],
  ['newMedia','Nouveaux médias publiés'], ['importantAnnouncements','Annonces importantes'],
]

export default function FollowedOrganizersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid || user?.id
  const [follows,setFollows] = useState(()=>getOrganizerFollows(uid))
  const [profiles,setProfiles] = useState(()=>getLocalOrganizerProfiles())
  const [open,setOpen] = useState(null)

  useEffect(()=>{
    let a=()=>{}, b=()=>{}
    import('../utils/firestore-sync').then(({listenOrganizerFollows,listenOrganizerProfiles})=>{
      a=listenOrganizerFollows(uid,items=>setFollows(cacheOrganizerFollows(uid,items)))
      b=listenOrganizerProfiles(items=>setProfiles(cacheOrganizerProfiles(items)))
    }).catch(()=>{})
    return()=>{a();b()}
  },[uid])

  const active = useMemo(()=>follows.filter(f=>f.status==='active').map(f=>({follow:f,profile:profiles.find(p=>p.id===f.organizerId)})).filter(x=>x.profile),[follows,profiles])
  const suggestions = useMemo(()=>profiles.filter(profile=>profile.status==='public'&&!active.some(item=>item.profile.id===profile.id)).sort((a,b)=>(b.followersCount||0)-(a.followersCount||0)).slice(0,3),[profiles,active])
  async function patchFollow(organizerId,patch){ const next=await updateOrganizerFollow(uid,organizerId,patch); setFollows(next) }

  return <Layout><main style={{maxWidth:820,margin:'0 auto',padding:'34px 18px 110px',color:'#fff'}}>
    <button onClick={()=>navigate('/profil')} style={{background:'none',border:0,color:'rgba(255,255,255,.45)',font:'10px DM Mono',cursor:'pointer',padding:0}}>← Retour au profil</button>
    <h1 style={{font:'clamp(44px,8vw,68px) Bebas Neue',letterSpacing:'.025em',margin:'20px 0 4px'}}>Organisateurs suivis</h1>
    <p style={{color:'rgba(255,255,255,.48)',margin:'0 0 28px'}}>Gère tes abonnements et choisis précisément les alertes que tu veux recevoir.</p>
    {active.length===0?<div style={{padding:34,border:'1px solid rgba(255,255,255,.1)',textAlign:'center'}}><p style={{color:'rgba(255,255,255,.5)'}}>Tu ne suis encore aucun organisateur.</p><button className="btn-gold" onClick={()=>navigate('/organisateurs')}>Découvrir les organisateurs</button></div>:<div style={{display:'grid',gap:12}}>{active.map(({follow,profile})=><section key={profile.id} style={{border:'1px solid rgba(255,255,255,.1)',background:'rgba(8,10,18,.6)',padding:16}}>
      <div style={{display:'flex',alignItems:'center',gap:13,flexWrap:'wrap'}}><div style={{width:54,height:54,borderRadius:'50%',overflow:'hidden',background:'#111',display:'grid',placeItems:'center',color:'#4ee8c8',font:'24px Bebas Neue'}}>{profile.avatarUrl?<img src={profile.avatarUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:profile.publicName?.[0]}</div><div style={{flex:1,minWidth:140}}><h2 style={{font:'25px Bebas Neue',margin:0}}>{profile.publicName}</h2><p style={{font:'9px DM Mono',color:'rgba(255,255,255,.4)',margin:'3px 0 0'}}>{[profile.city,profile.country].filter(Boolean).join(' · ')}</p></div><button className="btn-outline" onClick={()=>navigate(`/organisateurs/${profile.slug}`)}>Voir la page</button><OrganizerFollowButton organizer={profile} compact onChange={()=>setFollows(getOrganizerFollows(uid))}/></div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14,paddingTop:13,borderTop:'1px solid rgba(255,255,255,.08)',gap:12}}><label style={{display:'flex',gap:9,alignItems:'center',fontSize:12,color:'rgba(255,255,255,.65)'}}><input type="checkbox" checked={follow.notificationsEnabled!==false} onChange={e=>patchFollow(profile.id,{notificationsEnabled:e.target.checked})}/> Notifications de cet organisateur</label><button onClick={()=>setOpen(open===profile.id?null:profile.id)} style={{background:'none',border:0,color:'#4ee8c8',font:'9px DM Mono',cursor:'pointer'}}>Personnaliser {open===profile.id?'↑':'↓'}</button></div>
      {open===profile.id&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:9,marginTop:13}}>{SETTINGS.map(([key,label])=><label key={key} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'10px 11px',border:'1px solid rgba(255,255,255,.08)',fontSize:11,color:'rgba(255,255,255,.58)'}}>{label}<input type="checkbox" checked={(follow.notificationSettings||DEFAULT_NOTIFICATION_SETTINGS)[key]!==false} onChange={e=>patchFollow(profile.id,{notificationSettings:{[key]:e.target.checked}})}/></label>)}</div>}
    </section>)}</div>}
    {suggestions.length>0&&<section style={{marginTop:38}}><h2 style={{font:'34px Bebas Neue',letterSpacing:'.02em'}}>Organisateurs à suivre</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10}}>{suggestions.map(profile=><article key={profile.id} style={{border:'1px solid rgba(255,255,255,.1)',padding:15,background:'rgba(255,255,255,.02)'}}><h3 style={{font:'24px Bebas Neue',margin:'0 0 4px'}}>{profile.publicName}</h3><p style={{font:'9px DM Mono',color:'rgba(255,255,255,.4)',minHeight:24}}>{[profile.city,profile.country].filter(Boolean).join(' · ')}</p><OrganizerFollowButton organizer={profile} compact onChange={()=>setFollows(getOrganizerFollows(uid))}/></article>)}</div></section>}
  </main></Layout>
}
