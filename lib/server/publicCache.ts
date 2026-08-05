// ISR pour les pages/routes publiques : `unstable_cache` exige le runtime
// serveur Next.js (route handler / RSC) — il plante hors de ce contexte
// (`Invariant: incrementalCache missing`), donc jamais dans lib/server/*.ts
// lui-même (importé tel quel par les tests Vitest et les scripts de seed).
// Ce module n'est importé QUE depuis des pages/route handlers app/*, jamais
// depuis lib/server/* ni depuis un script — il enveloppe les fonctions de
// lecture publique déjà existantes, sans dupliquer leur logique.
//
// Les champs Date des documents renvoyés redeviennent des chaînes ISO après
// un passage par le cache (sérialisation JSON de unstable_cache) — déjà géré
// par tout le code appelant, qui fait systématiquement `new Date(x)`.
import { unstable_cache } from 'next/cache'
import { listPublicEvents, searchPublicEvents } from './events'
import { getBoostedEventIds } from './boosts'
import { listPublicProviders } from './providers'
import { listPublicOrganizers, listPublicOrganizersWithNextEvent } from './organizers'
import { getPublicHomepageConfig } from './agentHomepageConfig'

const REVALIDATE_SECONDS = 60

export const getCachedPublicEvents = unstable_cache(listPublicEvents, ['public-events-list'], {
  revalidate: REVALIDATE_SECONDS,
  tags: ['public-events'],
})

export const getCachedSearchPublicEvents = unstable_cache(searchPublicEvents, ['public-events-search'], {
  revalidate: REVALIDATE_SECONDS,
  tags: ['public-events'],
})

// Set n'est pas sérialisable tel quel par unstable_cache (JSON-only) — on
// cache le tableau d'ids et on reconstruit le Set à chaque appel.
const getCachedBoostedEventIdsArray = unstable_cache(
  async () => Array.from(await getBoostedEventIds()),
  ['boosted-event-ids'],
  { revalidate: REVALIDATE_SECONDS, tags: ['boosts'] }
)
export async function getCachedBoostedEventIds(): Promise<Set<string>> {
  return new Set(await getCachedBoostedEventIdsArray())
}

export const getCachedPublicProviders = unstable_cache(listPublicProviders, ['public-providers-list'], {
  revalidate: REVALIDATE_SECONDS,
  tags: ['public-providers'],
})

export const getCachedPublicOrganizers = unstable_cache(listPublicOrganizers, ['public-organizers-list'], {
  revalidate: REVALIDATE_SECONDS,
  tags: ['public-organizers'],
})

export const getCachedPublicOrganizersWithNextEvent = unstable_cache(
  listPublicOrganizersWithNextEvent,
  ['public-organizers-with-next-event'],
  { revalidate: REVALIDATE_SECONDS, tags: ['public-organizers', 'public-events'] }
)

// Singleton éditorial modifié rarement (panneau agent) — mis en cache lui
// aussi ; le panneau admin continue de lire getHomepageConfig (non caché,
// lib/server/agentHomepageConfig.ts) pour voir sa propre sauvegarde
// immédiatement après un update.
export const getCachedPublicHomepageConfig = unstable_cache(getPublicHomepageConfig, ['public-homepage-config'], {
  revalidate: REVALIDATE_SECONDS,
  tags: ['homepage-config'],
})
