import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LIVEINBLACK — Événements au Bénin',
    short_name: 'LIVEINBLACK',
    description: 'Découvre et réserve les meilleurs événements au Bénin et en Afrique de l’Ouest.',
    start_url: '/home',
    display: 'standalone',
    background_color: '#0a0a0d',
    theme_color: '#0b0b0d',
    lang: 'fr-BJ',
    categories: ['entertainment', 'events', 'lifestyle'],
  }
}
