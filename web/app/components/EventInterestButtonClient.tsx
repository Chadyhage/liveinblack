'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

// Port de src/components/EventInterestButton.jsx — bouton coeur utilisé sur
// la fiche événement et sur la page "Événements intéressés" (#6 phase
// profil). Même adaptation que OrganizerFollowButtonClient pour l'absence de
// session : redirection /connexion?next=... plutôt qu'une modale d'auth.

export default function EventInterestButtonClient({
  eventId,
  initialInterested,
  isAuthenticated,
  floating = false,
  compact = false,
  onChange,
}: {
  eventId: string
  initialInterested: boolean
  isAuthenticated: boolean
  floating?: boolean
  compact?: boolean
  onChange?: (interested: boolean) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [interested, setInterested] = useState(initialInterested)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/${eventId}/interest`, { method: interested ? 'DELETE' : 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError('Action impossible.')
      } else {
        setInterested(data.interested)
        onChange?.(data.interested)
      }
    } catch {
      setError('Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  const size = compact ? 30 : 34
  const style: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: size,
    padding: compact ? '0 8px' : '0 14px',
    borderRadius: 999,
    border: interested ? `1px solid rgba(78,232,200,${floating ? 0.42 : 0.38})` : 'none',
    background: interested ? `rgba(78,232,200,${floating ? 0.16 : 0.12})` : floating ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.07)',
    color: interested ? '#7af2dd' : '#fff',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.7 : 1,
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={toggle}
        disabled={busy}
        style={style}
        aria-label={interested ? 'Retirer de mes événements intéressés' : 'Ajouter à mes événements intéressés'}
      >
        <HeartIcon filled={interested} />
        {!compact && <span style={{ fontSize: 12.5, fontWeight: 700 }}>Intéressé</span>}
      </button>
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            zIndex: 20,
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(224,90,170,0.14)',
            color: '#ff9ed2',
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.727c-.372 0-.729-.14-1.006-.395C7.717 17.634 3 12.855 3 8.967 3 6.224 5.101 4 7.72 4c1.62 0 3.05.868 3.905 2.19a.44.44 0 00.75 0C13.23 4.868 14.66 4 16.28 4 18.9 4 21 6.224 21 8.967c0 3.888-4.717 8.667-7.994 11.365-.277.255-.634.395-1.006.395z"
      />
    </svg>
  )
}
