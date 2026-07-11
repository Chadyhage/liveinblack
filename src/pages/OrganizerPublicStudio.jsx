import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Cropper from 'react-easy-crop'
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
import { regions } from '../data/regions'
import { getRegionName, normalizeRegionIds } from '../utils/locations'
import { SOCIAL_NETWORKS } from '../utils/social'
import getCroppedImg from '../utils/cropImage'

const C = { obsidian:'#04040b', teal:'#4ee8c8', gold:'#c8a96e', pink:'#e05aaa' }
const DISPLAY = 'Bebas Neue, Impact, sans-serif'
const UI = 'Inter, sans-serif'
const FONT = 'Inter, system-ui, sans-serif'

function Field({ label, children, wide=false }) { return <label style={{display:'grid',gap:7,gridColumn:wide?'1 / -1':undefined}}><span style={{font:'600 11px Inter, sans-serif',letterSpacing:'.06em',textTransform:'uppercase',color:'rgba(255,255,255,.6)'}}>{label}</span>{children}</label> }
const input = { width:'100%',boxSizing:'border-box',padding:'12px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,.12)',background:'#0b0c12',color:'rgba(255,255,255,.92)',outline:'none',fontFamily:FONT,fontSize:14 }

export default function OrganizerPublicStudio() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid || user?.id
  const [profile, setProfile] = useState(() => getOrganizerProfile(uid) || createOrganizerProfileSeed(user))
  const [events, setEvents] = useState([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState('')
  const [message, setMessage] = useState(null)
  const [cropEditor, setCropEditor] = useState(null)
  const [crop, setCrop] = useState({ x:0, y:0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

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

  // Zones d'intervention (multi) — pour la recherche par pays + l'affichage.
  // Les zones d'intervention sont du MARKETING (multi-pays où l'organisateur
  // communique). Elles sont TOTALEMENT SÉPARÉES de regionId, qui est l'ANCRE
  // DEVISE/PAIEMENT (figée à l'onboarding : EUR/Stripe vs XOF/FedaPay).
  const ZONE_OPTIONS = [{ id:'international', name:'International', flag:'🌍' }, ...regions]
  const zones = normalizeRegionIds(profile.zonesIntervention?.length ? profile.zonesIntervention : [profile.regionId || profile.country]).filter(Boolean)
  function toggleZone(id) {
    const has = zones.includes(id)
    let next
    if (id === 'international') next = has ? [] : ['international']
    else { const woInt = zones.filter(z => z !== 'international'); next = has ? woInt.filter(z => z !== id) : [...woInt, id] }
    // On NE touche PLUS regionId/country ici (audit pages #1 CRITIQUE) : avant,
    // décocher/changer une zone MARKETING recalculait regionId → basculait
    // SILENCIEUSEMENT la devise EUR↔XOF de tous les futurs événements. La devise
    // ne doit JAMAIS dépendre d'un choix de communication.
    update({ zonesIntervention: next })
  }

  function chooseImage(kind, file) {
    if (!file) return
    if (!file.type?.startsWith('image/')) return setMessage({type:'error',text:'Choisis une image JPG, PNG ou WEBP.'})
    if (file.size > 10 * 1024 * 1024) return setMessage({type:'error',text:'L’image dépasse 10 Mo.'})
    const reader = new FileReader()
    reader.onload = () => {
      setCrop({x:0,y:0}); setZoom(1); setCroppedAreaPixels(null)
      setCropEditor({kind,src:reader.result,name:file.name || `${kind}.jpg`})
    }
    reader.onerror = () => setMessage({type:'error',text:'Impossible de lire cette image.'})
    reader.readAsDataURL(file)
  }

  async function confirmCrop() {
    if (!cropEditor || !croppedAreaPixels) return
    try {
      setUploading(cropEditor.kind)
      const dataUrl = await getCroppedImg(cropEditor.src, croppedAreaPixels)
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], cropEditor.name.replace(/\.[^.]+$/, '') + '.jpg', {type:'image/jpeg'})
      const kind = cropEditor.kind
      setCropEditor(null)
      await upload(kind, file)
    } catch (error) {
      setUploading('')
      setMessage({type:'error',text:error.message || 'Impossible de recadrer cette image.'})
    }
  }

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
      .os-title{font:clamp(46px,7vw,72px)/.95 ${DISPLAY};letter-spacing:.025em;margin:0}.os-top{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:24px}.os-status{padding:12px 16px;border:1px solid rgba(78,232,200,.35);border-radius:10px;background:rgba(78,232,200,.12);font:700 11px ${UI};letter-spacing:.04em;color:${C.teal}}
      .os-stats{display:grid;grid-template-columns:repeat(2,1fr);border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#0e0f16;box-shadow:0 8px 24px rgba(0,0,0,.35);overflow:hidden;margin-bottom:16px}.os-stat{padding:18px;border-right:1px solid rgba(255,255,255,.08)}.os-stat:last-child{border:0}.os-stat b{display:block;font:28px ${DISPLAY}}.os-stat span{font:600 11px ${UI};color:rgba(255,255,255,.5);letter-spacing:.06em;text-transform:uppercase}
      .os-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr);gap:16px}.os-panel{border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#0e0f16;box-shadow:0 8px 24px rgba(0,0,0,.35);padding:20px}.os-panel h2{font:25px ${DISPLAY};letter-spacing:.03em;margin:0 0 18px}.os-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.os-upload-row{display:grid;grid-template-columns:130px 1fr;gap:14px;margin-bottom:18px}.os-avatar{width:100px;height:100px;border-radius:50%;overflow:hidden;background:#12151d;display:grid;place-items:center;font:38px ${DISPLAY};color:${C.teal}}.os-banner{height:130px;background:#10131d;border-radius:8px;overflow:hidden}.os-upload-btn{display:inline-flex;align-items:center;gap:7px;margin-top:8px;padding:11px 16px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.9);font:11px ${UI};font-weight:700;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;transition:background .15s,border-color .15s}.os-upload-btn:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.22)}.os-upload-btn.primary{background:${C.gold};color:${C.obsidian};border-color:${C.gold}}.os-upload-btn.primary:hover{background:#e0c48a}.os-upload-btn.busy{opacity:.7;cursor:wait;pointer-events:none}.os-upload-btn input{display:none}
      .os-preview{position:sticky;top:80px}.os-preview-banner{height:160px;background:#10131d;background-size:cover;background-position:center}.os-preview-body{padding:0 18px 20px}.os-preview-avatar{width:82px;height:82px;margin-top:-41px;position:relative;border-radius:50%;overflow:hidden;border:3px solid #0b0d14;background:#111;display:grid;place-items:center;font:34px ${DISPLAY};color:${C.teal}}.os-save{width:100%;min-height:46px;padding:13px;background:${C.gold};border:1px solid ${C.gold};border-radius:12px;color:${C.obsidian};font:13px ${UI};font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;margin-top:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px}.os-save:disabled{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.06);color:rgba(255,255,255,.35);cursor:not-allowed}
      .os-media-panel{grid-column:1/-1}.os-media-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.os-media-item{border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:9px;background:rgba(255,255,255,.04)}.os-media-thumb{height:125px;background:#111;border-radius:8px;overflow:hidden}.os-media-thumb img,.os-media-thumb video{width:100%;height:100%;object-fit:cover}.os-media-actions{display:flex;gap:5px;margin-top:7px}.os-media-actions button{flex:1;padding:7px 6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:rgba(255,255,255,.7);font:600 11px ${UI};cursor:pointer}.os-media-actions button:disabled{color:rgba(255,255,255,.3);cursor:not-allowed}.os-message{padding:12px 14px;margin-bottom:14px;font:500 13px ${UI};border:1px solid;border-radius:12px;background:rgba(12,12,22,.96)}.os-message.success{color:${C.teal};border-color:rgba(78,232,200,.5)}.os-message.error{color:${C.pink};border-color:rgba(224,90,170,.5)}
      .os-crop-backdrop{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.84);backdrop-filter:blur(7px);display:grid;place-items:center;padding:18px}.os-crop-modal{width:min(720px,100%);overflow:hidden;border:1px solid rgba(255,255,255,.10);border-radius:20px;background:#12131c;box-shadow:0 24px 64px rgba(0,0,0,.55)}.os-crop-head{display:flex;justify-content:space-between;align-items:center;padding:17px 19px;border-bottom:1px solid rgba(255,255,255,.09)}.os-crop-head h2{font:24px ${DISPLAY};letter-spacing:.04em;margin:0}.os-crop-stage{position:relative;height:min(54vh,430px);background:#020207}.os-crop-foot{padding:16px 19px 19px}.os-crop-zoom{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;color:rgba(255,255,255,.55);font:600 11px ${UI};letter-spacing:.05em;text-transform:uppercase}.os-crop-zoom input{width:100%;accent-color:${C.teal}}.os-crop-actions{display:grid;grid-template-columns:1fr 1.5fr;gap:9px;margin-top:16px}.os-crop-actions button{min-height:46px;border-radius:12px;font:700 13px ${UI};letter-spacing:.04em;text-transform:uppercase;cursor:pointer}.os-crop-cancel{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:rgba(255,255,255,.9)}.os-crop-confirm{border:1px solid ${C.gold};background:${C.gold};color:${C.obsidian}}
      @media(max-width:900px){.os-layout{grid-template-columns:1fr}.os-preview{position:static}.os-media-panel{grid-column:auto}}
      @media(max-width:600px){.org-studio{padding:22px 13px 110px}.os-top{align-items:flex-start;flex-direction:column}.os-status{width:100%;box-sizing:border-box}.os-stats{grid-template-columns:1fr}.os-stat{border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}.os-grid{grid-template-columns:1fr}.os-upload-row{grid-template-columns:1fr}.os-media-list{grid-template-columns:1fr}}
    `}</style>
    <header className="os-top"><div><h1 className="os-title">Ma page publique</h1><p style={{color:'rgba(255,255,255,.45)',margin:'9px 0 0'}}>Présente ton univers, tes événements et construis ton audience.</p></div><div className="os-status">{profile.status==='public'?'● Page publique activée':'○ Page privée — visible par toi seulement'}</div></header>
    {message&&<div className={`os-message ${message.type}`}>{message.text}</div>}
    <div className="os-stats"><div className="os-stat"><b>{profile.followersCount||0}</b><span>Abonnés</span></div><div className="os-stat"><b>{profile.viewsCount||profile.stats?.viewsCount||0}</b><span>Vues de la page</span></div></div>
    <div style={{display:'flex',gap:8,alignItems:'center',padding:'12px 14px',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,background:'#0e0f16',marginBottom:16,flexWrap:'wrap'}}><span style={{flex:1,minWidth:220,font:'500 12px Inter, sans-serif',color:'rgba(255,255,255,.6)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{publicUrl}</span><button className="btn-outline" onClick={()=>navigator.clipboard?.writeText(publicUrl)}>Copier le lien</button>{profile.status==='public'&&<button className="btn-gold" onClick={()=>navigate(`/organisateurs/${slugCheck.slug}`)}>Voir ma page</button>}</div>
    <div className="os-layout">
      <section className="os-panel"><h2>Informations publiques</h2>
        <div className="os-upload-row"><div><div className="os-avatar">{profile.avatarUrl?<img src={profile.avatarUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:profile.publicName?.[0]||'O'}</div><label className={`os-upload-btn${uploading==='avatar'?' busy':''}`}>{uploading==='avatar'?<><span className="lib-spin" style={{width:12,height:12,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block'}}/>Envoi…</>:'Changer le logo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={e=>{chooseImage('avatar',e.target.files?.[0]);e.target.value=''}}/></label></div><div><div className="os-banner">{profile.bannerUrl&&<img src={profile.bannerUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>}</div><label className={`os-upload-btn${uploading==='banner'?' busy':''}`}>{uploading==='banner'?<><span className="lib-spin" style={{width:12,height:12,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block'}}/>Envoi…</>:'Changer la bannière'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={e=>{chooseImage('banner',e.target.files?.[0]);e.target.value=''}}/></label></div></div>
        <div className="os-grid"><Field label="Nom public"><input style={input} value={profile.publicName||''} onChange={e=>update({publicName:e.target.value})}/></Field><Field label="Slug public"><input style={{...input,borderColor:slugCheck.ok?'rgba(255,255,255,.12)':'rgba(224,90,170,.6)'}} value={profile.slug||''} onChange={e=>update({slug:e.target.value})}/>{!slugCheck.ok&&<small style={{color:C.pink}}>{slugCheck.error}</small>}</Field><Field label="Ville d’intervention"><input style={input} placeholder="Ta ville de base" value={profile.city||''} onChange={e=>update({city:e.target.value})}/></Field><Field label="Pays / régions d’intervention" wide><div style={{display:'flex',flexWrap:'wrap',gap:8}}>{ZONE_OPTIONS.map(r=>{const sel=zones.includes(r.id);return <button key={r.id} type="button" onClick={()=>toggleZone(r.id)} style={{padding:'8px 14px',borderRadius:20,border:`1px solid ${sel?C.teal:'rgba(255,255,255,.14)'}`,background:sel?'rgba(78,232,200,.14)':'rgba(255,255,255,.06)',color:sel?C.teal:'rgba(255,255,255,.6)',fontFamily:FONT,fontSize:12.5,fontWeight:600,cursor:'pointer',letterSpacing:'.02em'}}>{r.flag} {r.name}</button>})}</div><small style={{color:'rgba(255,255,255,.42)',fontSize:11,marginTop:4}}>Sélectionne tous les pays où tu organises — les visiteurs pourront te trouver en cherchant l’un d’eux.</small></Field><Field label="Description" wide><textarea style={input} rows={4} maxLength={500} placeholder="Présente ton univers en quelques phrases." value={profile.shortDescription||profile.longDescription||''} onChange={e=>update({shortDescription:e.target.value,longDescription:''})}/></Field><Field label="Réseaux sociaux" wide><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>{SOCIAL_NETWORKS.map(net=><label key={net.key} style={{display:'grid',gap:5}}><span style={{font:'600 10.5px Inter, sans-serif',letterSpacing:'.04em',textTransform:'uppercase',color:'rgba(255,255,255,.5)'}}>{net.label}</span><input style={input} placeholder={net.placeholder} value={profile.socialLinks?.[net.key]||''} onChange={e=>update({socialLinks:{...(profile.socialLinks||{}),[net.key]:e.target.value}})}/></label>)}</div><small style={{color:'rgba(255,255,255,.42)',fontSize:11,marginTop:6,display:'block'}}>Colle un lien complet ou juste ton @pseudo — le lien fonctionnera au clic pour tes visiteurs. Laisse vide ce que tu n’utilises pas.</small></Field></div>
        {message&&<div className={`os-message ${message.type}`} style={{marginTop:16,marginBottom:0}}>{message.text}</div>}
        <button className="os-save" onClick={save} disabled={saving}>{saving?'Enregistrement…':'Enregistrer'}</button>
      </section>
      <aside className="os-panel os-preview"><h2>Aperçu de ma page</h2><div style={{border:'1px solid rgba(255,255,255,.08)',borderRadius:12,overflow:'hidden',background:'#0b0c12'}}><div className="os-preview-banner" style={profile.bannerUrl?{backgroundImage:`url(${profile.bannerUrl})`}:undefined}/><div className="os-preview-body"><div className="os-preview-avatar">{profile.avatarUrl?<img src={profile.avatarUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:profile.publicName?.[0]||'O'}</div><h3 style={{font:`34px ${DISPLAY}`,margin:'10px 0 0'}}>{profile.publicName||'Ton nom public'}</h3><p style={{font:`600 11px ${UI}`,letterSpacing:'.04em',color:C.gold}}>{[profile.city,profile.country].filter(Boolean).join(' · ')||'Ville · Pays'}</p><p style={{fontSize:12,color:'rgba(255,255,255,.55)',lineHeight:1.6}}>{profile.shortDescription||profile.longDescription||'Ta description apparaîtra ici.'}</p></div></div><div style={{marginTop:16}}><p style={{font:`600 11px ${UI}`,letterSpacing:'.05em',textTransform:'uppercase',color:'rgba(255,255,255,.6)'}}>Statut de la page</p>{/* Valeur interne 'draft' inchangée (règles Firestore) — seul le libellé devient « Privée » */}{['draft','public'].map(status=><label key={status} style={{display:'flex',alignItems:'center',gap:9,padding:'9px 0',font:`500 13px ${UI}`,color:'rgba(255,255,255,.85)'}}><input type="radio" checked={profile.status===status} onChange={()=>update({status,isPublic:status==='public'})}/>{status==='public'?'Publique — visible par tout le monde':'Privée — visible par toi seulement'}</label>)}</div><button className="os-save" onClick={save} disabled={saving}>{saving?<><span className="lib-spin" style={{width:14,height:14,border:'2px solid rgba(255,255,255,.25)',borderTopColor:'rgba(255,255,255,.8)',borderRadius:'50%',display:'inline-block'}}/>Enregistrement…</>:'Enregistrer'}</button></aside>
      <section className="os-panel os-media-panel"><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h2 style={{marginBottom:4}}>Galerie photos & vidéos</h2><p style={{margin:0,color:'rgba(255,255,255,.42)',fontSize:12}}>Images 10 Mo max. Vidéos 50 Mo max. Maximum conseillé : 12 médias.</p></div><label className={`os-upload-btn primary${uploading==='gallery'?' busy':''}`}>{uploading==='gallery'?<><span className="lib-spin" style={{width:12,height:12,border:'2px solid rgba(4,4,11,.25)',borderTopColor:'#04040b',borderRadius:'50%',display:'inline-block'}}/>Envoi…</>:'+ Ajouter un média'}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" disabled={!!uploading} onChange={e=>upload('gallery',e.target.files?.[0])}/></label></div>
        <div className="os-media-list" style={{marginTop:16}}>{activeMedia.length===0?<div style={{color:'rgba(255,255,255,.5)',fontSize:13}}>Tu n’as encore ajouté aucun média.</div>:activeMedia.map((item,index)=><article className="os-media-item" key={item.id}><div className="os-media-thumb">{item.type==='video'?<video src={item.url} muted/>:<img src={item.url} alt=""/>}</div><input style={{...input,marginTop:8}} placeholder="Titre facultatif" value={item.title||''} onChange={e=>updateMedia(item.id,{title:e.target.value})}/><select style={{...input,marginTop:7}} value={item.eventId||''} onChange={e=>updateMedia(item.id,{eventId:e.target.value})}><option value="">Aucun événement lié</option>{events.map(event=><option key={event.id} value={event.id}>{event.name}</option>)}</select><label style={{display:'flex',gap:7,alignItems:'center',fontSize:11,color:'rgba(255,255,255,.55)',marginTop:8}}><input type="checkbox" checked={item.visibility!=='hidden'} onChange={e=>updateMedia(item.id,{visibility:e.target.checked?'public':'hidden'})}/> Visible publiquement</label><div className="os-media-actions"><button onClick={()=>moveMedia(index,-1)} disabled={index===0}>←</button><button onClick={()=>moveMedia(index,1)} disabled={index===activeMedia.length-1}>→</button><button onClick={()=>removeMedia(item.id)} style={{color:C.pink}}>Supprimer</button></div></article>)}</div>
      </section>
    </div>
    {cropEditor&&<div className="os-crop-backdrop" role="dialog" aria-modal="true" aria-label={`Recadrer ${cropEditor.kind==='avatar'?'le logo':'la bannière'}`}>
      <div className="os-crop-modal">
        <div className="os-crop-head"><div><h2>Recadrer {cropEditor.kind==='avatar'?'le logo':'la bannière'}</h2><p style={{font:`600 11px ${UI}`,color:'rgba(255,255,255,.5)',letterSpacing:'.05em',margin:'4px 0 0',textTransform:'uppercase'}}>Déplace l’image et ajuste le zoom</p></div><button onClick={()=>setCropEditor(null)} aria-label="Fermer" style={{width:34,height:34,borderRadius:'50%',border:'1px solid rgba(255,255,255,.12)',background:'rgba(255,255,255,.05)',color:'#fff',fontSize:19,cursor:'pointer'}}>×</button></div>
        <div className="os-crop-stage"><Cropper image={cropEditor.src} crop={crop} zoom={zoom} aspect={cropEditor.kind==='avatar'?1:3} cropShape={cropEditor.kind==='avatar'?'round':'rect'} showGrid={cropEditor.kind!=='avatar'} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_,pixels)=>setCroppedAreaPixels(pixels)}/></div>
        <div className="os-crop-foot"><div className="os-crop-zoom"><span>–</span><input aria-label="Zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/><span>+</span></div><div className="os-crop-actions"><button className="os-crop-cancel" onClick={()=>setCropEditor(null)}>Annuler</button><button className="os-crop-confirm" onClick={confirmCrop}>Utiliser ce cadrage</button></div></div>
      </div>
    </div>}
  </div></Layout>
}
