'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Heart } from 'lucide-react'
import { Button } from '@/app/components/ui'

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
    border: interested ? `1px solid rgba(255,229,0,${floating ? 0.42 : 0.38})` : 'none',
    background: interested ? `rgba(255,229,0,${floating ? 0.16 : 0.12})` : floating ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.07)',
    color: interested ? 'var(--primary)' : '#fff',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.7 : 1,
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Button
        onClick={toggle}
        disabled={busy}
        variant="ghost"
        style={style}
        aria-label={interested ? 'Retirer de mes événements intéressés' : 'Ajouter à mes événements intéressés'}
      >
        <Heart size={16} strokeWidth={1.9} fill={interested ? 'currentColor' : 'none'} aria-hidden="true" />
        {!compact && <span style={{ fontSize: 12.5, fontWeight: 700 }}>Intéressé</span>}
      </Button>
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
            background: 'rgba(255,123,123,0.14)',
            color: 'var(--pink)',
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
