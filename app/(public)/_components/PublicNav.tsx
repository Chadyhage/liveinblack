'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import AccountMenu from './AccountMenu'
import { IconButton } from '@/app/components/ui'
import { Menu, Search, X } from 'lucide-react'

const NAV_LINKS = [
  { href: '/home', label: 'Accueil' },
  { href: '/events', label: 'Événements' },
  { href: '/providers', label: 'Prestataires' },
  { href: '/organizers', label: 'Organisateurs' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: "C'est quoi" },
]

interface QuickSearchEvent { id: string; name: string; dateDisplay: string | null; city: string | null; imageUrl: string | null }
interface QuickSearchOrganizer { userId: string; slug: string; publicName: string; city: string | null; avatarUrl: string | null }
interface QuickSearchProvider { userId: string; name: string; city: string | null; avatarUrl: string | null }
interface QuickSearchResults { events: QuickSearchEvent[]; providers: QuickSearchProvider[]; organizers: QuickSearchOrganizer[] }

const EMPTY_RESULTS: QuickSearchResults = { events: [], providers: [], organizers: [] }

// Recherche globale (événements + organisateurs + prestataires) directement
// dans le header — auparavant une simple entrée de nav vers /search, une page
// dédiée pour un besoin aussi fréquent forçait un aller-retour inutile.
// Icône collapsible : clic ouvre un champ inline. Au lieu de rediriger vers
// /search à chaque frappe, on interroge GET /api/search/quick (top 3/catégorie,
// mêmes fonctions serveur que /search — voir ce fichier) et on affiche un
// dropdown de résultats en direct sous le champ ; /search reste la
// destination de la recherche complète via « Voir tous les résultats » ou la
// soumission du formulaire, jamais le seul point d'entrée.
//
// Pas de catégorie « Utilisateurs » : la seule recherche d'utilisateurs de
// l'app (lib/server/friends.ts:searchUsers) exige une session et sert à
// retrouver un contact de messagerie, ce n'est pas un répertoire public — ne
// pas la détourner ici exposerait des comptes hors de ce cadre.
function HeaderSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [results, setResults] = useState<QuickSearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Convention useEffect + fetch du projet (CLAUDE.md) : logique de fetch
  // inline dans une fonction async locale, flag `cancelled` pour éviter une
  // mise à jour d'état après démontage/frappe suivante. Debounce 280ms pour
  // ne pas interroger la base à chaque touche.
  useEffect(() => {
    const query = value.trim()
    if (!query) {
      setResults(EMPTY_RESULTS)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
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
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
        if (!value) setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, value])

  function goToFullResults(query: string) {
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
    setOpen(false)
    setDropdownOpen(false)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    goToFullResults(value.trim())
  }

  const hasResults = results.events.length > 0 || results.providers.length > 0 || results.organizers.length > 0
  const showDropdown = open && dropdownOpen && value.trim().length > 0

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <form
        role="search"
        onSubmit={handleSubmit}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {open && (
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setDropdownOpen(true)
            }}
            onFocus={() => setDropdownOpen(true)}
            placeholder="Rechercher…"
            aria-label="Recherche globale"
            style={{
              width: 220,
              minHeight: 40,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid var(--border-strong)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13.5,
              fontFamily: 'inherit',
            }}
          />
        )}
        <IconButton
          type={open ? 'submit' : 'button'}
          onClick={() => { if (!open) setOpen(true) }}
          label="Recherche globale"
          icon={<Search size={18} strokeWidth={2} aria-hidden="true" />}
          size={40}
          style={{ background: 'var(--surface)', color: 'var(--text)', borderRadius: '50%' }}
        />
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
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 20px 48px rgba(0,0,0,.5)',
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
                  onClick={() => { setOpen(false); setDropdownOpen(false) }}
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
                  onClick={() => { setOpen(false); setDropdownOpen(false) }}
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
                  onClick={() => { setOpen(false); setDropdownOpen(false) }}
                  className="lb-menu-row"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', textDecoration: 'none', color: 'inherit' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                  {p.city && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{p.city}</span>}
                </Link>
              ))}
            </QuickResultGroup>
          )}

          <button
            type="button"
            onClick={() => goToFullResults(value.trim())}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              padding: '11px 14px',
              fontSize: 12.5,
              fontWeight: 800,
              color: 'var(--teal)',
              background: 'transparent',
              border: 'none',
              borderTop: '1px solid var(--border)',
              textTransform: 'uppercase',
              letterSpacing: '.03em',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Voir tous les résultats
          </button>
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
  // Entre 1100 et 1399px, les liens "primaires" sont déjà affichés inline
  // (règle .lb-navlink-primary plus bas) : le tiroir ne doit alors proposer
  // que ce qui manque (« C'est quoi »), jamais les répéter.
  const [primaryLinksInline, setPrimaryLinksInline] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches
  )
  const pathname = usePathname()
  const onLoginPage = pathname === '/login'
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
      className="lb-public-nav"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(7,8,13,0.86)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(184, 243, 74,.16)',
      }}
    >
      <div className="lb-public-nav__inner">
      <Link
        href="/home"
        style={{
          fontSize: 17,
          letterSpacing: '0.12em',
          color: 'var(--text)',
          textDecoration: 'none',
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        L<span style={{ color: 'var(--text)' }}>|</span>VE IN{' '}
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 700 }}>BLACK</span>
      </Link>
      <nav aria-label="Navigation principale" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        {NAV_LINKS.map((link) => {
          const active = isCurrentPath(pathname, link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`lb-navlink ${['/home', '/events', '/providers', '/organizers'].includes(link.href) ? 'lb-navlink-primary' : 'lb-navlink-secondary'}${active ? ' lb-navlink-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              style={{ position: 'relative', color: active ? 'var(--primary)' : 'var(--text-muted)', textDecoration: 'none', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.055em', padding: '8px 0' }}
            >
              {link.label}
            </Link>
          )
        })}
        <span className="lb-navlink">
          <HeaderSearch />
        </span>
        {status === 'authenticated' && session?.user && <AccountMenu user={session.user} />}
        {status === 'unauthenticated' && !onLoginPage && (
          <>
            <Link
              href="/login"
              className="lb-navlink lb-nav-auth"
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
              className="lb-navlink lb-nav-auth"
              style={{
                padding: '9px 18px',
                borderRadius: 999,
                border: '1px solid rgba(184, 243, 74,.55)',
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
              className="lb-navlink-mobile lb-mobile-login"
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
            size={40}
            style={{ background: 'var(--surface)', color: 'var(--text)', borderRadius: '50%' }}
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
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100dvh - 58px - var(--cookie-consent-height, 0px))',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--border)',
            boxShadow: '0 16px 32px rgba(0,0,0,0.4)',
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
                      padding: '14px 22px',
                      color: active ? 'var(--primary)' : 'var(--text)',
                      background: active ? 'rgba(184, 243, 74,.08)' : 'transparent',
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
          {NAV_LINKS.filter((link) => !primaryLinksInline || !PRIMARY_HREFS.includes(link.href)).map((link) => {
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
                  background: active ? 'rgba(184, 243, 74,.08)' : 'transparent',
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
        .lb-public-nav__inner {
          width: 100%;
          max-width: 1800px;
          min-height: 64px;
          margin: 0 auto;
          padding: 0 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .lb-navlink { display: none }
        .lb-navlink-mobile { display: inline-flex; align-items: center; justify-content: center; }
        .lb-nav-auth { align-items: center; justify-content: center; line-height: 1; }
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
        @media (max-width: 640px) {
          .lb-public-nav__inner { min-height: 58px; padding: 0 14px; gap: 10px; }
        }
        .lb-menu-row { transition: background 0.15s ease; }
        .lb-menu-row:hover, .lb-menu-row:focus-visible { background: var(--surface); }
      `}</style>
    </header>
  )
}
