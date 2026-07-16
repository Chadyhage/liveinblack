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

const AUTH_REQUIRED_PREFIXES = ['/profil', '/messagerie', '/scanner', '/mes-soirees', '/commander', '/mon-dossier']
const ORGANISATEUR_OR_AGENT_PREFIXES = ['/mes-evenements']
const ORGANISATEUR_ONLY_PREFIXES = ['/ma-page-organisateur']
const SERVICE_ACCESS_PREFIXES = ['/proposer', '/mon-abonnement']
const AGENT_ONLY_PREFIXES = ['/agent']

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth
  const activeRole = session?.user?.activeRole

  const redirectToLogin = () => {
    const url = new URL('/connexion', req.nextUrl.origin)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  const redirectHome = () => NextResponse.redirect(new URL('/accueil', req.nextUrl.origin))

  if (matchesPrefix(pathname, AUTH_REQUIRED_PREFIXES) && !session) {
    return redirectToLogin()
  }

  if (matchesPrefix(pathname, ORGANISATEUR_OR_AGENT_PREFIXES)) {
    if (!session) return redirectToLogin()
    if (activeRole !== 'organisateur' && activeRole !== 'agent') return redirectHome()
  }

  if (matchesPrefix(pathname, ORGANISATEUR_ONLY_PREFIXES)) {
    if (!session) return redirectToLogin()
    if (activeRole !== 'organisateur') return redirectHome()
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
    '/profil/:path*',
    '/messagerie/:path*',
    '/scanner/:path*',
    '/mes-soirees/:path*',
    '/commander/:path*',
    '/mon-dossier/:path*',
    '/mes-evenements/:path*',
    '/ma-page-organisateur/:path*',
    '/proposer/:path*',
    '/mon-abonnement/:path*',
    '/agent/:path*',
  ],
}
