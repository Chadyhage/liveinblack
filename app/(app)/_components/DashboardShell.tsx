'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { COMMON_NAV, ROLE_NAV, CLIENT_UPSELL, HIDE_SIDEBAR_PREFIXES, type DashboardNavItem } from './dashboardNav'
import type { Role } from '@/lib/server/permissions'

const SIDEBAR_WIDTH = 240

const PENDING_APPLICATION_STATUSES = new Set(['submitted', 'under_review', 'resubmitted'])

// Compteurs "en attente" affichés sur les liens Dossiers/Signalements/
// Suppressions de la sidebar agent — vivaient auparavant dans la barre
// d'onglets interne d'AgentShell.tsx (#107), déplacés ici avec la nav
// elle-même (voir dashboardNav.ts, ROLE_NAV.agent). Clé = href exact du lien
// pour ne pas dépendre d'une correspondance texte fragile.
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
    '/agent?tab=dossiers': pendingDossiers,
    '/agent?tab=reports': openReports,
    '/agent?tab=deletions': pendingDeletions,
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
  const searchParams = useSearchParams()
  const badges = useAgentBadges(activeRole)

  if (HIDE_SIDEBAR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return <>{children}</>
  }

  const items: DashboardNavItem[] = [...ROLE_NAV[activeRole], ...COMMON_NAV]
  const upsell = activeRole === 'client' ? CLIENT_UPSELL : []

  // Plusieurs liens agent partagent le même pathname (/agent) et ne se
  // distinguent que par `?tab=` (voir dashboardNav.ts) — comparer seulement
  // le path marquerait TOUS ces liens actifs en même temps. On compare aussi
  // le paramètre `tab` quand le lien en porte un ; absence des deux côtés
  // (ex. "Tableau de bord" = /agent sans query) compte comme un match.
  function isActive(href: string) {
    const [path, queryStr] = href.split('?')
    const pathMatches = pathname === path || (path !== '/profile' && pathname.startsWith(path + '/'))
    if (!pathMatches) return false
    const hrefTab = queryStr ? new URLSearchParams(queryStr).get('tab') : null
    return hrefTab === searchParams.get('tab')
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
          background: 'rgba(53,0,71,.92)',
        }}
      >
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '20px 12px' }}>
          {items.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(item.href)} badge={badges[item.href]} />
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

      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>

      <style>{`
        @media (max-width: 1099px) {
          .lb-dashboard-sidebar { display: none; }
        }
      `}</style>
    </div>
  )
}

function SidebarLink({ item, active, muted, badge }: { item: DashboardNavItem; active: boolean; muted?: boolean; badge?: number }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-label={badge ? `${item.label}, ${badge} en attente` : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 8,
        color: active ? 'var(--text)' : muted ? 'var(--text-faint)' : 'var(--text-muted)',
        background: active ? 'rgba(255,229,0,.10)' : 'transparent',
        borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
        fontSize: 13.5,
        fontWeight: active ? 700 : 600,
        textDecoration: 'none',
      }}
    >
      <Icon size={17} strokeWidth={active ? 2.2 : 1.8} color={active ? 'var(--primary)' : 'currentColor'} />
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
