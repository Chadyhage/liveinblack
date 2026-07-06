import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  cacheOrganizerFollows,
  followOrganizer,
  getOrganizerFollows,
  unfollowOrganizer,
} from '../utils/organizers'

const C = { obsidian: '#04040b', teal: '#4ee8c8' }

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
    <div style={{ position: 'relative' }}>
      <button onClick={toggle} disabled={busy || organizer?.status !== 'public'} style={{
        width: premium ? '100%' : compact ? 'auto' : '100%', minWidth: compact ? 112 : 148,
        minHeight: premium ? 46 : undefined,
        padding: premium ? '11px 16px' : compact ? '9px 14px' : '12px 20px', borderRadius: premium ? 10 : 4,
        border: premium ? `1px solid ${followed ? 'rgba(78,232,200,.26)' : 'rgba(255,255,255,.14)'}` : followed ? '1px solid rgba(78,232,200,.5)' : '1px solid transparent',
        background: premium ? (followed ? 'rgba(78,232,200,.07)' : 'rgba(255,255,255,.055)') : followed ? 'rgba(78,232,200,.08)' : C.teal,
        color: premium ? (followed ? '#8cefdc' : 'rgba(255,255,255,.82)') : followed ? C.teal : C.obsidian, cursor: busy ? 'wait' : 'pointer',
        fontFamily: premium ? 'Inter, sans-serif' : 'DM Mono, monospace', fontSize: premium ? 12 : compact ? 9 : 10,
        letterSpacing: premium ? '.02em' : '.14em', textTransform: premium ? 'none' : 'uppercase', fontWeight: 750,
      }}>
        {busy ? 'Patiente…' : followed ? <span style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7 }}>Abonné <span aria-hidden="true" style={{ width:6,height:6,borderRadius:'50%',background:'#4ee8c8' }} /></span> : 'S’abonner'}
      </button>
      {menu && (
        <div style={{ position: 'absolute', zIndex: 30, right: 0, top: 'calc(100% + 7px)', width: 190, padding: 7, borderRadius: 8, background: '#0b0d14', border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 18px 50px rgba(0,0,0,.55)' }}>
          <button onClick={unfollow} style={{ width: '100%', padding: '10px 12px', border: 0, borderRadius: 5, background: 'rgba(224,90,170,.08)', color: '#f28abe', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '.08em', textAlign: 'left' }}>Se désabonner</button>
        </div>
      )}
      {error && <span style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, color: '#f28abe', fontSize: 10, whiteSpace: 'nowrap' }}>{error}</span>}
    </div>
  )
}
