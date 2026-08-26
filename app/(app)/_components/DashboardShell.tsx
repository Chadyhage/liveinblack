'use client'

import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ChevronDown, Globe, Menu, X } from 'lucide-react'
import { Button, IconButton } from '@/app/components/ui'
import AccountMenu from '@/app/(public)/_components/AccountMenu'
import AgentWorkspaceShell from './AgentWorkspaceShell'
import { COMMON_NAV, ROLE_NAV, CLIENT_UPSELL, HIDE_SIDEBAR_PREFIXES, FULL_BLEED_PREFIXES, type DashboardNavItem } from './dashboardNav'
import { getRoleLabel, type Role } from '@/lib/server/permissions'
import styles from './DashboardShell.module.css'

const PENDING_APPLICATION_STATUSES = new Set(['submitted', 'under_review', 'resubmitted'])

const ROLE_BACKGROUNDS: Record<Exclude<Role, 'agent'>, string> = {
  client: '/images/live-in-black/auth-community.jpg',
  organisateur: '/images/live-in-black/auth-organizer.jpg',
  prestataire: '/images/live-in-black/auth-provider.jpg',
}

// Compteurs "en attente" affichés sur les liens Dossiers/Signalements/
// Suppressions de la sidebar agent — vivaient auparavant dans la barre
// d'onglets interne d'AgentShell.tsx (#107), déplacés ici avec la nav
// elle-même (voir dashboardNav.ts, ROLE_NAV.agent). Clé = href réel exact
// du lien (/agent/dossiers, etc.) pour ne pas dépendre d'une correspondance
// texte fragile.
function useAgentBadges(activeRole: Role): Partial<Record<string, number>> {
  const [pendingDossiers, setPendingDossiers] = useState(0)
  const [openReports, setOpenReports] = useState(0)
  const [pendingDeletions, setPendingDeletions] = useState(0)

  useEffect(() => {
    if (activeRole !== 'agent') return
    let cancelled = false
    async function run() {
      try {
        const res = await fetch('/api/agent/applications')
        const data = await res.json()
        if (!cancelled && res.ok && data.ok) {
          const count = (data.applications as { status: string }[]).filter((a) => PENDING_APPLICATION_STATUSES.has(a.status)).length
          setPendingDossiers(count)
        }
      } catch {
        // Badge non-critique — un échec silencieux laisse juste le compteur à
        // 0, le panneau Dossiers lui-même affiche son propre bandeau d'erreur.
      }
    }
    run()
    // Même intervalle que le heartbeat de présence de MessagesClient.tsx —
    // sans ça, une action de modération faite dans le panneau Dossiers ne se
    // reflète jamais sur ce badge tant que la sidebar reste montée.
    const interval = setInterval(run, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeRole])

  useEffect(() => {
    if (activeRole !== 'agent') return
    let cancelled = false
    async function run() {
      try {
        const res = await fetch('/api/agent/reports?status=open')
        const data = await res.json()
        if (!cancelled && res.ok && data.ok) {
          setOpenReports((data.reports as unknown[]).length)
        }
      } catch {
        // idem
      }
    }
    run()
    const interval = setInterval(run, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeRole])

  useEffect(() => {
    if (activeRole !== 'agent') return
    let cancelled = false
    async function run() {
      try {
        const res = await fetch('/api/agent/deletion-requests')
        const data = await res.json()
        if (!cancelled && res.ok && data.ok) {
          setPendingDeletions((data.requests as unknown[]).length)
        }
      } catch {
        // idem
      }
    }
    run()
    const interval = setInterval(run, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeRole])

  if (activeRole !== 'agent') return {}
  return {
    '/agent/dossiers': pendingDossiers,
    '/agent/signalements': openReports,
    '/agent/suppressions': pendingDeletions,
  }
}

// Badge non-lu sur l'item "Notifications" de la sidebar — remplace le
// compteur qui vivait sur la cloche d'AccountMenu.tsx (header). Role-
// agnostique (contrairement à useAgentBadges) : tous les rôles ont des
// notifications. Même cadence de poll (30s) que l'ancien poll de la cloche.
function useNotificationBadge(): number {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/notifications')
        const data = await res.json()
        if (!cancelled && res.ok && data.ok) setUnread(data.unreadCount)
      } catch {
        // Badge non-critique — reste à sa dernière valeur connue en cas d'échec.
      }
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return unread
}

// "Mes soirées (équipe)" n'a de contenu que pour les comptes ajoutés à une
// équipe d'événement (serveur/porte/DJ/vendeur) — un lien affiché à tout le
// monde alors qu'il est vide pour la quasi-totalité des utilisateurs. Masqué
// par défaut (évite le clic-vers-écran-vide relevé par le client) tant que
// l'appel n'a pas confirmé au moins une soirée.
function useHasStaffedEvents(): boolean {
  const [has, setHas] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const res = await fetch('/api/my-staffed-events')
        const data = await res.json()
        if (!cancelled && res.ok && data.ok) setHas((data.events as unknown[]).length > 0)
      } catch {
        // Non-critique — reste masqué en cas d'échec réseau.
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  return has
}

// Sidebar façon "espace privé" (organisateur/prestataire/agent/client) —
// n'existait pas jusqu'ici : chaque page de app/(app)/ était un écran
// autonome sans navigation entre modules. Fixe à gauche sur desktop
// (CSS-masquée sous 1100px, même seuil que le hamburger de PublicNav.tsx).
// Sous 1100px, ces mêmes liens sont accessibles via LE MÊME tiroir mobile que
// PublicNav (dashboardLinks passé depuis app/(app)/layout.tsx) plutôt qu'un
// second hamburger dédié ici — deux boutons "menu" empilés sur mobile étaient
// confus, un seul point d'entrée comme sur Facebook mobile. Masquée par
// app/(app)/layout.tsx sur les routes immersives (voir HIDE_SIDEBAR_PREFIXES
// dans dashboardNav.ts) : cette valeur n'a pas besoin d'être revérifiée ici,
// le layout ne monte simplement pas ce composant sur ces routes-là.
export default function DashboardShell({ activeRole, children }: { activeRole: Role; children: React.ReactNode }) {
  const pathname = usePathname()
  const agentBadges = useAgentBadges(activeRole)
  const notificationUnread = useNotificationBadge()
  const badges = { ...agentBadges, '/notifications': notificationUnread || undefined }
  const hasStaffedEvents = useHasStaffedEvents()
  const { data: session, status } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileDrawerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => mobileDrawerRef.current?.querySelector<HTMLElement>('a[href],button:not([disabled])')?.focus())
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileOpen(false)
        requestAnimationFrame(() => mobileMenuButtonRef.current?.focus())
        return
      }
      if (event.key !== 'Tab' || !mobileDrawerRef.current) return
      const controls = Array.from(mobileDrawerRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'))
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileOpen])

  // La sidebar desktop se masque entièrement sous 1100px (.lb-dashboard-sidebar,
  // voir plus bas) — avant, PublicNav.tsx fournissait un tiroir mobile de
  // secours pour ces mêmes liens. Retirer PublicNav du dashboard (demande
  // client 2026-08-11) sans rien remettre à sa place aurait donc privé tout
  // utilisateur mobile/tablette de navigation ET d'accès au compte — cette
  // barre + ce tiroir sont l'équivalent mobile de la sidebar ci-dessous.
  // Fermé au clic sur un lien du tiroir (closeMobile ci-dessous), jamais via
  // un effet sur pathname (setState synchrone en effet = cascading-render).
  function closeMobile() {
    setMobileOpen(false)
    requestAnimationFrame(() => mobileMenuButtonRef.current?.focus())
  }

  if (HIDE_SIDEBAR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return <div className={styles.root}>{children}</div>
  }

  if (activeRole === 'agent') {
    return <AgentWorkspaceShell badges={badges}>{children}</AgentWorkspaceShell>
  }

  const dashboardStyle = {
    '--dashboard-background-image': `url('${ROLE_BACKGROUNDS[activeRole]}')`,
  } as CSSProperties

  const fullBleed = FULL_BLEED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))

  const roleItems: DashboardNavItem[] = ROLE_NAV[activeRole].filter(
    (item) => item.href !== '/my-shifts' || hasStaffedEvents || pathname.startsWith('/my-shifts')
  )
  const commonItems: DashboardNavItem[] = COMMON_NAV.filter(
    (item) => item.href !== '/my-shifts' || hasStaffedEvents || pathname.startsWith('/my-shifts')
  )
  const upsell = activeRole === 'client' ? CLIENT_UPSELL : []
  const personalItems = commonItems.filter((item) => ['/profile', '/profile/billets', '/profile/interested-events', '/my-shifts'].includes(item.href))
  const communicationItems = commonItems.filter((item) => item.href === '/messages')
  const accountItems = commonItems.filter((item) => ['/notifications', '/profile/parametres', '/help'].includes(item.href))
  const memberGroups = [
    { label: 'Mon activité', items: roleItems },
    { label: activeRole === 'client' ? 'Mon espace' : 'Personnel', items: personalItems },
    { label: 'Communication', items: communicationItems },
    { label: 'Compte et assistance', items: accountItems },
  ]
  const navGroups = memberGroups.filter((group) => group.items.length > 0)

  // Comparaison de path simple : "/profile" et "/agent" sont des racines
  // partagées par plusieurs sous-routes réelles (/profile/billets,
  // /agent/comptes, etc.) — les exclure du match par préfixe pour qu'elles
  // ne restent pas actives en même temps qu'une sous-route.
  function isActive(href: string) {
    const [path] = href.split('?')
    return pathname === path || (path !== '/profile' && path !== '/agent' && pathname.startsWith(path + '/'))
  }

  function hasActiveDescendant(item: DashboardNavItem): boolean {
    return !!item.children?.some((c) => isActive(c.href) || hasActiveDescendant(c))
  }

  return (
    <div className={styles.root} style={dashboardStyle}>
      <div className={styles.mobileBar}>
        <IconButton
          ref={mobileMenuButtonRef}
          label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="dashboard-mobile-navigation"
          icon={mobileOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          style={{ border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: 'rgba(255,255,255,.08)', color: '#f5f5f7' }}
        />
      </div>

      {mobileOpen && (
        <>
          <Button variant="ghost" className={styles.drawerBackdrop} onClick={closeMobile} aria-label="Fermer le menu" />
          <nav ref={mobileDrawerRef} id="dashboard-mobile-navigation" className={styles.mobileDrawer} aria-label="Navigation de l’espace privé" onClick={closeMobile}>
            {status === 'authenticated' && session?.user ? <div className={styles.mobileAccount}><AccountMenu user={session.user} menuAlign="left" dashboardMode /></div> : null}
            <SidebarNavigation groups={navGroups} upsell={upsell} isActive={isActive} hasActiveDescendant={hasActiveDescendant} badges={badges} mobile onNavigate={closeMobile} />
            <Link href="/home" className={styles.publicLink}><Globe size={18} aria-hidden="true" /><span>Voir le site public</span></Link>
          </nav>
        </>
      )}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <Link href="/profile" className={styles.brand} aria-label="LIVEINBLACK — vue d’ensemble">
              <span className={styles.brandName}>LIVE<span>IN</span>BLACK</span>
            </Link>
            <p className={styles.workspace}>{`Espace ${getRoleLabel(activeRole)}`}</p>
            <div className={styles.account}>
              {status === 'authenticated' && session?.user ? <AccountMenu user={session.user} menuAlign="left" menuDirection="auto" dashboardMode /> : null}
            </div>
          </div>
          <nav className={styles.nav} aria-label="Navigation de l’espace privé">
            <SidebarNavigation groups={navGroups} upsell={upsell} isActive={isActive} hasActiveDescendant={hasActiveDescendant} badges={badges} />
          </nav>
          <div className={styles.footer}>
            <Link href="/home" className={styles.publicLink}><Globe size={18} aria-hidden="true" /><span>Voir le site public</span></Link>
          </div>
        </aside>

        <div className={`lb-dashboard-main ${styles.main}${fullBleed ? ` ${styles.mainFull}` : ''}`}>{children}</div>
      </div>
    </div>
  )
}

function SidebarNavigation({ groups, upsell, isActive, hasActiveDescendant, badges, mobile = false, onNavigate }: { groups: Array<{ label: string; items: DashboardNavItem[] }>; upsell: DashboardNavItem[]; isActive: (href: string) => boolean; hasActiveDescendant: (item: DashboardNavItem) => boolean; badges: Partial<Record<string, number>>; mobile?: boolean; onNavigate?: () => void }) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.label} className={styles.section} aria-label={group.label}>
          <p className={styles.sectionLabel}>{group.label}</p>
          <div className={styles.navList}>
            {group.items.map((item) => {
              const autoOpen = isActive(item.href) || hasActiveDescendant(item)
              if (mobile && item.children?.length) {
                return (
                  <div key={item.href}>
                    <SidebarLink item={item} active={isActive(item.href)} badge={badges[item.href]} onClick={onNavigate} />
                    <div style={{ paddingLeft: 12 }}>{item.children.map((child) => <SidebarLink key={child.href} item={child} active={isActive(child.href)} compact onClick={onNavigate} />)}</div>
                  </div>
                )
              }
              return <SidebarItem key={`${item.href}:${autoOpen}`} item={item} isActive={isActive} autoOpen={autoOpen} badge={badges[item.href]} />
            })}
          </div>
        </section>
      ))}
      {upsell.length > 0 ? (
        <section className={styles.section} aria-label="Développer votre activité">
          <p className={styles.sectionLabel}>Développer votre activité</p>
          <div className={styles.navList}>{upsell.map((item) => <SidebarLink key={item.href} item={item} active={isActive(item.href)} muted onClick={onNavigate} />)}</div>
        </section>
      ) : null}
    </>
  )
}

// Item de sidebar avec sous-menu expansible (ex. "Mon profil" → Mes
// billets/Paramètres/Support/Événements intéressés/Organisateurs suivis,
// voir dashboardNav.ts, COMMON_NAV). Ouvert par défaut si un enfant est actif
// (`autoOpen`), sinon replié — état local, pas persisté entre navigations.
function SidebarItem({
  item,
  isActive,
  autoOpen,
  badge,
}: {
  item: DashboardNavItem
  isActive: (href: string) => boolean
  autoOpen: boolean
  badge?: number
}) {
  const [open, setOpen] = useState(autoOpen)
  const expanded = open

  if (!item.children || item.children.length === 0) {
    return <SidebarLink item={item} active={isActive(item.href)} badge={badge} />
  }

  const Icon = item.icon
  const active = isActive(item.href)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderRadius: 13,
          background: active ? 'rgba(184, 243, 74,.13)' : 'transparent',
          border: active ? '1px solid rgba(184,243,74,.22)' : '1px solid transparent',
        }}
      >
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          style={{
            display: 'flex',
            flex: 1,
            minWidth: 0,
            alignItems: 'center',
            gap: 9,
            minHeight: 38,
            padding: '8px 7px 8px 10px',
            color: active ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 14.5,
            fontWeight: active ? 700 : 600,
            textDecoration: 'none',
          }}
        >
          <Icon size={17} strokeWidth={active ? 2.2 : 1.8} color={active ? 'var(--primary)' : 'currentColor'} />
          <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
        </Link>
        <IconButton
          label={expanded ? `Replier ${item.label}` : `Déplier ${item.label}`}
          aria-expanded={expanded}
          onClick={() => setOpen((value) => !value)}
          size={28}
          icon={<ChevronDown aria-hidden="true" size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />}
          style={{ marginRight: 4, border: 0, background: 'transparent', color: 'inherit' }}
        />
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, paddingLeft: 12 }}>
          {item.children.map((child) => (
            <SidebarLink key={child.href} item={child} active={isActive(child.href)} compact />
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarLink({ item, active, muted, badge, compact, onClick }: { item: DashboardNavItem; active: boolean; muted?: boolean; badge?: number; compact?: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={badge ? `${item.label}, ${badge} en attente` : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        minHeight: compact ? 42 : 46,
        padding: compact ? '8px 11px' : '10px 12px',
        borderRadius: 13,
        color: active ? 'var(--text)' : muted ? 'var(--text-faint)' : 'var(--text-muted)',
        background: active ? 'rgba(184, 243, 74,.13)' : 'transparent',
        border: active ? '1px solid rgba(184,243,74,.22)' : '1px solid transparent',
        fontSize: compact ? 13 : 14,
        fontWeight: active ? 700 : 600,
        textDecoration: 'none',
      }}
    >
      <Icon size={compact ? 14 : 16} strokeWidth={active ? 2.2 : 1.8} color={active ? 'var(--primary)' : 'currentColor'} />
      <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
      {!!badge && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1.4,
            color: '#fff',
            background: 'rgba(224,90,170,0.85)',
            borderRadius: 999,
            padding: '1px 6px',
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}
