'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button, Modal } from '@/app/components/ui'

// Port de src/components/OrganizerFollowButton.jsx — utilisé sur la page
// publique organisateur, la page "Organisateurs suivis" (#6 phase profil) et
// ses suggestions. Contrairement au legacy (modale d'auth inline), l'absence
// de session redirige vers /connexion?next=... — cette app n'a pas de modale
// d'auth globale, chaque page publique gère déjà ses CTA non-connectés de
// cette façon (voir le lien "Se connecter pour réserver" de
// app/(public)/evenements/[id]/page.tsx).

// 'outline' : utilisé quand ce bouton est affiché juste à côté d'une action
// principale déjà pleine (ex. « Envoyer un message » sur la fiche
// organisateur) — deux pills pleines vert vif de même poids visuel côte à
// côte laissaient croire aux deux actions d'être équivalentes.
export type FollowAppearance = 'default' | 'premium' | 'outline'

export default function OrganizerFollowButtonClient({
  organizerId,
  organizerName,
  initialFollowing,
  isAuthenticated,
  compact = false,
  appearance = 'default',
  onUnfollow,
  onFollow,
}: {
  organizerId: string
  organizerName: string
  initialFollowing: boolean
  isAuthenticated: boolean
  compact?: boolean
  appearance?: FollowAppearance
  onUnfollow?: () => void
  onFollow?: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmUnfollow, setConfirmUnfollow] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setMenuOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

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
        onFollow?.()
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
    setConfirmUnfollow(false)
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
    borderRadius: 'var(--radius-pill)',
    fontSize: compact ? 12 : 13,
    fontWeight: 500,
    textTransform: 'none',
    letterSpacing: 'normal',
    border: 'none',
    cursor: busy ? 'default' : 'pointer',
    width: appearance === 'premium' && !compact ? '100%' : undefined,
    opacity: busy ? 0.7 : 1,
  }

  const style: React.CSSProperties = following
    ? { ...base, background: 'rgba(184, 243, 74,0.12)', border: '1px solid rgba(184, 243, 74,0.35)', color: 'var(--primary)' }
    : appearance === 'premium'
      ? { ...base, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)' }
      : appearance === 'outline'
        ? { ...base, background: 'transparent', border: '1px solid rgba(184, 243, 74,.55)', color: 'var(--text)' }
        : { ...base, background: 'var(--primary)', color: 'var(--primary-ink)' }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <Button
        type="button"
        onClick={handleClick}
        disabled={busy}
        style={style}
        aria-label={following ? `Gérer l’abonnement à ${organizerName}` : `Suivre ${organizerName}`}
        aria-expanded={following ? menuOpen : undefined}
        aria-haspopup={following ? 'menu' : undefined}
      >
        {following && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', marginRight: 7 }} />}
        {following ? 'Abonné(e)' : "S'abonner"}
      </Button>

      {menuOpen && following && (
        <div
          role="menu"
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
          <Button
            type="button"
            variant="danger"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              setConfirmUnfollow(true)
            }}
            style={{ display: 'block', width: '100%', borderRadius: 'var(--radius-md)', padding: '10px 16px', background: 'rgba(255,123,123,0.14)', color: 'var(--pink)', border: 'none', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            Se désabonner
          </Button>
        </div>
      )}

      {confirmUnfollow && (
        <Modal
          onClose={() => setConfirmUnfollow(false)}
          maxWidth={380}
          ariaLabel={`Se désabonner de ${organizerName}`}
          title="Se désabonner"
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmUnfollow(false)} disabled={busy}>
                Annuler
              </Button>
              <Button variant="danger" onClick={() => void unfollow()} disabled={busy} loading={busy} loadingText="Mise à jour…">
                Se désabonner
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: 14 }}>
            Tu ne recevras plus les alertes et actualités de {organizerName}.
          </p>
        </Modal>
      )}

      {error && <p style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, fontSize: 11.5, color: 'var(--pink)', whiteSpace: 'nowrap' }}>{error}</p>}
    </div>
  )
}
