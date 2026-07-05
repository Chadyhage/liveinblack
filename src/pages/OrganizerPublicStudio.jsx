import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import {
  createOrganizerProfileSeed,
  getOrganizerProfile,
  getLocalOrganizerProfiles,
  saveOrganizerProfile,
  validateOrganizerSlug,
} from '../utils/organizers'
import { uploadOrganizerMedia } from '../utils/uploadImage'

const C = { obsidian:'#04040b', teal:'#4ee8c8', gold:'#c8a96e', pink:'#e05aaa' }
const DISPLAY = 'Bebas Neue, Impact, sans-serif'
const UI = 'DM Mono, monospace'
const FONT = 'Inter, system-ui, sans-serif'

function Field({ label, children, wide=false }) { return <label style={{display:'grid',gap:7,gridColumn:wide?'1 / -1':undefined}}><span style={{font: '9px DM Mono',letterSpacing:'.12em',textTransform:'uppercase',color:'rgba(255,255,255,.5)'}}>{label}</span>{children}</label> }
const input = { width:'100%',boxSizing:'border-box',padding:'11px 12px',borderRadius:4,border:'1px solid rgba(255,255,255,.12)',background:'rgba(4,4,11,.5)',color:'#fff',outline:'none',fontFamily:FONT,fontSize:13 }

export default function OrganizerPublicStudio() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid || user?.id
  const [profile, setProfile] = useState(() => getOrganizerProfile(uid) || createOrganizerProfileSeed(user))
  const [events, setEvents] = useState([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState('')
  const [message, setMessage] = useState(null)

  // Hydratation UNIQUE depuis Firestore : après le premier snapshot, un écho
  // distant (ex. +1 vue posté par un visiteur) ne doit JAMAIS écraser les
  // modifications non enregistrées du formulaire (logo/bannière/galerie qui
  // « disparaissaient » en cours d'édition). On ne rafraîchit que les compteurs.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (!uid) return
    hydratedRef.current = false
    let stopProfile = () => {}
    let stopEvents = () => {}
    import('../utils/firestore-sync').then(({ listenOrganizerProfile, listenUserEvents }) => {
      stopProfile = listenOrganizerProfile(uid, remote => {
        if (!remote) return
        if (!hydratedRef.current) {
          hydratedRef.current = true
          setProfile(remote)
        } else {
          setProfile(current => ({
            ...current,
            followersCount: remote.followersCount ?? current.followersCount,
            viewsCount: remote.viewsCount ?? current.viewsCount,
            eventClicksCount: remote.eventClicksCount ?? current.eventClicksCount,
          }))
        }
      })
      stopEvents = listenUserEvents(uid, setEvents)
    }).catch(() => {})
    return () => { stopProfile(); stopEvents() }
  }, [uid])

  const slugCheck = useMemo(() => validateOrganizerSlug(profile.slug, getLocalOrganizerProfiles(), uid), [profile.slug, uid])
  const publicUrl = `${window.location.origin}/organisateurs/${slugCheck.slug || profile.slug || ''}`
  const activeMedia = profile.media || []
  const update = patch => setProfile(current => ({ ...current, ...patch }))

  async function upload(kind, file) {
    if (!file) return
    setMessage(null); setUploading(kind)
    try {
      const uploaded = await uploadOrganizerMedia(uid, file, kind)
      let next
      if (kind === 'avatar') next = { ...profile, avatarUrl: uploaded.url }
      else if (kind === 'banner') next = { ...profile, bannerUrl: uploaded.url }
      else next = { ...profile, media: [...activeMedia, { id:`org-media-${Date.now()}`, ...uploaded, title:'', description:'', eventId:'', visibility:'public', displayOrder:activeMedia.length, createdAt:Date.now(), updatedAt:Date.now() }] }
      setProfile(next)
      // Persistance IMMÉDIATE : un média uploadé ne doit pas se perdre si on
      // quitte la page sans cliquer « Enregistrer ».
      const saved = await saveOrganizerProfile(next)
      setProfile(saved)
      hydratedRef.current = true
      setMessage({ type:'success', text: kind === 'gallery' ? 'Média ajouté et enregistré sur ta page.' : 'Image enregistrée sur ta page.' })
    } catch (e) { setMessage({type:'error',text:e.message}) }
    setUploading('')
  }

  async function save() {
    setMessage(null)
    if (!profile.publicName?.trim()) return setMessage({type:'error',text:'Le nom public est obligatoire.'})
    if (!slugCheck.ok) return setMessage({type:'error',text:slugCheck.error})
    setSaving(true)
    try {
      const saved = await saveOrganizerProfile({ ...profile, slug:slugCheck.slug, totalEventsCount:Math.max(profile.totalEventsCount||0,events.length) })
      setProfile(saved); setMessage({type:'success',text:'Ta page publique a bien été enregistrée.'})
    } catch (e) { setMessage({type:'error',text:e.message}) }
    setSaving(false)
  }

  function updateMedia(id, patch) { update({media:activeMedia.map(item=>item.id===id?{...item,...patch,updatedAt:Date.now()}:item)}) }
  async function removeMedia(id) {
    const next = { ...profile, media: activeMedia.filter(m => m.id !== id) }
    setProfile(next)
    // Même logique que l'upload : suppression persistée immédiatement
    try { const saved = await saveOrganizerProfile(next); setProfile(saved); hydratedRef.current = true } catch (e) { setMessage({ type:'error', text:e.message }) }
  }
  function moveMedia(index, direction) {
    const next=[...activeMedia]; const target=index+direction
    if(target<0||target>=next.length)return
    ;[next[index],next[target]]=[next[target],next[index]]
    update({media:next.map((m,i)=>({...m,displayOrder:i}))})
  }

  return <Layout><div className="org-studio">
    <style>{`
      .org-studio{max-width:1220px;margin:0 auto;padding:30px 20px 100px;color:#fff;font-family:${FONT}}
      .os-title{font:clamp(46px,7vw,72px)/.95 ${DISPLAY};letter-spacing:.025em;margin:0}.os-top{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:24px}.os-status{padding:15px 18px;border:1px solid rgba(78,232,200,.28);background:rgba(78,232,200,.05);font:9px ${UI};letter-spacing:.1em;color:${C.teal}}
      .os-stats{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid rgba(255,255,255,.1);margin-bottom:16px}.os-stat{padding:18px;border-right:1px solid rgba(255,255,255,.08)}.os-stat:last-child{border:0}.os-stat b{display:block;font:28px ${DISPLAY}}.os-stat span{font:8px ${UI};color:rgba(255,255,255,.42);letter-spacing:.1em;text-transform:uppercase}
      .os-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr);gap:16px}.os-panel{border:1px solid rgba(255,255,255,.1);background:rgba(8,10,18,.62);padding:20px}.os-panel h2{font:25px ${DISPLAY};letter-spacing:.03em;margin:0 0 18px}.os-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.os-upload-row{display:grid;grid-template-columns:130px 1fr;gap:14px;margin-bottom:18px}.os-avatar{width:100px;height:100px;border-radius:50%;overflow:hidden;background:#12151d;display:grid;place-items:center;font:38px ${DISPLAY};color:${C.teal}}.os-banner{height:130px;background:#10131d;overflow:hidden}.os-upload-btn{display:inline-flex;margin-top:8px;padding:8px 10px;border:1px solid rgba(200,169,110,.4);color:${C.gold};font:8px ${UI};text-transform:uppercase;letter-spacing:.1em;cursor:pointer}.os-upload-btn input{display:none}
      .os-preview{position:sticky;top:80px}.os-preview-banner{height:160px;background:linear-gradient(135deg,#18122f,#071719);background-size:cover;background-position:center}.os-preview-body{padding:0 18px 20px}.os-preview-avatar{width:82px;height:82px;margin-top:-41px;position:relative;border-radius:50%;overflow:hidden;border:3px solid #0b0d14;background:#111;display:grid;place-items:center;font:34px ${DISPLAY};color:${C.teal}}.os-save{width:100%;padding:13px;background:${C.gold};border:0;color:${C.obsidian};font:9px ${UI};font-weight:700;letter-spacing:.13em;text-transform:uppercase;cursor:pointer;margin-top:14px}
      .os-media-panel{grid-column:1/-1}.os-media-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.os-media-item{border:1px solid rgba(255,255,255,.1);padding:9px;background:rgba(255,255,255,.02)}.os-media-thumb{height:125px;background:#111;overflow:hidden}.os-media-thumb img,.os-media-thumb video{width:100%;height:100%;object-fit:cover}.os-media-actions{display:flex;gap:5px;margin-top:7px}.os-media-actions button{flex:1;padding:6px;background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.55);font-size:11px;cursor:pointer}.os-message{padding:11px 14px;margin-bottom:14px;font-size:12px;border:1px solid}.os-message.success{color:${C.teal};border-color:rgba(78,232,200,.35)}.os-message.error{color:${C.pink};border-color:rgba(224,90,170,.35)}
      @media(max-width:900px){.os-layout{grid-template-columns:1fr}.os-preview{position:static}.os-media-panel{grid-column:auto}}
      @media(max-width:600px){.org-studio{padding:22px 13px 110px}.os-top{align-items:flex-start;flex-direction:column}.os-status{width:100%;box-sizing:border-box}.os-stats{grid-template-columns:1fr}.os-stat{border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}.os-grid{grid-template-columns:1fr}.os-upload-row{grid-template-columns:1fr}.os-media-list{grid-template-columns:1fr}}
    `}</style>
    <header className="os-top"><div><h1 className="os-title">Ma page publique</h1><p style={{color:'rgba(255,255,255,.45)',margin:'9px 0 0'}}>Présente ton univers, tes événements et construis ton audience.</p></div><div className="os-status">{profile.status==='public'?'● PAGE PUBLIQUE ACTIVÉE':'○ PAGE NON PUBLIÉE'}</div></header>
    {message&&<div className={`os-message ${message.type}`}>{message.text}</div>}
    <div className="os-stats"><div className="os-stat"><b>{profile.followersCount||0}</b><span>Abonnés</span></div><div className="os-stat"><b>{profile.viewsCount||profile.stats?.viewsCount||0}</b><span>Vues de la page</span></div><div className="os-stat"><b>{profile.eventClicksCount||profile.stats?.eventClicksCount||0}</b><span>Clics événements</span></div></div>
    <div style={{display:'flex',gap:8,alignItems:'center',padding:'12px 14px',border:'1px solid rgba(255,255,255,.1)',marginBottom:16,flexWrap:'wrap'}}><span style={{flex:1,minWidth:220,font:'9px DM Mono',color:'rgba(255,255,255,.55)',overflow:'hidden',textOverflow:'ellipsis'}}>{publicUrl}</span><button className="btn-outline" onClick={()=>navigator.clipboard?.writeText(publicUrl)}>Copier le lien</button>{profile.status==='public'&&<button className="btn-gold" onClick={()=>navigate(`/organisateurs/${slugCheck.slug}`)}>Voir ma page</button>}</div>
    <div className="os-layout">
      <section className="os-panel"><h2>Informations publiques</h2>
        <div className="os-upload-row"><div><div className="os-avatar">{profile.avatarUrl?<img src={profile.avatarUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:profile.publicName?.[0]||'O'}</div><label className="os-upload-btn">{uploading==='avatar'?'Envoi…':'Changer le logo'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>upload('avatar',e.target.files?.[0])}/></label></div><div><div className="os-banner">{profile.bannerUrl&&<img src={profile.bannerUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>}</div><label className="os-upload-btn">{uploading==='banner'?'Envoi…':'Changer la bannière'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>upload('banner',e.target.files?.[0])}/></label></div></div>
        <div className="os-grid"><Field label="Nom public"><input style={input} value={profile.publicName||''} onChange={e=>update({publicName:e.target.value})}/></Field><Field label="Slug public"><input style={{...input,borderColor:slugCheck.ok?'rgba(255,255,255,.12)':'rgba(224,90,170,.6)'}} value={profile.slug||''} onChange={e=>update({slug:e.target.value})}/>{!slugCheck.ok&&<small style={{color:C.pink}}>{slugCheck.error}</small>}</Field><Field label="Ville"><input style={input} value={profile.city||''} onChange={e=>update({city:e.target.value})}/></Field><Field label="Pays"><input style={input} value={profile.country||''} onChange={e=>update({country:e.target.value})}/></Field><Field label="Description courte" wide><input style={input} maxLength={180} value={profile.shortDescription||''} onChange={e=>update({shortDescription:e.target.value})}/></Field><Field label="Description longue" wide><textarea style={input} rows={5} value={profile.longDescription||''} onChange={e=>update({longDescription:e.target.value})}/></Field><Field label="Types d’événements (séparés par des virgules)" wide><input style={input} value={(profile.eventTypes||[]).join(', ')} onChange={e=>update({eventTypes:e.target.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12)})}/></Field><Field label="Ambiance / tags" wide><input style={input} value={(profile.vibes||[]).join(', ')} onChange={e=>update({vibes:e.target.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,16)})}/></Field><Field label="Instagram"><input style={input} value={profile.socialLinks?.instagram||''} onChange={e=>update({socialLinks:{...(profile.socialLinks||{}),instagram:e.target.value}})}/></Field><Field label="TikTok"><input style={input} value={profile.socialLinks?.tiktok||''} onChange={e=>update({socialLinks:{...(profile.socialLinks||{}),tiktok:e.target.value}})}/></Field></div>
      </section>
      <aside className="os-panel os-preview"><h2>Aperçu de ma page</h2><div style={{border:'1px solid rgba(255,255,255,.1)'}}><div className="os-preview-banner" style={profile.bannerUrl?{backgroundImage:`url(${profile.bannerUrl})`}:undefined}/><div className="os-preview-body"><div className="os-preview-avatar">{profile.avatarUrl?<img src={profile.avatarUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:profile.publicName?.[0]||'O'}</div><h3 style={{font:`34px ${DISPLAY}`,margin:'10px 0 0'}}>{profile.publicName||'Ton nom public'}</h3><p style={{font:`9px ${UI}`,color:C.gold}}>{[profile.city,profile.country].filter(Boolean).join(' · ')||'Ville · Pays'}</p><p style={{fontSize:12,color:'rgba(255,255,255,.55)',lineHeight:1.6}}>{profile.shortDescription||'Ta description courte apparaîtra ici.'}</p></div></div><div style={{marginTop:16}}><p style={{font:`9px ${UI}`,color:'rgba(255,255,255,.5)'}}>STATUT DE LA PAGE</p>{['draft','public'].map(status=><label key={status} style={{display:'flex',alignItems:'center',gap:9,padding:'9px 0',font:`10px ${UI}`,textTransform:'uppercase'}}><input type="radio" checked={profile.status===status} onChange={()=>update({status,isPublic:status==='public'})}/>{status==='public'?'Publique':'Brouillon'}</label>)}</div><button className="os-save" onClick={save} disabled={saving}>{saving?'Enregistrement…':'Enregistrer'}</button></aside>
      <section className="os-panel os-media-panel"><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h2 style={{marginBottom:4}}>Galerie photos & vidéos</h2><p style={{margin:0,color:'rgba(255,255,255,.42)',fontSize:12}}>Images 10 Mo max. Vidéos 50 Mo max. Maximum conseillé : 12 médias.</p></div><label className="os-upload-btn">{uploading==='gallery'?'Envoi…':'Ajouter un média'}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={e=>upload('gallery',e.target.files?.[0])}/></label></div>
        <div className="os-media-list" style={{marginTop:16}}>{activeMedia.length===0?<div style={{color:'rgba(255,255,255,.45)',fontSize:12}}>Tu n’as encore ajouté aucun média.</div>:activeMedia.map((item,index)=><article className="os-media-item" key={item.id}><div className="os-media-thumb">{item.type==='video'?<video src={item.url} muted/>:<img src={item.url} alt=""/>}</div><input style={{...input,marginTop:8}} placeholder="Titre facultatif" value={item.title||''} onChange={e=>updateMedia(item.id,{title:e.target.value})}/><select style={{...input,marginTop:7}} value={item.eventId||''} onChange={e=>updateMedia(item.id,{eventId:e.target.value})}><option value="">Aucun événement lié</option>{events.map(event=><option key={event.id} value={event.id}>{event.name}</option>)}</select><label style={{display:'flex',gap:7,alignItems:'center',fontSize:11,color:'rgba(255,255,255,.55)',marginTop:8}}><input type="checkbox" checked={item.visibility!=='hidden'} onChange={e=>updateMedia(item.id,{visibility:e.target.checked?'public':'hidden'})}/> Visible publiquement</label><div className="os-media-actions"><button onClick={()=>moveMedia(index,-1)} disabled={index===0}>←</button><button onClick={()=>moveMedia(index,1)} disabled={index===activeMedia.length-1}>→</button><button onClick={()=>removeMedia(item.id)} style={{color:C.pink}}>Supprimer</button></div></article>)}</div>
      </section>
    </div>
  </div></Layout>
}

