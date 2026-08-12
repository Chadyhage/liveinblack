import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV === 'development';

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // googletagmanager.com : chargement de gtag.js (Google Analytics), voir
  // app/components/GoogleAnalytics.tsx — le script lui-même n'est injecté
  // que si l'utilisateur a accepté les cookies, mais la CSP doit
  // l'autoriser en amont sinon le navigateur bloque la requête même quand
  // le composant décide de le charger.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://firebasestorage.googleapis.com https://images.unsplash.com https://e-cdns-images.dzcdn.net https://*.mzstatic.com https://www.googletagmanager.com",
  "media-src 'self' blob: https://res.cloudinary.com https://audio-ssl.itunes.apple.com",
  // google-analytics.com : envoi des hits gtag (mesure) une fois le script chargé.
  "connect-src 'self' https://itunes.apple.com https://api.cloudinary.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com",
  "font-src 'self' data:",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' }, // nouveau stockage média
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' }, // URLs pré-migration (phase 10)
      { protocol: 'https', hostname: 'images.unsplash.com' }, // hero PublicLanding (legacy)
      { protocol: 'https', hostname: '*.mzstatic.com' }, // pochettes iTunes (AmbientMusicPlayer), déjà autorisé en CSP img-src
      { protocol: 'https', hostname: 'picsum.photos' }, // images placeholder de scripts/seed-bulk.ts (données de dev uniquement)
    ],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  // Renommage FR -> EN de toutes les routes (voir CLAUDE.md / mapping de
  // migration) : redirections permanentes (308) pour ne casser aucun lien
  // déjà partagé/indexé vers les anciennes URLs françaises. `:path*` (zero
  // ou plus, cf. doc Next.js redirects) couvre en une seule entrée la route
  // de base ET tous ses segments dynamiques enfants tant que la structure
  // interne (noms de segments) n'a pas elle-même changé de libellé. Seul
  // /profil fait exception : ses deux sous-pages ont été renommées avec un
  // libellé différent (pas un simple préfixe), donc wildcard exclu — 3
  // entrées explicites à la place.
  async redirects() {
    return [
      // --- Public ---
      { source: '/', destination: '/home', permanent: true },
      { source: '/accueil', destination: '/home', permanent: true },
      { source: '/c-est-quoi', destination: '/about', permanent: true },
      { source: '/connexion', destination: '/login', permanent: true },
      { source: '/evenements/:path*', destination: '/events/:path*', permanent: true },
      { source: '/inscription-organisateur', destination: '/organizer-signup', permanent: true },
      { source: '/inscription-prestataire', destination: '/provider-signup', permanent: true },
      { source: '/organisateurs/:path*', destination: '/organizers/:path*', permanent: true },
      { source: '/prestataires/:path*', destination: '/providers/:path*', permanent: true },
      { source: '/recherche', destination: '/search', permanent: true },
      { source: '/cgu', destination: '/terms', permanent: true },
      { source: '/mentions-legales', destination: '/legal-notice', permanent: true },
      { source: '/confidentialite', destination: '/privacy', permanent: true },
      { source: '/paiement-reussi', destination: '/payment-success', permanent: true },
      { source: '/paiement-annule', destination: '/payment-success?cancelled=1', permanent: true },
      { source: '/payment-cancelled', destination: '/payment-success?cancelled=1', permanent: true },
      { source: '/onboarding-organizer', destination: '/organizer-signup', permanent: true },
      { source: '/onboarding-provider', destination: '/provider-signup', permanent: true },
      // --- Authenticated ---
      { source: '/agent-sales/:eventId', destination: '/on-site-sales/:eventId', permanent: true },
      { source: '/agent/boosts', destination: '/agent/paiements?section=boosts', permanent: true },
      { source: '/commander/:path*', destination: '/order/:path*', permanent: true },
      { source: '/messagerie', destination: '/messages', permanent: true },
      { source: '/ma-page-organisateur', destination: '/organizer-studio', permanent: true },
      { source: '/mes-evenements/:path*', destination: '/my-events/:path*', permanent: true },
      { source: '/mon-dossier', destination: '/my-application', permanent: true },
      { source: '/onboarding-organisateur', destination: '/organizer-signup', permanent: true },
      { source: '/onboarding-prestataire', destination: '/provider-signup', permanent: true },
      { source: '/profil', destination: '/profile', permanent: true },
      { source: '/profile/aide', destination: '/help', permanent: true },
      { source: '/profil/evenements-interesses', destination: '/profile/interested-events', permanent: true },
      { source: '/profil/organisateurs-suivis', destination: '/profile/followed-organizers', permanent: true },
      { source: '/proposer-services', destination: '/offer-services', permanent: true },
      { source: '/proposer', destination: '/offer-services', permanent: true },
      { source: '/portefeuille', destination: '/profile', permanent: true },
      { source: '/mon-abonnement', destination: '/offer-services?tab=abonnement', permanent: true },
      { source: '/my-subscription', destination: '/offer-services?tab=abonnement', permanent: true },
      { source: '/mes-soirees', destination: '/my-shifts', permanent: true },
      { source: '/scanner', destination: '/my-shifts', permanent: true },
      { source: '/agent/organisateurs', destination: '/agent', permanent: true },
      // /admin n'est pas un second espace : l'espace agent (guard
      // `requireAgent`, voir AGENTS.md) couvre déjà 100% de la gestion
      // plateforme (comptes, événements, dossiers, paiements/boosts,
      // suppressions, signalements, avis, actualité). Plutôt que de
      // dupliquer cette surface sous /admin, on aliase l'URL demandée par
      // le client vers l'espace existant — même redirection permanente que
      // les autres alias de route ci-dessus.
      { source: '/admin', destination: '/agent', permanent: true },
      { source: '/admin/:path*', destination: '/agent/:path*', permanent: true },
    ]
  },
};

export default nextConfig;
