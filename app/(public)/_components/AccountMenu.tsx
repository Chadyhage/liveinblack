'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { Ticket, User, LayoutDashboard, LogOut, Check, ChevronDown, Globe, Bell } from 'lucide-react'
import { Avatar, Button, ConfirmDialog } from '@/app/components/ui'
import { DASHBOARD_BY_ROLE } from '@/lib/shared/dashboardRoutes'

// Remplace les boutons Connexion/Créer un compte de PublicNav dès qu'une
// session existe — avant ce composant, un utilisateur connecté voyait
// toujours les boutons d'auth sur /home (aucun composant ne vérifiait la
// session côté nav). Aperçu compte, façon Instagram/Twitter
// (dropdown, pas de navigation complète pour un simple coup d'œil).

export default function AccountMenu({
  user,
  menuAlign = 'right',
  menuDirection = 'auto',
  dashboardMode = false,
}: {
  user: { id: string; name?: string | null; email?: string | null; image?: string | null; activeRole?: string | null; roles?: string[] | null }
  menuAlign?: 'left' | 'right'
  menuDirection?: 'auto' | 'up' | 'down'
  dashboardMode?: boolean
}) {
  const router = useRouter()
  const { update } = useSession()
  const [accountOpen, setAccountOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [switchingRole, setSwitchingRole] = useState(false)
  const [notifUnread, setNotifUnread] = useState(0)
  const [resolvedDirection, setResolvedDirection] = useState<'up' | 'down'>(menuDirection === 'up' ? 'up' : 'down')
  const rootRef = useRef<HTMLDivElement>(null)

  function resolveMenuDirection() {
    if (menuDirection !== 'auto') return menuDirection
    if (!rootRef.current) return 'down'
    const rect = rootRef.current.getBoundingClientRect()
    const estimatedMenuHeight = dashboardMode ? 210 : 270
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    return spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow ? 'up' : 'down'
  }

  // Compteur non-lu pour le lien "Notifications" du menu compte — la cloche
  // dédiée a été retirée du header (elle vit maintenant dans la sidebar de
  // DashboardShell.tsx, réservée aux pages (app)), mais ce composant est
  // AUSSI monté sur les pages publiques ((public)/, jamais de sidebar
  // là-bas) : sans ce lien + badge, un utilisateur connecté naviguant sur
  // /home, /events, etc. n'aurait plus aucun moyen d'atteindre ses
  // notifications depuis ces pages (régression confirmée le 13/08/2026).
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/notifications')
        const data = await res.json()
        if (!cancelled && res.ok && data.ok) setNotifUnread(data.unreadCount)
      } catch {
        // Badge non-critique — reste à sa dernière valeur connue.
      }
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Un compte peut porter plusieurs rôles à la fois (voir lib/models/User.ts)
  // — bascule activeRole côté serveur (POST /api/account/active-role, seule
  // source de vérité) puis rafraîchit le JWT côté client via `update()` avant
  // de naviguer, sans quoi la page de destination verrait encore l'ancien
  // activeRole tant que le token n'est pas rafraîchi. `router.refresh()` est
  // nécessaire en plus de `push()` : app/(app)/layout.tsx (server component,
  // lit `session.user.activeRole` pour la sidebar) est partagé entre toutes
  // les routes `(app)` et n'est PAS ré-exécuté par une simple navigation
  // client — sans refresh(), la sidebar affichait encore l'ancien rôle après
  // le switch alors que la page de destination, elle, était la bonne.
  async function handleDashboardClick(role: string, href: string) {
    setAccountOpen(false)
    if (role === user.activeRole) {
      router.push(href)
      return
    }
    setSwitchingRole(true)
    try {
      const res = await fetch('/api/account/active-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (res.ok) {
        await update({ activeRole: role })
        router.push(href)
        router.refresh()
      }
    } finally {
      setSwitchingRole(false)
    }
  }

  useEffect(() => {
    if (!accountOpen) return
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setAccountOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccountOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [accountOpen])

  const dashboards = (user.roles ?? [])
    .map((role) => (DASHBOARD_BY_ROLE[role] ? { role, ...DASHBOARD_BY_ROLE[role] } : null))
    .filter((d): d is { role: string; href: string; label: string } => d !== null)

  async function handleLogoutConfirm() {
    setLogoutConfirmOpen(false)
    await signOut({ callbackUrl: '/home' })
  }

  return (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
      <style>{`@media (max-width: 640px) { .lb-acct-name { display: none !important } }`}</style>

      <div style={{ position: 'relative' }}>
        <Button
          variant="ghost"
          onClick={() => {
            setAccountOpen((v) => {
              if (!v) setResolvedDirection(resolveMenuDirection())
              return !v
            })
          }}
          aria-label={user.name ? `Mon compte — ${user.name}` : 'Mon compte'}
          aria-expanded={accountOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: 'auto',
          height: 42,
          minWidth: 42,
          minHeight: 42,
          padding: '0 12px 0 4px',
          borderRadius: 999,
          border: '1px solid var(--border-strong)',
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
        >
          <Avatar src={user.image} name={user.name || user.email || '?'} size="sm" style={{ width: 34, height: 34 }} />
          {user.name && (
            <span className="lb-acct-name" style={{ fontSize: 'var(--font-size-callout)', fontWeight: 700, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name.split(' ')[0]}
            </span>
          )}
          <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7, transform: accountOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }} />
        </Button>

        {accountOpen && (
          <div
          style={{
            position: 'absolute',
            ...(resolvedDirection === 'up' ? { bottom: 'calc(100% + 10px)' } : { top: 'calc(100% + 10px)' }),
            ...(menuAlign === 'left' ? { left: 0 } : { right: 0 }),
            width: 208,
            maxWidth: 'calc(100vw - 24px)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: '0 20px 48px rgba(var(--black-rgb), .50)',
              overflow: 'hidden',
              zIndex: 60,
              padding: 6,
              transformOrigin: resolvedDirection === 'up'
                ? (menuAlign === 'left' ? 'bottom left' : 'bottom right')
                : (menuAlign === 'left' ? 'top left' : 'top right'),
            }}
          >
            {user.name && (
              <p style={{ margin: 0, padding: '8px 10px 6px', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </p>
            )}
            {!dashboardMode ? (
              <>
                <MenuLink href="/notifications" onClick={() => setAccountOpen(false)} icon={<Bell size={15} />} label="Notifications" badge={notifUnread} />
                <MenuLink href="/profile" onClick={() => setAccountOpen(false)} icon={<User size={15} />} label="Mon profil" />
                <MenuLink href="/profile/billets" onClick={() => setAccountOpen(false)} icon={<Ticket size={15} />} label="Mes billets" />
              </>
            ) : null}
            {dashboards.length > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />}
            {dashboards.map((d) => (
              <Button
                key={d.role}
                variant="ghost"
                disabled={switchingRole}
                onClick={() => handleDashboardClick(d.role, d.href)}
                aria-label={d.role === user.activeRole ? `${d.label} (actif)` : d.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontSize: 'var(--font-size-footnote-lg)',
                  fontWeight: 600,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                }}
              >
                <LayoutDashboard size={14} />
                <span style={{ flex: 1 }}>{d.label}</span>
                {d.role === user.activeRole && <Check size={13} color="var(--primary)" />}
              </Button>
            ))}
            {/* Point de sortie explicite vers le site public — la nav
                publique (Accueil/Événements/Prestataires/Organisateurs) est
                masquée dans le header une fois connecté (PublicNav.tsx),
                confirmé en réunion live le 11/08/2026. */}
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
            <MenuLink href="/events" onClick={() => setAccountOpen(false)} icon={<Globe size={15} />} label="Voir le site public" />
            <Button
              variant="ghost"
              onClick={() => {
                setAccountOpen(false)
                setLogoutConfirmOpen(true)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                color: 'var(--pink)',
                fontSize: 'var(--font-size-footnote-lg)',
                fontWeight: 700,
                justifyContent: 'flex-start',
                textAlign: 'left',
              }}
            >
              <LogOut size={14} /> Déconnexion
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Se déconnecter ?"
        body="Tu vas quitter ton espace actuel et revenir à l’accueil."
        confirmLabel="Déconnexion"
        confirmVariant="primary"
        zIndex={120}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => { void handleLogoutConfirm() }}
      />
    </div>
  )
}

function MenuLink({ href, onClick, icon, label, badge }: { href: string; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <Link
      href={href}
      onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 8,
          color: 'var(--text)',
          fontSize: 'var(--font-size-footnote-lg)',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
      {icon} {label}
      {!!badge && (
        <span
          style={{
            marginLeft: 'auto',
            minWidth: 18,
            height: 17,
            padding: '0 4px',
            borderRadius: 999,
            background: 'var(--pink)',
            color: 'var(--primary-ink)',
            fontSize: 'var(--font-size-caption-2)',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  )
}
