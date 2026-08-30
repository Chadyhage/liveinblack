import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'LIVEINBLACK — Événements au Bénin',
    short_name: 'LIVEINBLACK',
    description: 'Découvre, réserve et organise les meilleurs événements au Bénin avec une billetterie simple, des prestataires vérifiés et des guides locaux.',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    background_color: '#191218',
    theme_color: '#191218',
    orientation: 'portrait-primary',
    lang: 'fr-BJ',
    dir: 'ltr',
    categories: ['entertainment', 'events', 'lifestyle'],
    icons: [
      {
        src: '/branding/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/branding/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/branding/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [
      {
        src: '/opengraph-image',
        sizes: '1200x630',
        type: 'image/png',
        form_factor: 'wide',
        label: 'LIVEINBLACK — événements, billets et prestataires au Bénin',
      },
    ],
    shortcuts: [
      {
        name: 'Trouver un événement',
        short_name: 'Événements',
        description: 'Voir les sorties, concerts et expériences disponibles au Bénin.',
        url: '/events',
      },
      {
        name: 'Trouver un prestataire',
        short_name: 'Prestataires',
        description: 'Découvrir des prestataires événementiels vérifiés.',
        url: '/providers',
      },
      {
        name: 'Lire les guides',
        short_name: 'Guides',
        description: 'Conseils et actualités pour mieux sortir et organiser au Bénin.',
        url: '/blog',
      },
    ],
  }
}
