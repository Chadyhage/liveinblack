// Port de la validation de slug de src/utils/organizers.js (#7 phase
// organisateur, studio "Ma page publique"). Partagée (lib/shared/, pas
// lib/server/) pour un retour immédiat côté formulaire client ET pour être
// la même règle appliquée côté serveur dans lib/server/organizerProfile.ts —
// la vérification d'UNICITÉ, elle, a besoin de la base et reste côté serveur.

export const RESERVED_ORGANIZER_SLUGS = new Set([
  'admin',
  'support',
  'login',
  'register',
  'api',
  'dashboard',
  'prestataires',
  'evenements',
  'organisateurs',
  'connexion',
  'profil',
])

export function slugifyOrganizer(value: string | null | undefined = ''): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54)
}

export type SlugFormatResult = { ok: true; slug: string } | { ok: false; slug: string; error: string }

// Vérifie uniquement le FORMAT (longueur, réservé) — pas l'unicité, qui
// nécessite une requête base et reste dans lib/server/organizerProfile.ts.
export function validateOrganizerSlugFormat(value: string | null | undefined): SlugFormatResult {
  const slug = slugifyOrganizer(value)
  if (slug.length < 3) return { ok: false, slug, error: 'L’adresse personnalisée doit contenir au moins 3 caractères.' }
  if (RESERVED_ORGANIZER_SLUGS.has(slug)) return { ok: false, slug, error: 'Cette adresse personnalisée est réservée.' }
  return { ok: true, slug }
}
