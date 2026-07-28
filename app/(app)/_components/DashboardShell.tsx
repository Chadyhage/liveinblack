'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { COMMON_NAV, ROLE_NAV, CLIENT_UPSELL, HIDE_SIDEBAR_PREFIXES, FULL_BLEED_PREFIXES, type DashboardNavItem } from './dashboardNav'
import { getRoleLabel, type Role } from '@/lib/server/permissions'

const SIDEBAR_WIDTH = 240

const PENDING_APPLICATION_STATUSES = new Set(['submitted', 'under_review', 'resubmitted'])

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
  const badges = useAgentBadges(activeRole)

  if (HIDE_SIDEBAR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return <>{children}</>
  }

  const fullBleed = FULL_BLEED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))

  const items: DashboardNavItem[] = [...ROLE_NAV[activeRole], ...COMMON_NAV]
  const upsell = activeRole === 'client' ? CLIENT_UPSELL : []

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
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <aside
        className="lb-dashboard-sidebar"
        style={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          position: 'sticky',
          top: 61,
          height: 'calc(100vh - 61px)',
          overflowY: 'auto',
          borderRight: '1px solid rgba(255,229,0,.14)',
          background: 'var(--surface-2)',
        }}
      >
        <div
          style={{
            padding: '18px 16px 14px',
            borderBottom: '1px solid rgba(255,229,0,.14)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: 0.2 }}>
            {activeRole === 'agent' ? 'Administration' : getRoleLabel(activeRole)}
          </span>
          {activeRole === 'agent' && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1.4,
                color: 'var(--gold)',
                background: 'rgba(200,169,110,.14)',
                border: '1px solid rgba(200,169,110,.3)',
                borderRadius: 999,
                padding: '1px 8px',
              }}
            >
              Agent
            </span>
          )}
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 12px' }}>
          {items.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              isActive={isActive}
              autoOpen={hasActiveDescendant(item)}
              badge={badges[item.href]}
            />
          ))}
          {upsell.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '10px 4px' }} />
              {upsell.map((item) => (
                <SidebarLink key={item.href} item={item} active={isActive(item.href)} muted />
              ))}
            </>
          )}
        </nav>
      </aside>

      <div style={{ flex: 1, minWidth: 0, ...(fullBleed ? {} : { padding: '28px 32px' }) }}>{children}</div>

      <style>{`
        @media (max-width: 1099px) {
          .lb-dashboard-sidebar { display: none; }
        }
      `}</style>
    </div>
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

  useEffect(() => {
    if (autoOpen) setOpen(true)
  }, [autoOpen])

  if (!item.children || item.children.length === 0) {
    return <SidebarLink item={item} active={isActive(item.href)} badge={badge} />
  }

  const Icon = item.icon
  const active = isActive(item.href)

  return (
    <div>
      <Link
        href={item.href}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 8,
          color: active ? 'var(--text)' : 'var(--text-muted)',
          background: active ? 'rgba(255,229,0,.10)' : 'transparent',
          borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
          fontSize: 13.5,
          fontWeight: active ? 700 : 600,
          textDecoration: 'none',
        }}
      >
        <Icon size={17} strokeWidth={active ? 2.2 : 1.8} color={active ? 'var(--primary)' : 'currentColor'} />
        <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
        <span
          role="button"
          tabIndex={0}
          aria-label={open ? 'Replier' : 'Déplier'}
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              setOpen((v) => !v)
            }
          }}
          style={{ display: 'flex', padding: 3, borderRadius: 6, flexShrink: 0 }}
        >
          <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
        </span>
      </Link>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, paddingLeft: 14 }}>
          {item.children.map((child) => (
            <SidebarLink key={child.href} item={child} active={isActive(child.href)} compact />
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarLink({ item, active, muted, badge, compact }: { item: DashboardNavItem; active: boolean; muted?: boolean; badge?: number; compact?: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-label={badge ? `${item.label}, ${badge} en attente` : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: compact ? '8px 12px' : '10px 12px',
        borderRadius: 8,
        color: active ? 'var(--text)' : muted ? 'var(--text-faint)' : 'var(--text-muted)',
        background: active ? 'rgba(255,229,0,.10)' : 'transparent',
        borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
        fontSize: compact ? 12.5 : 13.5,
        fontWeight: active ? 700 : 600,
        textDecoration: 'none',
      }}
    >
      <Icon size={compact ? 15 : 17} strokeWidth={active ? 2.2 : 1.8} color={active ? 'var(--primary)' : 'currentColor'} />
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
            padding: '1px 7px',
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}
