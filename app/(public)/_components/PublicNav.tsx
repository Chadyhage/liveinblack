'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import AccountMenu from './AccountMenu'
import { IconButton } from '@/app/components/ui'
import { Menu, X } from 'lucide-react'

const NAV_LINKS = [
  { href: '/home', label: 'Accueil' },
  { href: '/events', label: 'Événements' },
  { href: '/providers', label: 'Prestataires' },
  { href: '/organizers', label: 'Organisateurs' },
  { href: '/about', label: "C'est quoi" },
  { href: '/events#access-code', label: "J'ai un code" },
  { href: '/search', label: 'Recherche' },
]

export interface DashboardNavLink {
  label: string
  href: string
}

function isCurrentPath(pathname: string, href: string) {
  const path = href.split('#')[0].split('?')[0]
  if (path === '/home') return pathname === '/home' || pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

// Nav partagée par TOUTES les pages (publiques ET authentifiées, via
// app/(app)/layout.tsx qui passe `dashboardLinks`). Backdrop-blur toléré par
// le design system (CLAUDE.md) même si le contenu, lui, reste opaque.
//
// Sous 720px, `.lb-navlink` passe en `display:none` sans aucun remplacement
// auparavant — impossible de naviguer vers Prestataires/Organisateurs/C'est
// quoi/Recherche depuis un mobile. Le bouton hamburger + tiroir ci-dessous
// reprend exactement les mêmes liens pour ce cas.
//
// `dashboardLinks` (sidebar du rôle actif, voir DashboardShell.tsx) est
// injecté dans CE MÊME tiroir plutôt que d'avoir un second hamburger séparé
// pour la sidebar : deux boutons "menu" empilés sur mobile (un pour les
// liens publics, un pour le dashboard) était confus — un seul point d'entrée,
// comme sur Facebook mobile.
export default function PublicNav({ dashboardLinks }: { dashboardLinks?: DashboardNavLink[] } = {}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const onLoginPage = pathname === '/login'
  const { data: session, status } = useSession()

  useEffect(() => {
    if (!mobileOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  // Au-delà de 1100px le bouton hamburger disparaît (cf. règle CSS
  // .lb-navlink-mobile plus bas) : sans ce listener, un tiroir resté ouvert
  // avant un agrandissement de fenêtre (resize ou rotation d'écran) restait
  // affiché sans aucun moyen de le fermer.
  useEffect(() => {
    if (!mobileOpen) return
    const mq = window.matchMedia('(min-width: 1100px)')
    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) setMobileOpen(false)
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [mobileOpen])

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 22px',
        background: 'rgba(7,8,13,0.86)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,229,0,.16)',
      }}
    >
      <Link
        href="/home"
        style={{
          fontSize: 17,
          letterSpacing: '0.12em',
          color: 'var(--text)',
          textDecoration: 'none',
          fontWeight: 800,
        }}
      >
        L<span style={{ color: 'var(--text)' }}>|</span>VE IN{' '}
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 700 }}>BLACK</span>
      </Link>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        {NAV_LINKS.map((link) => {
          const active = isCurrentPath(pathname, link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`lb-navlink${active ? ' lb-navlink-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              style={{ position: 'relative', color: active ? 'var(--primary)' : 'var(--text-muted)', textDecoration: 'none', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.055em', padding: '8px 0' }}
            >
              {link.label}
            </Link>
          )
        })}
        {status === 'authenticated' && session?.user && <AccountMenu user={session.user} />}
        {status === 'unauthenticated' && !onLoginPage && (
          <>
            <Link
              href="/login"
              className="lb-navlink"
              style={{
                padding: '9px 18px',
                borderRadius: 999,
                background: 'var(--gold)',
                color: '#171500',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Connexion
            </Link>
            <Link
              href="/login?mode=register"
              className="lb-navlink"
              style={{
                padding: '9px 18px',
                borderRadius: 999,
                border: '1px solid rgba(255,229,0,.55)',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Créer un compte
            </Link>
            <Link
              href="/login"
              className="lb-navlink-mobile"
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                background: 'var(--teal-solid)',
                color: '#04120e',
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Connexion
            </Link>
          </>
        )}
        <span className="lb-navlink-mobile lb-burger">
          <IconButton
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="lb-mobile-menu"
            label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            icon={mobileOpen ? <X size={18} strokeWidth={2} aria-hidden="true" /> : <Menu size={18} strokeWidth={2} aria-hidden="true" />}
            style={{ background: 'var(--surface)', color: 'var(--text)' }}
          />
        </span>
      </nav>

      {mobileOpen && (
        <nav
          id="lb-mobile-menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--border)',
            boxShadow: '0 16px 32px rgba(0,0,0,0.4)',
          }}
        >
          {dashboardLinks && dashboardLinks.length > 0 && (
            <>
              <p style={{ padding: '12px 22px 6px', margin: 0, fontSize: 11, fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Mon espace
              </p>
              {dashboardLinks.map((link) => {
                const active = isCurrentPath(pathname, link.href)
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      padding: '14px 22px',
                      color: active ? 'var(--primary)' : 'var(--text)',
                      background: active ? 'rgba(255,229,0,.08)' : 'transparent',
                      textDecoration: 'none',
                      fontSize: 14.5,
                      fontWeight: active ? 800 : 600,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {link.label}
                  </Link>
                )
              })}
              <p style={{ padding: '12px 22px 6px', margin: 0, fontSize: 11, fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Site
              </p>
            </>
          )}
          {NAV_LINKS.map((link) => {
            const active = isCurrentPath(pathname, link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? 'page' : undefined}
                style={{
                  padding: '14px 22px',
                  color: active ? 'var(--primary)' : 'var(--text)',
                  background: active ? 'rgba(255,229,0,.08)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 14.5,
                  fontWeight: active ? 800 : 600,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      )}

      <style>{`
        .lb-navlink { display: none }
        .lb-navlink-mobile { display: inline-flex }
        @media (min-width: 1100px) {
          .lb-navlink { display: inline-block }
          .lb-navlink-mobile { display: none !important }
        }
        @media (min-width: 1100px) {
          .lb-navlink-active::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            bottom: -15px;
            height: 3px;
            border-radius: 999px;
            background: var(--primary);
          }
        }
      `}</style>
    </header>
  )
}
