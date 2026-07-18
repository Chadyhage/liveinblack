import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import OrganizerFollowButton from '../components/OrganizerFollowButton'
import { IconUsers } from '../components/icons'
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
    <button onClick={()=>navigate('/profil')} style={{background:'none',border:0,color:'rgba(255,255,255,.6)',font:'600 12px Inter, sans-serif',cursor:'pointer',padding:0}}>← Retour au profil</button>
    <h1 style={{font:'clamp(44px,8vw,68px) Bebas Neue',letterSpacing:'.025em',margin:'20px 0 4px'}}>Organisateurs suivis</h1>
    <p style={{color:'rgba(255,255,255,.48)',margin:'0 0 28px'}}>Gère tes abonnements et choisis précisément les alertes que tu veux recevoir.</p>
    {active.length===0?<div style={{padding:'40px 24px',border:'1px solid rgba(255,255,255,.08)',background:'#0e0f16',borderRadius:16,boxShadow:'0 8px 24px rgba(0,0,0,.35)',display:'flex',flexDirection:'column',alignItems:'center',gap:10,textAlign:'center'}}><span style={{width:56,height:56,borderRadius:'50%',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',display:'flex',alignItems:'center',justifyContent:'center'}}><IconUsers size={28} color="rgba(255,255,255,.55)"/></span><p style={{font:'700 15px Inter, sans-serif',color:'rgba(255,255,255,.93)',margin:0}}>Aucun organisateur suivi</p><p style={{font:'500 13px Inter, sans-serif',color:'rgba(255,255,255,.5)',margin:0,maxWidth:340}}>Suis tes organisateurs préférés pour être alerté de leurs prochains événements.</p><button className="btn-gold" onClick={()=>navigate('/organisateurs')} style={{marginTop:8}}>Découvrir les organisateurs</button></div>:<div style={{display:'grid',gap:12}}>{active.map(({follow,profile})=><section key={profile.id} style={{border:'1px solid rgba(255,255,255,.08)',background:'#0e0f16',borderRadius:16,boxShadow:'0 8px 24px rgba(0,0,0,.35)',padding:16}}>
      <div style={{display:'flex',alignItems:'center',gap:13,flexWrap:'wrap'}}><div style={{width:54,height:54,borderRadius:'50%',overflow:'hidden',background:'#111',display:'grid',placeItems:'center',color:'#4ee8c8',font:'24px Bebas Neue'}}>{profile.avatarUrl?<img src={profile.avatarUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:profile.publicName?.[0]}</div><div style={{flex:1,minWidth:140}}><h2 style={{font:'25px Bebas Neue',margin:0}}>{profile.publicName}</h2><p style={{font:'500 12px Inter, sans-serif',color:'rgba(255,255,255,.5)',margin:'3px 0 0'}}>{[profile.city,profile.country].filter(Boolean).join(' · ')}</p></div><button className="btn-outline" onClick={()=>navigate(`/organisateurs/${profile.slug}`)}>Voir la page</button><OrganizerFollowButton organizer={profile} compact onChange={()=>setFollows(getOrganizerFollows(uid))}/></div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14,paddingTop:13,borderTop:'1px solid rgba(255,255,255,.08)',gap:12}}><label style={{display:'flex',gap:9,alignItems:'center',fontSize:12,color:'rgba(255,255,255,.65)'}}><input type="checkbox" checked={follow.notificationsEnabled!==false} onChange={e=>patchFollow(profile.id,{notificationsEnabled:e.target.checked})}/> Notifications de cet organisateur</label><button onClick={()=>setOpen(open===profile.id?null:profile.id)} style={{background:'none',border:0,color:'#4ee8c8',font:'600 12px Inter, sans-serif',cursor:'pointer'}}>{open===profile.id?'Masquer les réglages':'Personnaliser les alertes'}</button></div>
      {open===profile.id&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:9,marginTop:13}}>{SETTINGS.map(([key,label])=><label key={key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'10px 12px',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',borderRadius:10,fontSize:12,color:'rgba(255,255,255,.65)'}}>{label}<input type="checkbox" checked={(follow.notificationSettings||DEFAULT_NOTIFICATION_SETTINGS)[key]!==false} onChange={e=>patchFollow(profile.id,{notificationSettings:{[key]:e.target.checked}})}/></label>)}</div>}
    </section>)}</div>}
    {suggestions.length>0&&<section style={{marginTop:38}}><h2 style={{font:'34px Bebas Neue',letterSpacing:'.02em'}}>Organisateurs à suivre</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10}}>{suggestions.map(profile=><article key={profile.id} style={{border:'1px solid rgba(255,255,255,.08)',padding:15,background:'#0e0f16',borderRadius:16,boxShadow:'0 8px 24px rgba(0,0,0,.35)'}}><h3 style={{font:'24px Bebas Neue',margin:'0 0 4px'}}>{profile.publicName}</h3><p style={{font:'500 12px Inter, sans-serif',color:'rgba(255,255,255,.5)',minHeight:24}}>{[profile.city,profile.country].filter(Boolean).join(' · ')}</p><OrganizerFollowButton organizer={profile} compact onChange={()=>setFollows(getOrganizerFollows(uid))}/></article>)}</div></section>}
  </main></Layout>
}
