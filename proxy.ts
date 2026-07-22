import { NextResponse } from 'next/server'
import { auth } from '@/auth'

// Remplace les 5 guards de src/App.jsx (RequireAuth, RequireRole,
// RequireOrganisateur, RequireServiceAccess) pour tout ce qui est vérifiable
// depuis la seule session JWT (rôle actif, statut). NOTE : ceci est un
// contrôle d'UX (redirection rapide), pas la frontière de sécurité — chaque
// route handler qui mute des données revérifie identité + rôle + propriété
// de la ressource côté serveur (voir lib/server/*). OnboardingGuard (qui a
// besoin d'une lecture base à jour) reste dans app/(app)/layout.tsx, pas ici.
// Renommé `proxy.ts` (Next.js 16 — `middleware.ts` est déprécié).

const AUTH_REQUIRED_PREFIXES = ['/profile', '/messages', '/scanner', '/my-shifts', '/order', '/my-application', '/onboarding-organizer', '/onboarding-provider', '/playlist']
const ORGANISATEUR_OR_AGENT_PREFIXES = ['/my-events']
const ORGANISATEUR_ONLY_PREFIXES = ['/organizer-studio']
const SERVICE_ACCESS_PREFIXES = ['/offer-services', '/my-subscription']
const AGENT_ONLY_PREFIXES = ['/agent']

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth
  const activeRole = session?.user?.activeRole

  const redirectToLogin = () => {
    const url = new URL('/login', req.nextUrl.origin)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  const redirectHome = () => NextResponse.redirect(new URL('/home', req.nextUrl.origin))
  const redirectToDossier = () => NextResponse.redirect(new URL('/my-application', req.nextUrl.origin))

  if (matchesPrefix(pathname, AUTH_REQUIRED_PREFIXES) && !session) {
    return redirectToLogin()
  }

  // Un organisateur dont le dossier est encore en attente (#7 phase
  // organisateur) est renvoyé vers /my-application plutôt que de voir un
  // /my-events vide — même comportement que l'OnboardingGuard legacy
  // (statut 'pending' → accès bloqué en dehors d'une liste d'URLs publiques).
  if (matchesPrefix(pathname, ORGANISATEUR_OR_AGENT_PREFIXES)) {
    if (!session) return redirectToLogin()
    if (activeRole !== 'organisateur' && activeRole !== 'agent') return redirectHome()
    if (activeRole === 'organisateur' && session.user.orgStatus === 'pending') return redirectToDossier()
  }

  if (matchesPrefix(pathname, ORGANISATEUR_ONLY_PREFIXES)) {
    if (!session) return redirectToLogin()
    if (activeRole !== 'organisateur') return redirectHome()
    if (session.user.orgStatus === 'pending') return redirectToDossier()
  }

  if (matchesPrefix(pathname, SERVICE_ACCESS_PREFIXES)) {
    if (!session) return redirectToLogin()
    if (activeRole !== 'prestataire') return redirectHome()
  }

  if (matchesPrefix(pathname, AGENT_ONLY_PREFIXES)) {
    if (!session) return redirectToLogin()
    if (activeRole !== 'agent') return redirectHome()
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/profile/:path*',
    '/messages/:path*',
    '/scanner/:path*',
    '/my-shifts/:path*',
    '/order/:path*',
    '/my-application/:path*',
    '/onboarding-organizer/:path*',
    '/onboarding-provider/:path*',
    '/playlist/:path*',
    '/my-events/:path*',
    '/organizer-studio/:path*',
    '/offer-services/:path*',
    '/my-subscription/:path*',
    '/agent/:path*',
  ],
}
