'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

// Port de src/components/OrganizerFollowButton.jsx — utilisé sur la page
// publique organisateur, la page "Organisateurs suivis" (#6 phase profil) et
// ses suggestions. Contrairement au legacy (modale d'auth inline), l'absence
// de session redirige vers /connexion?next=... — cette app n'a pas de modale
// d'auth globale, chaque page publique gère déjà ses CTA non-connectés de
// cette façon (voir le lien "Se connecter pour réserver" de
// app/(public)/evenements/[id]/page.tsx).

export type FollowAppearance = 'default' | 'premium'

export default function OrganizerFollowButtonClient({
  organizerId,
  organizerName,
  initialFollowing,
  isAuthenticated,
  compact = false,
  appearance = 'default',
  onUnfollow,
}: {
  organizerId: string
  organizerName: string
  initialFollowing: boolean
  isAuthenticated: boolean
  compact?: boolean
  appearance?: FollowAppearance
  onUnfollow?: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  function goToLogin() {
    router.push(`/login?next=${encodeURIComponent(pathname)}`)
  }

  async function follow() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/organizers/${organizerId}/follow`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError('Action impossible.')
      } else {
        setFollowing(true)
      }
    } catch {
      setError('Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function unfollow() {
    setBusy(true)
    setError(null)
    setMenuOpen(false)
    try {
      const res = await fetch(`/api/organizers/${organizerId}/follow`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError('Action impossible.')
      } else {
        setFollowing(false)
        onUnfollow?.()
      }
    } catch {
      setError('Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  function handleClick() {
    if (!isAuthenticated) return goToLogin()
    if (following) setMenuOpen((v) => !v)
    else follow()
  }

  const base: React.CSSProperties = {
    padding: compact ? '7px 14px' : '12px 22px',
    borderRadius: 999,
    fontSize: compact ? 12.5 : 13.5,
    fontWeight: 700,
    border: 'none',
    cursor: busy ? 'default' : 'pointer',
    width: appearance === 'premium' && !compact ? '100%' : undefined,
    opacity: busy ? 0.7 : 1,
  }

  const style: React.CSSProperties = following
    ? { ...base, background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.35)', color: '#6feedd' }
    : appearance === 'premium'
      ? { ...base, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)' }
      : { ...base, background: 'var(--teal-solid)', color: '#04120e' }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={handleClick} disabled={busy} style={style} aria-label={following ? `Se désabonner de ${organizerName}` : `Suivre ${organizerName}`}>
        {following && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#6feedd', marginRight: 7 }} />}
        {following ? 'Abonné(e)' : "S'abonner"}
      </button>

      {menuOpen && following && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 6,
            zIndex: 20,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}
        >
          <button
            onClick={unfollow}
            style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'rgba(224,90,170,0.14)', color: '#ff9ed2', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Se désabonner
          </button>
        </div>
      )}

      {error && <p style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, fontSize: 11.5, color: '#e05aaa', whiteSpace: 'nowrap' }}>{error}</p>}
    </div>
  )
}
