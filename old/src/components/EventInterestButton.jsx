import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import {
  cacheEventInterests,
  getEventInterests,
  markEventInterested,
  unmarkEventInterested,
} from '../utils/eventInterests'

function HeartIcon({ filled = false, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6c-1.8-1.8-4.7-1.8-6.5 0L12 6.9 9.7 4.6c-1.8-1.8-4.7-1.8-6.5 0s-1.8 4.7 0 6.5L12 20l8.8-8.9c1.8-1.8 1.8-4.7 0-6.5z" />
    </svg>
  )
}

export default function EventInterestButton({ event, compact = false, floating = false, onChange }) {
  const { user, openAuthModal } = useAuth()
  const uid = getUserId(user)
  const eventId = event?.id ? String(event.id) : ''
  const [items, setItems] = useState(() => getEventInterests(uid))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const interested = items.some(item => item.eventId === eventId && item.status === 'active')

  useEffect(() => {
    if (!uid) { setItems([]); return }
    setItems(getEventInterests(uid))
    let stop = () => {}
    import('../utils/firestore-sync').then(({ listenDoc }) => {
      stop = listenDoc(`user_social/${uid}`, data => {
        if (data?.interestedEvents) setItems(cacheEventInterests(uid, data.interestedEvents))
      })
    }).catch(() => {})
    const onLocalUpdate = e => {
      if (!e.detail?.uid || e.detail.uid === uid) setItems(getEventInterests(uid))
    }
    window.addEventListener('lib:event-interests-updated', onLocalUpdate)
    window.addEventListener('lib:sync-complete', onLocalUpdate)
    return () => {
      try { stop() } catch {}
      window.removeEventListener('lib:event-interests-updated', onLocalUpdate)
      window.removeEventListener('lib:sync-complete', onLocalUpdate)
    }
  }, [uid])

  async function toggle(e) {
    e?.stopPropagation?.()
    setError('')
    if (!eventId) return
    if (!uid) {
      openAuthModal('Connecte-toi pour garder cet événement dans ta liste d\'intérêts.')
      return
    }
    setBusy(true)
    try {
      const next = interested
        ? await unmarkEventInterested(uid, eventId)
        : await markEventInterested(uid, event)
      setItems(next)
      onChange?.(!interested)
    } catch (err) {
      setError(err.message || 'Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  const label = 'Intéressé'
  const ariaLabel = interested ? 'Retirer de mes événements intéressés' : 'Ajouter à mes événements intéressés'
  const base = floating
    ? {
        minHeight: 34,
        padding: compact ? '0 11px' : '0 13px',
        borderRadius: 999,
        background: interested ? 'rgba(78,232,200,0.16)' : 'rgba(0,0,0,0.55)',
        border: interested ? '1px solid rgba(78,232,200,0.42)' : '1px solid rgba(255,255,255,0.14)',
        color: interested ? '#7af2dd' : 'rgba(255,255,255,0.9)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
      }
    : {
        minHeight: compact ? 38 : 44,
        padding: compact ? '0 14px' : '0 18px',
        borderRadius: 12,
        background: interested ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.07)',
        border: interested ? '1px solid rgba(78,232,200,0.38)' : '1px solid rgba(255,255,255,0.12)',
        color: interested ? '#7af2dd' : 'rgba(255,255,255,0.86)',
      }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-pressed={interested}
        aria-label={ariaLabel}
        disabled={busy}
        onClick={toggle}
        className="lib-press"
        style={{
          ...base,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          cursor: busy ? 'wait' : 'pointer',
          fontFamily: 'Inter, sans-serif',
          fontSize: compact ? 11.5 : 12.5,
          fontWeight: 800,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          opacity: busy ? 0.74 : 1,
        }}
      >
        {busy ? <span className="lib-spin" style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.24)', borderTopColor: 'currentColor', borderRadius: '50%', display: 'inline-block' }} /> : <HeartIcon filled={interested} />}
        {!compact && label}
      </button>
      {error && (
        <span style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 210, padding: '7px 9px', borderRadius: 8, background: '#171822', border: '1px solid rgba(224,90,170,0.35)', color: '#ff9ed2', fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 600, zIndex: 20 }}>
          {error}
        </span>
      )}
    </span>
  )
}
