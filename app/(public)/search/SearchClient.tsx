'use client'

import Link from 'next/link'
import { CalendarDays, MapPin, Search, Sparkles, Store, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import styles from './search.module.css'

type SearchEvent = { id: string; name: string; city?: string | null; dateDisplay?: string | null; imageUrl?: string | null }
type SearchProvider = { userId: string; name: string; city?: string | null; location?: string | null; description?: string | null; photoUrl?: string | null }
type SearchOrganizer = { userId: string; slug?: string | null; publicName: string; city?: string | null; shortDescription?: string | null; avatarUrl?: string | null }
type SearchResults = { events: SearchEvent[]; providers: SearchProvider[]; organizers: SearchOrganizer[] }

const EMPTY_RESULTS: SearchResults = { events: [], providers: [], organizers: [] }

function visualStyle(url?: string | null) {
  return url ? { backgroundImage: `linear-gradient(180deg, transparent, rgba(0,0,0,.28)), url("${url.replaceAll('"', '%22')}")` } : undefined
}

export default function SearchClient({ initialQuery }: { initialQuery: string }) {
  const [value, setValue] = useState(initialQuery)
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(initialQuery.length >= 2)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialQuery.length < 2) return
    const controller = new AbortController()
    fetch(`/api/search?q=${encodeURIComponent(initialQuery)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 429 ? 'Trop de recherches. Réessaie dans un instant.' : 'Recherche momentanément indisponible.')
        return response.json() as Promise<Partial<SearchResults>>
      })
      .then((payload) => setResults({
        events: Array.isArray(payload.events) ? payload.events : [],
        providers: Array.isArray(payload.providers) ? payload.providers : [],
        organizers: Array.isArray(payload.organizers) ? payload.organizers : [],
      }))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Recherche momentanément indisponible.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [initialQuery])

  const total = useMemo(() => results.events.length + results.providers.length + results.organizers.length, [results])
  function submit(event: FormEvent<HTMLFormElement>) { if (value.trim().length < 2) event.preventDefault() }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" /> Explorer LIVEINBLACK</p>
        <h1>Trouve ce que tu cherches</h1>
        <p>Événements, organisateurs et prestataires du Bénin réunis dans une recherche rapide.</p>
        <form className={styles.searchForm} action="/search" method="get" onSubmit={submit} role="search">
          <Search size={19} aria-hidden="true" />
          <input type="search" name="q" value={value} onChange={(event) => setValue(event.target.value)} minLength={2} maxLength={120} placeholder="Événement, ville, organisateur, service…" aria-label="Rechercher sur LIVEINBLACK" />
          <button type="submit" disabled={value.trim().length < 2}>Rechercher</button>
        </form>
      </header>
      <div className={styles.content} aria-live="polite">
        {initialQuery.length < 2 ? <div className={styles.empty}><Search size={25} aria-hidden="true" /><h2>Lance une recherche</h2><p>Saisis au moins deux caractères pour découvrir les résultats.</p></div>
        : loading ? <div className={styles.loadingGrid} aria-label="Recherche en cours">{Array.from({ length: 6 }).map((_, index) => <span key={index} />)}</div>
        : error ? <div className={styles.empty} role="alert"><h2>Impossible de rechercher</h2><p>{error}</p></div>
        : total === 0 ? <div className={styles.empty}><Search size={25} aria-hidden="true" /><h2>Aucun résultat pour « {initialQuery} »</h2><p>Essaie une ville, un type de soirée ou un service plus général.</p></div>
        : <>
          <div className={styles.summary}><strong>{total}</strong> résultat{total > 1 ? 's' : ''} pour « {initialQuery} »</div>
          {results.events.length > 0 && <ResultSection title="Événements" kicker="Agenda" icon={<CalendarDays size={18} />} href={`/events?q=${encodeURIComponent(initialQuery)}`}>
            {results.events.map((item) => <ResultCard key={item.id} href={`/events/${encodeURIComponent(item.id)}`} image={item.imageUrl} icon={<CalendarDays size={23} />} title={item.name} detail={[item.dateDisplay, item.city].filter(Boolean).join(' · ') || 'Voir les informations'} />)}
          </ResultSection>}
          {results.organizers.length > 0 && <ResultSection title="Organisateurs" kicker="Créateurs" icon={<UsersRound size={18} />} href={`/organizers?q=${encodeURIComponent(initialQuery)}`}>
            {results.organizers.map((item) => <ResultCard key={item.userId} href={`/organizers/${encodeURIComponent(item.slug || item.userId)}`} image={item.avatarUrl} icon={<UsersRound size={23} />} title={item.publicName} detail={item.city || item.shortDescription || 'Découvrir le profil'} />)}
          </ResultSection>}
          {results.providers.length > 0 && <ResultSection title="Prestataires" kicker="Services" icon={<Store size={18} />} href={`/providers?q=${encodeURIComponent(initialQuery)}`}>
            {results.providers.map((item) => <ResultCard key={item.userId} href={`/providers/${encodeURIComponent(item.userId)}`} image={item.photoUrl} icon={<Store size={23} />} title={item.name} detail={item.city || item.location || item.description || 'Découvrir le profil'} location />)}
          </ResultSection>}
        </>}
      </div>
    </main>
  )
}

function ResultSection({ title, kicker, icon, href, children }: { title: string; kicker: string; icon: ReactNode; href: string; children: ReactNode }) {
  return <section className={styles.section}><div className={styles.sectionHeading}><span>{icon}</span><div><p>{kicker}</p><h2>{title}</h2></div><Link href={href}>Tout voir</Link></div><div className={styles.grid}>{children}</div></section>
}

function ResultCard({ href, image, icon, title, detail, location = false }: { href: string; image?: string | null; icon: ReactNode; title: string; detail: string; location?: boolean }) {
  return <Link className={styles.card} href={href}><span className={styles.visual} style={visualStyle(image)} aria-hidden="true">{icon}</span><span className={styles.cardBody}><strong>{title}</strong><small>{location && <MapPin size={12} aria-hidden="true" />}{detail}</small></span></Link>
}
