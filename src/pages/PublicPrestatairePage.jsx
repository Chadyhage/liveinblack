import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PublicNav from '../components/PublicNav'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { getCatalog, getAllProviderProfiles } from '../utils/services'
import { createDirectConversation, getUserId } from '../utils/messaging'
import { getProviderCategory } from '../utils/providerCategories'
import ShareToChatModal from '../components/ShareToChatModal'
import { getRegionName, normalizeRegionIds } from '../utils/locations'

const FONT = 'Inter, system-ui, sans-serif'
const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e' }

function Icon({ name, size = 18 }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'message') return <svg {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>
  if (name === 'location') return <svg {...props}><path d="M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
  if (name === 'link') return <svg {...props}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
  return <svg {...props}><path d="m15 18-6-6 6-6" /></svg>
}

function externalUrl(value) {
  if (!value) return null
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function getOfferMedia(item) {
  if (Array.isArray(item?.media)) return item.media.filter(media => media?.url)
  return item?.mediaUrl ? [{ url: item.mediaUrl, type: item.mediaType || 'image' }] : []
}

function PageChrome({ user, children }) {
  return user ? <Layout>{children}</Layout> : children
}

export default function PublicPrestatairePage() {
  const { providerId } = useParams()
  const navigate = useNavigate()
  const { user, openAuthModal } = useAuth()
  const decodedId = decodeURIComponent(providerId || '')
  const [profile, setProfile] = useState(() => getAllProviderProfiles().find(item => item.userId === decodedId) || null)
  const [catalog, setCatalog] = useState(() => getCatalog(decodedId))
  const [loading, setLoading] = useState(true)
  const [shareItem, setShareItem] = useState(null) // offre en cours de partage

  useEffect(() => {
    let unlistenProviders = () => {}
    let unlistenCatalogs = () => {}
    const timeout = setTimeout(() => setLoading(false), 1400)

    import('../utils/firestore-sync').then(({ listenProviders, listenCatalogs }) => {
      unlistenProviders = listenProviders(items => {
        const found = items.find(item => item.userId === decodedId)
        if (found) setProfile(found)
        setLoading(false)
      })
      unlistenCatalogs = listenCatalogs(byUser => {
        if (byUser[decodedId]) setCatalog(byUser[decodedId])
      })
    }).catch(() => setLoading(false))

    return () => {
      clearTimeout(timeout)
      unlistenProviders()
      unlistenCatalogs()
    }
  }, [decodedId])

  const visibleCatalog = useMemo(() => catalog.filter(item => item.available !== false), [catalog])
  const category = getProviderCategory(profile?.prestataireType)
  // isSelf = même compte (peu importe l'interface active) → jamais de bouton
  // « Envoyer un message » vers soi-même. canManage = interface prestataire
  // active → seul cas où « Gérer ma page » s'affiche.
  const isSelf = !!user && getUserId(user) === decodedId
  const canManage = isSelf && user?.role === 'prestataire'

  function startConversation(account = user) {
    const myId = getUserId(account)
    if (!myId || !profile?.userId) return
    const conv = createDirectConversation(myId, account?.name || 'Membre LIVE IN BLACK', profile.userId, profile.name || 'Prestataire')
    navigate('/messagerie', { state: { conversationId: conv.id } })
  }

  // Partage d'une offre dans une conversation. Déconnecté → auth modal, puis
  // ouverture du partage une fois connecté.
  function handleShare(item) {
    if (!user) {
      openAuthModal('Connecte-toi pour partager cette offre dans tes conversations.', () => setShareItem(item))
      return
    }
    setShareItem(item)
  }

  function handleContact() {
    if (canManage) {
      navigate('/proposer')
      return
    }
    if (isSelf) return
    if (!user) {
      openAuthModal(`Connecte-toi pour écrire à ${profile?.name || 'ce prestataire'}.`, loggedInUser => startConversation(loggedInUser))
      return
    }
    startConversation(user)
  }

  if (!profile && loading) {
    return (
      <PageChrome user={user}>
        <div style={{ minHeight: '100vh', background: C.obsidian, color: '#fff' }}>
          {!user && <PublicNav />}
          <div style={{ maxWidth: 980, margin: '0 auto', padding: '80px 22px', fontFamily: FONT, color: 'rgba(255,255,255,.55)' }}>Chargement de la page…</div>
        </div>
      </PageChrome>
    )
  }

  if (!profile) {
    return (
      <PageChrome user={user}>
        <div style={{ minHeight: '100vh', background: C.obsidian, color: '#fff' }}>
          {!user && <PublicNav />}
          <main style={{ maxWidth: 720, margin: '0 auto', padding: '80px 22px', textAlign: 'center' }}>
            <h1 style={{ fontFamily: FONT, fontSize: 32, margin: 0 }}>Prestataire introuvable</h1>
            <p style={{ fontFamily: FONT, color: 'rgba(255,255,255,.55)', lineHeight: 1.6 }}>Cette page n’existe pas ou n’est plus publiée.</p>
            <button onClick={() => navigate('/prestataires')} style={secondaryButton}>Retour aux prestataires</button>
          </main>
        </div>
      </PageChrome>
    )
  }

  const website = externalUrl(profile.website)
  const zones = normalizeRegionIds(profile.zonesIntervention).map(getRegionName).filter(Boolean)
  const locationLabel = [profile.city || profile.location, profile.country].filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index).join(' · ')

  return (
    <PageChrome user={user}>
      <div style={{ minHeight: '100vh', color: '#fff', background: `radial-gradient(circle 850px at 12% 5%, ${category.color}22, transparent 58%), ${C.obsidian}` }}>
      <style>{`
        .provider-public-shell{max-width:980px;margin:0 auto;padding:26px 22px 80px}
        .provider-hero{min-height:220px}
        .provider-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:26px;align-items:start}
        .provider-catalog-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .provider-sticky-contact{position:sticky;top:92px}
        @media(max-width:720px){
          .provider-public-shell{padding:18px 16px 96px}
          .provider-hero{min-height:170px}
          .provider-main-grid{grid-template-columns:1fr}
          .provider-catalog-grid{grid-template-columns:1fr}
          .provider-sticky-contact{position:static}
        }
      `}</style>
      {!user && <PublicNav />}

      <main className="provider-public-shell">
        <button onClick={() => navigate('/prestataires')} style={{ ...linkButton, marginBottom: 14 }}><Icon name="back" size={16} /> Tous les prestataires</button>

        <section className="provider-hero" style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(255,255,255,.1)', background: profile.coverUrl ? `url(${profile.coverUrl}) center/cover` : `linear-gradient(130deg, ${category.color}55, rgba(8,10,20,.92) 68%)` }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,4,11,.96), rgba(4,4,11,.12) 70%)' }} />
        </section>

        <div style={{ position: 'relative', marginTop: -48, padding: '0 20px 24px', display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', border: '4px solid #080810', overflow: 'hidden', background: category.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.obsidian, fontFamily: FONT, fontWeight: 900, fontSize: 34, flexShrink: 0 }}>
            {profile.photoUrl ? <img src={profile.photoUrl} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : profile.name?.charAt(0)?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 210, paddingBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: FONT, fontSize: 'clamp(27px,5vw,40px)', lineHeight: 1, letterSpacing: '-1px', margin: 0 }}>{profile.name}</h1>
            </div>
            <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: category.color, margin: '8px 0 0' }}>{category.singular}</p>
          </div>
          {(canManage || !isSelf) && <button onClick={handleContact} style={primaryButton}><Icon name="message" /> {canManage ? 'Gérer ma page' : 'Envoyer un message'}</button>}
        </div>

        <div className="provider-main-grid">
          <div>
            <section style={sectionStyle}>
              <h2 style={sectionTitle}>À propos</h2>
              <p style={{ fontFamily: FONT, fontSize: 15, color: 'rgba(255,255,255,.68)', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>{profile.description || 'Ce prestataire n’a pas encore ajouté de présentation.'}</p>
              {(locationLabel || zones.length > 0 || website || profile.phone) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
                  {locationLabel && <span style={detailLine}><Icon name="location" size={16} /> {locationLabel}</span>}
                  {zones.length > 0 && <span style={detailLine}><Icon name="location" size={16} /> Intervient dans : {zones.join(', ')}</span>}
                  {website && <a href={website} target="_blank" rel="noreferrer" style={{ ...detailLine, color: C.teal, textDecoration: 'none' }}><Icon name="link" size={16} /> Voir son site ou réseau social</a>}
                  {/* Numéro PRO = contact business, public (pas d'opt-in). Clic = appel. */}
                  {profile.phone && (
                    <a href={`tel:${String(profile.phone).replace(/[^\d+]/g, '')}`} style={{ ...detailLine, color: C.gold, textDecoration: 'none' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg> {profile.phone}
                    </a>
                  )}
                </div>
              )}
            </section>

            <section style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                <h2 style={{ ...sectionTitle, margin: 0 }}>Catalogue</h2>
                <span style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.4)' }}>{visibleCatalog.length} offre{visibleCatalog.length > 1 ? 's' : ''}</span>
              </div>
              {visibleCatalog.length === 0 ? (
                <div style={{ ...sectionStyle, color: 'rgba(255,255,255,.5)', fontFamily: FONT, fontSize: 14 }}>Le catalogue sera bientôt complété.</div>
              ) : (
                <div className="provider-catalog-grid">
                  {visibleCatalog.map(item => (
                    <article key={item.id} style={{ overflow: 'hidden', borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.09)' }}>
                      {getOfferMedia(item).length > 0 && (
                        <div aria-label={`Médias de ${item.name}`} style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'thin', background: '#05060b' }}>
                          {getOfferMedia(item).map((media, index) => (
                            media.type === 'video'
                              ? <video key={`${media.url}-${index}`} src={media.url} controls playsInline preload="metadata" style={{ display: 'block', flex: '0 0 100%', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', scrollSnapAlign: 'start' }} />
                              : <img key={`${media.url}-${index}`} src={media.url} alt={`${item.name} — ${index + 1}`} loading="lazy" style={{ display: 'block', flex: '0 0 100%', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', scrollSnapAlign: 'start' }} />
                          ))}
                        </div>
                      )}
                      <div style={{ padding: 18 }}>
                        {item.category && <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', color: category.color, margin: '0 0 8px' }}>{item.category}</p>}
                        <h3 style={{ fontFamily: FONT, fontSize: 18, margin: 0 }}>{item.name}</h3>
                        {item.description && <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.55)', lineHeight: 1.6, margin: '9px 0 0' }}>{item.description}</p>}
                        <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 800, color: C.gold, margin: '16px 0 0' }}>
                          {Number(item.price) > 0 ? `${Number(item.price).toLocaleString('fr-FR')} €${item.unit ? ` / ${item.unit}` : ''}` : 'Tarif sur demande'}
                        </p>
                        {Number(item.price) > 0 && <p style={{ fontFamily: FONT, fontSize: 10, color: 'rgba(255,255,255,.35)', margin: '4px 0 0' }}>Tarif indicatif</p>}
                        <button onClick={() => handleShare(item)} style={shareButton}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                          Partager cette offre
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="provider-sticky-contact" style={{ ...sectionStyle, borderColor: `${category.color}44` }}>
            <h2 style={{ ...sectionTitle, fontSize: 21 }}>Un projet à lui proposer ?</h2>
            <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.55)', lineHeight: 1.6, margin: '0 0 18px' }}>Échangez directement dans la messagerie LIVE IN BLACK pour discuter de la date, du tarif et des conditions.</p>
            {(canManage || !isSelf) && <button onClick={handleContact} style={{ ...primaryButton, width: '100%', justifyContent: 'center' }}><Icon name="message" /> {canManage ? 'Gérer ma page' : 'Envoyer un message'}</button>}
            {!isSelf && <p style={{ fontFamily: FONT, fontSize: 10.5, color: 'rgba(255,255,255,.32)', lineHeight: 1.5, margin: '14px 0 0' }}>LIVE IN BLACK facilite la mise en relation. La réservation et le règlement sont convenus directement avec le prestataire.</p>}
          </aside>
        </div>
      </main>
      </div>
      <ShareToChatModal
        open={!!shareItem}
        onClose={() => setShareItem(null)}
        user={user}
        title="Partager cette offre"
        messageType="catalog_item"
        payload={shareItem ? {
          providerId: profile.userId,
          providerName: profile.name || 'Prestataire',
          itemId: shareItem.id,
          name: shareItem.name,
          price: shareItem.price ?? null,
          unit: shareItem.unit || '',
          category: shareItem.category || '',
          image: (Array.isArray(shareItem.media) ? shareItem.media.find(m => m?.url && m.type !== 'video')?.url : shareItem.mediaUrl) || null,
        } : {}}
      />
    </PageChrome>
  )
}

const sectionStyle = { padding: 20, borderRadius: 18, background: 'rgba(9,11,20,.62)', border: '1px solid rgba(255,255,255,.09)', backdropFilter: 'blur(18px)' }
const sectionTitle = { fontFamily: FONT, fontSize: 24, letterSpacing: '-.4px', margin: '0 0 13px' }
const detailLine = { display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.58)' }
const primaryButton = { display: 'inline-flex', alignItems: 'center', gap: 9, minHeight: 46, padding: '12px 18px', borderRadius: 13, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg,${C.gold},#e0c48a)`, color: C.obsidian, fontFamily: FONT, fontSize: 13.5, fontWeight: 800 }
const secondaryButton = { minHeight: 44, padding: '11px 17px', borderRadius: 12, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#fff', fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const linkButton = { display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: 0, border: 0, background: 'none', color: 'rgba(255,255,255,.58)', fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const shareButton = { display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(78,232,200,.28)', background: 'rgba(78,232,200,.08)', color: '#4ee8c8', fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }
