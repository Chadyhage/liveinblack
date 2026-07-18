import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Le repo racine a un pnpm-lock.yaml (app legacy) qui fait deviner à
  // Next.js/Turbopack la mauvaise racine de workspace — on épingle web/
  // explicitement.
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' }, // nouveau stockage média
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' }, // URLs pré-migration (phase 10)
      { protocol: 'https', hostname: 'images.unsplash.com' }, // hero PublicLanding (legacy)
    ],
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
      // --- Authenticated ---
      { source: '/commander/:path*', destination: '/order/:path*', permanent: true },
      { source: '/ma-page-organisateur', destination: '/organizer-studio', permanent: true },
      { source: '/mes-evenements/:path*', destination: '/my-events/:path*', permanent: true },
      { source: '/mon-dossier', destination: '/my-application', permanent: true },
      { source: '/onboarding-organisateur', destination: '/onboarding-organizer', permanent: true },
      { source: '/onboarding-prestataire', destination: '/onboarding-provider', permanent: true },
      { source: '/profil', destination: '/profile', permanent: true },
      { source: '/profil/evenements-interesses', destination: '/profile/interested-events', permanent: true },
      { source: '/profil/organisateurs-suivis', destination: '/profile/followed-organizers', permanent: true },
      { source: '/proposer-services', destination: '/offer-services', permanent: true },
      { source: '/mon-abonnement', destination: '/my-subscription', permanent: true },
      { source: '/mes-soirees', destination: '/my-shifts', permanent: true },
    ]
  },
};

export default nextConfig;
