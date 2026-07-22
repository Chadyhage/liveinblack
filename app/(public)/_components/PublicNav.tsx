'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/home', label: 'Accueil' },
  { href: '/events', label: 'Événements' },
  { href: '/providers', label: 'Prestataires' },
  { href: '/organizers', label: 'Organisateurs' },
  { href: '/about', label: "C'est quoi" },
  { href: '/events#access-code', label: "J'ai un code" },
  { href: '/search', label: 'Recherche' },
]

// Nav publique partagée par toutes les pages non-authentifiées. Backdrop-blur
// toléré par le design system (CLAUDE.md) même si le contenu, lui, reste opaque.
//
// Sous 720px, `.lb-navlink` passe en `display:none` sans aucun remplacement
// auparavant — impossible de naviguer vers Prestataires/Organisateurs/C'est
// quoi/Recherche depuis un mobile. Le bouton hamburger + tiroir ci-dessous
// reprend exactement les mêmes liens pour ce cas.
export default function PublicNav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const onLoginPage = pathname === '/login'

  useEffect(() => {
    if (!mobileOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
        padding: '16px 22px',
        background: 'rgba(4,4,11,0.72)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <Link
        href="/home"
        style={{
          fontSize: 18,
          letterSpacing: '0.08em',
          color: 'var(--text)',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        L<span style={{ color: 'var(--text)' }}>|</span>VE IN{' '}
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 700 }}>BLACK</span>
      </Link>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="lb-navlink"
            style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}
          >
            {link.label}
          </Link>
        ))}
        {!onLoginPage && (
          <>
            <Link
              href="/login"
              className="lb-navlink"
              style={{
                padding: '9px 18px',
                borderRadius: 999,
                background: 'var(--teal-solid)',
                color: '#04120e',
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
                border: '1px solid var(--border-strong)',
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
        <button
          type="button"
          className="lb-navlink-mobile lb-burger"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="lb-mobile-menu"
          aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {mobileOpen ? (
              <>
                <line x1="5" y1="5" x2="19" y2="19" />
                <line x1="19" y1="5" x2="5" y2="19" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>
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
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              style={{
                padding: '14px 22px',
                color: 'var(--text)',
                textDecoration: 'none',
                fontSize: 14.5,
                fontWeight: 600,
                borderBottom: '1px solid var(--border)',
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}

      <style>{`
        .lb-navlink { display: none }
        .lb-navlink-mobile { display: inline-flex }
        @media (min-width: 1100px) {
          .lb-navlink { display: inline-block }
          .lb-navlink-mobile { display: none !important }
        }
      `}</style>
    </header>
  )
}
