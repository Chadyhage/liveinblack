import type { MetadataRoute } from 'next'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Autorise l'indexation des pages publiques uniquement — toute la zone
// authentifiée (app/(app)/*) est déjà exclue de l'indexation via
// `robots: { index: false, follow: false }` dans ses metadata (voir
// app/(app)/profile/page.tsx et consorts), ce Disallow est une deuxième
// barrière au niveau crawler, pas une redite inutile.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/profile',
        '/messages',
        '/scanner',
        '/my-shifts',
        '/my-events',
        '/my-application',
        '/my-subscription',
        '/organizer-studio',
        '/offer-services',
        '/agent',
        '/onboarding-organizer',
        '/onboarding-provider',
        '/order',
        '/playlist',
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  }
}
