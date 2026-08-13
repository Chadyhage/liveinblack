'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import AccountMenu from './AccountMenu'
import { Button, IconButton, Input } from '@/app/components/ui'
import { LogIn, Menu, Search, UserPlus, X } from 'lucide-react'

const NAV_LINKS = [
  { href: '/home', label: 'Accueil' },
  { href: '/events', label: 'Événements' },
  { href: '/providers', label: 'Prestataires' },
  { href: '/organizers', label: 'Organisateurs' },
]

interface QuickSearchEvent { id: string; name: string; dateDisplay: string | null; city: string | null; imageUrl: string | null }
interface QuickSearchOrganizer { userId: string; slug: string; publicName: string; city: string | null; avatarUrl: string | null }
interface QuickSearchProvider { userId: string; name: string; city: string | null; avatarUrl: string | null }
interface QuickSearchResults { events: QuickSearchEvent[]; providers: QuickSearchProvider[]; organizers: QuickSearchOrganizer[] }

const EMPTY_RESULTS: QuickSearchResults = { events: [], providers: [], organizers: [] }

// Recherche globale (événements + organisateurs + prestataires) directement
// dans le header — champ toujours visible (plus une icône à cliquer d'abord :
// un aller-retour en plus pour une action aussi fréquente). Interroge
// GET /api/search/quick (top 3/catégorie) et affiche un panneau de
// suggestions en direct sous le champ à chaque frappe. Il n'existe plus de
// page /search dédiée : ce champ + son panneau EST la recherche globale,
// aucune redirection vers une page de résultats complets.
//
// Pas de catégorie « Utilisateurs » : la seule recherche d'utilisateurs de
// l'app (lib/server/friends.ts:searchUsers) exige une session et sert à
// retrouver un contact de messagerie, ce n'est pas un répertoire public — ne
// pas la détourner ici exposerait des comptes hors de ce cadre.
function HeaderSearch() {
  const [value, setValue] = useState('')
  const [results, setResults] = useState<QuickSearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Convention useEffect + fetch du projet (CLAUDE.md) : logique de fetch
  // inline dans une fonction async locale, flag `cancelled` pour éviter une
  // mise à jour d'état après démontage/frappe suivante. Debounce 280ms pour
  // ne pas interroger la base à chaque touche.
  useEffect(() => {
    const query = value.trim()
    if (!query) return
    let cancelled = false
    const timer = setTimeout(() => {
      async function run() {
        try {
          const res = await fetch(`/api/search/quick?q=${encodeURIComponent(query)}`)
          const data = await res.json()
          if (cancelled) return
          if (data?.ok) setResults({ events: data.events || [], providers: data.providers || [], organizers: data.organizers || [] })
        } catch {
          if (!cancelled) setResults(EMPTY_RESULTS)
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
      run()
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value])

  useEffect(() => {
    if (!dropdownOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  const hasResults = results.events.length > 0 || results.providers.length > 0 || results.organizers.length > 0
  const showDropdown = dropdownOpen && value.trim().length > 0

  return (
    <div ref={rootRef} className="lb-header-search" style={{ position: 'relative' }}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          setDropdownOpen(true)
        }}
        className="lb-header-search__form"
      >
        <Input
          className="lb-header-search__input"
          type="search"
          value={value}
          onChange={(e) => {
            const nextValue = e.target.value
            setValue(nextValue)
            setResults(EMPTY_RESULTS)
            setLoading(Boolean(nextValue.trim()))
            setDropdownOpen(true)
          }}
          onFocus={() => setDropdownOpen(true)}
          placeholder="Rechercher…"
          aria-label="Recherche globale (événements, organisateurs, prestataires)"
          containerStyle={{ flex: 1, minWidth: 0 }}
          style={{
            width: 188,
            minHeight: 44,
            padding: '0 8px 0 15px',
            border: 0,
            background: 'transparent',
            color: '#f5f5f7',
            fontSize: 14,
            fontFamily: 'inherit',
            boxShadow: 'none',
          }}
        />
        <Button
          type="submit"
          variant="ghost"
          className="lb-header-search__button"
          aria-label="Lancer la recherche"
        >
          <Search size={18} strokeWidth={2} aria-hidden="true" />
        </Button>
      </form>

      {showDropdown && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 340,
            maxWidth: '90vw',
            maxHeight: 420,
            overflowY: 'auto',
            background: 'rgba(24,24,27,.96)',
            backdropFilter: 'blur(24px) saturate(160%)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 18,
            boxShadow: '0 24px 64px rgba(0,0,0,.42)',
            zIndex: 60,
          }}
        >
          {loading && !hasResults && (
            <p style={{ padding: 16, margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>Recherche…</p>
          )}
          {!loading && !hasResults && (
            <p style={{ padding: 16, margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>Aucun résultat pour « {value.trim()} ».</p>
          )}

          {results.events.length > 0 && (
            <QuickResultGroup title="Événements">
              {results.events.map((e) => (
                <Link
                  key={e.id}
                  href={`/events/${e.id}`}
                  onClick={() => { setDropdownOpen(false); setValue('') }}
                  className="lb-menu-row"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', textDecoration: 'none', color: 'inherit' }}
                >
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-faint)' }}>{[e.dateDisplay, e.city].filter(Boolean).join(' · ')}</span>
                  </span>
                </Link>
              ))}
            </QuickResultGroup>
          )}

          {results.organizers.length > 0 && (
            <QuickResultGroup title="Organisateurs">
              {results.organizers.map((o) => (
                <Link
                  key={o.userId}
                  href={`/organizers/${o.slug}`}
                  onClick={() => { setDropdownOpen(false); setValue('') }}
                  className="lb-menu-row"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', textDecoration: 'none', color: 'inherit' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{o.publicName}</span>
                  {o.city && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{o.city}</span>}
                </Link>
              ))}
            </QuickResultGroup>
          )}

          {results.providers.length > 0 && (
            <QuickResultGroup title="Prestataires">
              {results.providers.map((p) => (
                <Link
                  key={p.userId}
                  href={`/providers/${encodeURIComponent(p.userId)}`}
                  onClick={() => { setDropdownOpen(false); setValue('') }}
                  className="lb-menu-row"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', textDecoration: 'none', color: 'inherit' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                  {p.city && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{p.city}</span>}
                </Link>
              ))}
            </QuickResultGroup>
          )}
        </div>
      )}
    </div>
  )
}

function QuickResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ padding: '10px 14px 4px', margin: 0, fontSize: 10.5, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</p>
      {children}
    </div>
  )
}

export interface DashboardNavLink {
  label: string
  href: string
}

function isCurrentPath(pathname: string, href: string) {
  // Un lien d'action avec ancre (ex. « J'ai un code ») ne représente pas une
  // page. Le considérer actif sur /events activait deux entrées à la fois.
  if (href.includes('#')) return false
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
const PRIMARY_HREFS = ['/home', '/events', '/providers', '/organizers']

export default function PublicNav({ dashboardLinks }: { dashboardLinks?: DashboardNavLink[] } = {}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  // Entre 1100 et 1399px, les liens principaux sont déjà affichés inline :
  // le tiroir reste réservé aux liens éventuels du tableau de bord.
  const [primaryLinksInline, setPrimaryLinksInline] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches
  )
  const pathname = usePathname()
  const { data: session, status } = useSession()

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)')
    function handleChange(event: MediaQueryListEvent) {
      setPrimaryLinksInline(event.matches)
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen])

  // Au-delà de 1100px le bouton hamburger disparaît (cf. règle CSS
  // .lb-navlink-mobile plus bas) : sans ce listener, un tiroir resté ouvert
  // avant un agrandissement de fenêtre (resize ou rotation d'écran) restait
  // affiché sans aucun moyen de le fermer.
  useEffect(() => {
    if (!mobileOpen) return
    const mq = window.matchMedia('(min-width: 1400px)')
    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) setMobileOpen(false)
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [mobileOpen])

  return (
    <header
      className="lb-public-nav lb-apple-header"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(8,8,10,.74)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '1px solid rgba(255,255,255,.09)',
      }}
    >
      <div className="lb-public-nav__inner">
      <Link
        href="/home"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
          fontSize: 16,
          letterSpacing: '-0.025em',
          color: '#f5f5f7',
          textDecoration: 'none',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        LIVE<span style={{ color: 'rgba(255,255,255,.52)', fontWeight: 500 }}>IN</span>BLACK
      </Link>
      <nav aria-label="Navigation principale" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Nav publique (Accueil/Événements/Prestataires/Organisateurs) —
            visible que l'utilisateur soit connecté ou non (revenu sur la
            décision du 11/08/2026 après retour client du 13/08/2026 : le
            header doit toujours afficher ces liens sur les pages publiques,
            même connecté). Le lien "Voir le site public" reste dans le menu
            profil (AccountMenu.tsx) pour la navigation depuis le dashboard. */}
        {NAV_LINKS.map((link) => {
            const active = isCurrentPath(pathname, link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`lb-navlink ${['/home', '/events', '/providers', '/organizers'].includes(link.href) ? 'lb-navlink-primary' : 'lb-navlink-secondary'}${active ? ' lb-navlink-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                style={{ position: 'relative', color: active ? '#f5f5f7' : 'rgba(255,255,255,.68)', textDecoration: 'none', fontSize: 13.5, fontWeight: active ? 650 : 500, letterSpacing: '-.01em', padding: '10px 11px', borderRadius: 10, background: active ? 'rgba(255,255,255,.1)' : 'transparent' }}
              >
                {link.label}
              </Link>
            )
          })}
        <span className="lb-navlink lb-nav-search">
          <HeaderSearch />
        </span>
        {status === 'authenticated' && session?.user && <AccountMenu user={session.user} />}
        {status !== 'authenticated' && (
          <>
            <Link
              href="/login"
              className="lb-navlink lb-nav-auth"
              style={{
                minHeight: 44,
                padding: '10px 17px',
                borderRadius: 12,
                background: 'var(--primary)',
                color: 'var(--primary-ink)',
                fontSize: 14,
                fontWeight: 650,
                textDecoration: 'none',
              }}
            >
              <LogIn size={16} strokeWidth={2} aria-hidden="true" />
              <span>Connexion</span>
            </Link>
            <Link
              href="/login?mode=register"
              className="lb-navlink lb-nav-auth"
              style={{
                minHeight: 44,
                padding: '10px 17px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,.18)',
                background: 'rgba(255,255,255,.06)',
                color: '#f5f5f7',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <UserPlus size={16} strokeWidth={2} aria-hidden="true" />
              <span>Créer un compte</span>
            </Link>
            <Link
              href="/login"
              className="lb-navlink-mobile lb-mobile-login"
              style={{
                minHeight: 44,
                padding: '10px 15px',
                borderRadius: 12,
                background: 'var(--teal-solid)',
                color: '#04120e',
                fontSize: 14,
                fontWeight: 650,
                textDecoration: 'none',
              }}
            >
              <LogIn size={16} strokeWidth={2} aria-hidden="true" />
              <span>Connexion</span>
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
            size={44}
            style={{ background: 'rgba(255,255,255,.08)', color: '#f5f5f7', border: '1px solid rgba(255,255,255,.13)', borderRadius: 12 }}
          />
        </span>
      </nav>
      </div>

      {mobileOpen && (
        <nav
          id="lb-mobile-menu"
          aria-label="Navigation mobile"
          style={{
            position: 'absolute',
            top: '100%',
            left: 12,
            right: 12,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100dvh - 76px - var(--cookie-consent-height, 0px))',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            marginTop: 8,
            background: 'rgba(24,24,27,.96)',
            backdropFilter: 'blur(28px) saturate(170%)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,.46)',
          }}
        >
          <div style={{ padding: '14px 22px 4px' }}>
            <HeaderSearch />
          </div>
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
                      minHeight: 48,
                      padding: '13px 16px',
                      margin: '2px 8px',
                      borderRadius: 12,
                      color: active ? '#f5f5f7' : 'rgba(255,255,255,.76)',
                      background: active ? 'rgba(255,255,255,.1)' : 'transparent',
                      textDecoration: 'none',
                      fontSize: 16,
                      fontWeight: active ? 650 : 500,
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
          {NAV_LINKS.filter((link) => !primaryLinksInline || !PRIMARY_HREFS.includes(link.href)).map((link) => {
            const active = isCurrentPath(pathname, link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? 'page' : undefined}
                style={{
                  minHeight: 48,
                  padding: '13px 16px',
                  margin: '2px 8px',
                  borderRadius: 12,
                  color: active ? '#f5f5f7' : 'rgba(255,255,255,.76)',
                  background: active ? 'rgba(255,255,255,.1)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 16,
                  fontWeight: active ? 650 : 500,
                }}
              >
                {link.label}
              </Link>
            )
          })}
          {status !== 'authenticated' && (
            <div className="lb-mobile-auth-actions">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="lb-mobile-auth-button lb-mobile-auth-button--secondary"
              >
                <LogIn size={18} strokeWidth={2} aria-hidden="true" />
                <span>Connexion</span>
              </Link>
              <Link
                href="/login?mode=register"
                onClick={() => setMobileOpen(false)}
                className="lb-mobile-auth-button lb-mobile-auth-button--primary"
              >
                <UserPlus size={18} strokeWidth={2} aria-hidden="true" />
                <span>Créer un compte</span>
              </Link>
            </div>
          )}
        </nav>
      )}

      <style>{`
        .lb-public-nav__inner {
          width: 100%;
          max-width: 1440px;
          min-height: 64px;
          margin: 0 auto;
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 42px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
        }
        .lb-navlink { display: none }
        .lb-navlink-mobile { display: inline-flex; align-items: center; justify-content: center; }
        .lb-mobile-login { gap: 7px; white-space: nowrap; }
        .lb-nav-auth { align-items: center; justify-content: center; gap: 8px; line-height: 1; white-space: nowrap; }
        .lb-nav-auth:first-of-type { margin-left: 10px; }
        @media (min-width: 1100px) and (max-width: 1399px) {
          .lb-navlink-primary { display: inline-block }
          .lb-nav-auth { display: inline-flex }
          .lb-mobile-login { display: none !important }
          .lb-burger { display: inline-flex }
        }
        @media (min-width: 1400px) {
          .lb-navlink { display: inline-block }
          .lb-nav-auth { display: inline-flex !important }
          .lb-navlink-mobile { display: none !important }
        }
        .lb-navlink { transition: color 160ms ease, background 160ms ease, opacity 160ms ease; }
        .lb-navlink:not(.lb-nav-search):hover { color: #fff !important; background: rgba(255,255,255,.075) !important; }
        .lb-header-search__form {
          display: flex;
          align-items: center;
          min-height: 46px;
          padding: 1px 3px 1px 1px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 14px;
          background: rgba(255,255,255,.07);
          transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
        }
        .lb-header-search__form:focus-within {
          border-color: rgba(184,243,74,.62);
          background: rgba(255,255,255,.1);
          box-shadow: 0 0 0 4px rgba(184,243,74,.11);
        }
        .lb-header-search__input { min-width: 0; outline: none; }
        .lb-header-search__button {
          width: 40px;
          height: 40px;
          flex: 0 0 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 11px;
          background: rgba(255,255,255,.1);
          color: #f5f5f7;
          cursor: pointer;
          transition: color 160ms ease, background 160ms ease;
        }
        .lb-header-search__button:hover { color: var(--primary); background: rgba(255,255,255,.15); }
        .lb-header-search__button:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
        @media (max-width: 640px) {
          .lb-public-nav__inner { min-height: 60px; padding: 0 14px; gap: 10px; }
          .lb-header-search, .lb-header-search form { width: 100% !important; }
          .lb-header-search__input { width: auto !important; flex: 1; }
        }
        .lb-mobile-auth-actions { display: grid; grid-template-columns: 1fr; gap: 10px; padding: 14px 16px 16px; margin-top: 8px; border-top: 1px solid rgba(255,255,255,.09); }
        .lb-mobile-auth-button { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 650; }
        .lb-mobile-auth-button--primary { color: var(--primary-ink); background: var(--primary); }
        .lb-mobile-auth-button--secondary { color: #f5f5f7; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); }
        .lb-menu-row { transition: background 0.15s ease; }
        .lb-menu-row:hover, .lb-menu-row:focus-visible { background: rgba(255,255,255,.07); }
        @media (prefers-reduced-motion: reduce) {
          .lb-navlink, .lb-header-search__form, .lb-header-search__button, .lb-menu-row { transition: none; }
        }
      `}</style>
    </header>
  )
}
