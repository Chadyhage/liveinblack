import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  cacheOrganizerFollows,
  followOrganizer,
  getOrganizerFollows,
  unfollowOrganizer,
} from '../utils/organizers'

export default function OrganizerFollowButton({ organizer, compact = false, appearance = 'default', onChange }) {
  const { user, openAuthModal } = useAuth()
  const uid = user?.uid || user?.id
  const organizerId = organizer?.id || organizer?.userId
  const [follows, setFollows] = useState(() => getOrganizerFollows(uid))
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState(false)
  const [error, setError] = useState('')
  const followed = follows.some(f => f.organizerId === organizerId && f.status === 'active')
  const premium = appearance === 'premium'

  useEffect(() => {
    if (!uid) { setFollows([]); return }
    let stop = () => {}
    import('../utils/firestore-sync').then(({ listenOrganizerFollows }) => {
      stop = listenOrganizerFollows(uid, items => setFollows(cacheOrganizerFollows(uid, items)))
    }).catch(() => {})
    return () => stop()
  }, [uid])

  async function toggle() {
    setError('')
    if (!uid) {
      openAuthModal(
        `Connecte-toi pour suivre ${organizer?.publicName || 'cet organisateur'} et être prévenu de ses prochains événements.`
      )
      return
    }
    if (uid === organizerId || organizer?.status !== 'public') return
    if (followed) { setMenu(v => !v); return }
    setBusy(true)
    try {
      const next = await followOrganizer(uid, organizerId)
      setFollows(next)
      onChange?.(true)
    } catch (e) { setError(e.message || 'Impossible de s’abonner.') }
    setBusy(false)
  }

  async function unfollow() {
    setBusy(true)
    try {
      const next = await unfollowOrganizer(uid, organizerId)
      setFollows(next)
      setMenu(false)
      onChange?.(false)
    } catch (e) { setError(e.message || 'Impossible de se désabonner.') }
    setBusy(false)
  }

  if (uid === organizerId) return null

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button onClick={toggle} disabled={busy || organizer?.status !== 'public'} style={{
        width: premium ? '100%' : compact ? 'auto' : '100%', minWidth: compact ? 112 : 148,
        minHeight: premium ? 46 : 40,
        padding: premium ? '11px 16px' : compact ? '9px 14px' : '12px 20px', borderRadius: 10,
        border: organizer?.status !== 'public' ? '1px solid rgba(255,255,255,0.06)' : followed ? '1px solid rgba(78,232,200,0.35)' : premium ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
        background: organizer?.status !== 'public' ? 'rgba(255,255,255,0.07)' : followed ? 'rgba(78,232,200,0.12)' : premium ? 'rgba(255,255,255,0.08)' : '#3ed6b5',
        color: organizer?.status !== 'public' ? 'rgba(255,255,255,0.35)' : followed ? '#6feedd' : premium ? 'rgba(255,255,255,0.9)' : '#04120e',
        cursor: busy ? 'wait' : organizer?.status !== 'public' ? 'not-allowed' : 'pointer',
        fontFamily: 'Inter, sans-serif', fontSize: compact ? 12 : 13,
        letterSpacing: '0.01em', textTransform: 'none', fontWeight: 700,
      }}>
        {busy ? <span className="lib-spin" style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'currentColor', borderRadius: '50%', display: 'inline-block', verticalAlign: '-2px' }} /> : followed ? <span style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7 }}>Abonné(e) <span aria-hidden="true" style={{ width:6,height:6,borderRadius:'50%',background:'currentColor' }} /></span> : 'S’abonner'}
      </button>
      {menu && (
        <div style={{ position: 'absolute', zIndex: 80, right: 0, bottom: 'calc(100% + 8px)', width: 'min(210px, calc(100vw - 52px))', padding: 6, borderRadius: 12, background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
          <button onClick={unfollow} style={{ width: '100%', padding: '10px 14px', border: '1px solid rgba(224,90,170,0.55)', borderRadius: 8, background: 'rgba(224,90,170,0.14)', color: '#ff9ed2', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, textAlign: 'left' }}>Se désabonner</button>
        </div>
      )}
      {error && <span style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, color: '#ff9ed2', fontFamily: 'Inter, sans-serif', fontSize: 12, whiteSpace: 'nowrap' }}>{error}</span>}
    </div>
  )
}
