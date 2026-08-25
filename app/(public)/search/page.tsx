import type { Metadata } from 'next'
import SearchClient from './SearchClient'

type SearchPageProps = { searchParams: Promise<{ q?: string | string[] }> }

function readQuery(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value || '').trim().slice(0, 120)
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const query = readQuery((await searchParams).q)
  const title = query ? `Recherche : ${query}` : 'Recherche'
  return {
    title,
    description: 'Recherchez les événements, organisateurs et prestataires disponibles sur LIVEINBLACK au Bénin.',
    alternates: { canonical: '/search' },
    robots: { index: false, follow: true },
    openGraph: {
      title: `${title} — LIVEINBLACK`,
      description: 'Trouvez rapidement les événements et professionnels de l’événementiel au Bénin.',
      url: '/search',
      type: 'website',
    },
  }
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = readQuery((await searchParams).q)
  return <SearchClient key={query} initialQuery={query} />
}
