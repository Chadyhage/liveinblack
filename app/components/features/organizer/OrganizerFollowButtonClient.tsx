'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { BellOff } from 'lucide-react'
import { Button, Modal } from '@/app/components/ui'
import styles from './OrganizerFollowButtonClient.module.css'

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
  showUnfollowLabel = false,
  onUnfollow,
  onFollow,
}: {
  organizerId: string
  organizerName: string
  initialFollowing: boolean
  isAuthenticated: boolean
  compact?: boolean
  appearance?: FollowAppearance
  showUnfollowLabel?: boolean
  onUnfollow?: () => void
  onFollow?: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmUnfollow, setConfirmUnfollow] = useState(false)

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
    if (following) setConfirmUnfollow(true)
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
    ? { ...base, background: 'var(--primary-a12)', border: '1px solid var(--primary-a35)', color: 'var(--primary)' }
    : appearance === 'premium'
      ? { ...base, background: 'var(--fill-secondary)', color: 'var(--text)' }
      : appearance === 'outline'
        ? { ...base, background: 'transparent', border: '1px solid var(--primary-a55)', color: 'var(--text)' }
        : { ...base, background: 'var(--primary)', color: 'var(--primary-ink)' }

  return (
    <div className={styles.root}>
      <Button
        type="button"
        onClick={handleClick}
        disabled={busy}
        style={style}
        aria-label={following ? `Gérer l’abonnement à ${organizerName}` : `Suivre ${organizerName}`}
        aria-haspopup={following ? 'dialog' : undefined}
      >
        {following && !showUnfollowLabel ? <span className={styles.followingDot} /> : null}
        {following ? (showUnfollowLabel ? 'Se désabonner' : 'Abonné(e)') : "S'abonner"}
      </Button>

      {confirmUnfollow && (
        <Modal
          onClose={() => setConfirmUnfollow(false)}
          ariaLabel={`Se désabonner de ${organizerName}`}
          title={`Se désabonner de ${organizerName} ?`}
          maxWidth={420}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => setConfirmUnfollow(false)} disabled={busy}>
                Annuler
              </Button>
              <Button variant="danger" size="sm" onClick={() => void unfollow()} disabled={busy} loading={busy} loadingText="Mise à jour…">
                Se désabonner
              </Button>
            </>
          }
        >
          <div className={styles.confirmContent}>
            <span className={styles.confirmIcon} aria-hidden="true"><BellOff size={20} /></span>
            <div>
              <p>Tu ne recevras plus les alertes et les actualités publiées par cet organisateur.</p>
              <span>Tu pourras te réabonner à tout moment depuis sa page.</span>
            </div>
          </div>
        </Modal>
      )}

      {error && <p style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, fontSize: 'var(--font-size-caption-lg)', color: 'var(--pink)', whiteSpace: 'nowrap' }}>{error}</p>}
    </div>
  )
}
