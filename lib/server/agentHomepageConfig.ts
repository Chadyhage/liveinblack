import { getDb } from '../db/mongoose'
import HomepageConfig, { HOMEPAGE_ACTUALITE_ID, ACTUALITE_ACCENTS, type ActualiteAccent } from '../models/HomepageConfig'
import { listPublicEvents } from './events'
import { listEventsForAgent } from './agentEvents'

// Port de src/utils/homepageConfig.js + src/components/ActualiteAdminPanel.jsx
// (#9 phase agent/admin, tab 'actualite') — config éditoriale SINGLETON du
// carrousel « Actualité » de l'accueil (app_config/homepage_actualite en
// Firestore legacy). Volontairement SIMPLE et déterministe : l'agent choisit
// EXPLICITEMENT les événements à mettre en avant, jamais de sélection
// automatique (voir commentaire legacy).
//
// Le contrôle « l'appelant est bien un agent » se fait à la couche route
// (requireAgent) — comme partout ailleurs dans ce port, updateHomepageConfig
// fait confiance à `agent` et ne revérifie pas le rôle. getPublicHomepageConfig
// est un export SÉPARÉ (même lecture) pour que l'appelant public (accueil)
// n'ait jamais accès, même par erreur d'import, à la fonction d'écriture.

const MAX_EVENTS = 12
const DEFAULT_TITLE = "L'actu du moment"
const DEFAULT_SUBTITLE = 'Les temps forts à ne pas manquer'

export interface HomepageActualiteConfig {
  active: boolean
  title: string
  subtitle: string
  accent: ActualiteAccent
  eventIds: string[]
  updatedAt: string | null
  updatedBy: string
}

interface RawConfig {
  active?: unknown
  title?: unknown
  subtitle?: unknown
  accent?: unknown
  eventIds?: unknown
  updatedAt?: unknown
  updatedBy?: unknown
}

// Normalise une config brute (Mongo ou saisie agent) en objet sûr : jamais
// d'undefined, types garantis, accent contraint à la palette. Idempotent —
// port fidèle de normalizeActualite (legacy).
function normalize(raw: RawConfig | null | undefined): HomepageActualiteConfig {
  const c = raw ?? {}
  const accent = (ACTUALITE_ACCENTS as readonly string[]).includes(c.accent as string) ? (c.accent as ActualiteAccent) : 'teal'
  const title = typeof c.title === 'string' && c.title.trim() ? c.title.trim().slice(0, 80) : DEFAULT_TITLE
  const subtitle = typeof c.subtitle === 'string' ? c.subtitle.slice(0, 140) : DEFAULT_SUBTITLE
  const eventIds = Array.isArray(c.eventIds)
    ? [...new Set((c.eventIds as unknown[]).filter((v) => v != null && v !== '').map(String))].slice(0, MAX_EVENTS)
    : []
  return {
    active: c.active === true,
    title,
    subtitle,
    accent,
    eventIds,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : c.updatedAt instanceof Date ? c.updatedAt.toISOString() : null,
    updatedBy: typeof c.updatedBy === 'string' ? c.updatedBy : '',
  }
}

async function loadConfig(): Promise<HomepageActualiteConfig> {
  await getDb()
  const doc = await HomepageConfig.findById(HOMEPAGE_ACTUALITE_ID).lean()
  return normalize(doc as RawConfig | null)
}

// Lecture agent (panneau admin) — mêmes données que la lecture publique,
// export séparé pour la clarté des call-sites (cf. commentaire d'en-tête).
export async function getHomepageConfig(): Promise<HomepageActualiteConfig> {
  return loadConfig()
}

// Lecture publique (accueil) — read-only, aucune fonction d'écriture n'est
// exportée sous ce nom.
export async function getPublicHomepageConfig(): Promise<HomepageActualiteConfig> {
  return loadConfig()
}

export interface AgentCaller {
  id: string
}

export interface UpdateHomepageConfigInput {
  active?: boolean
  title?: string
  subtitle?: string
  accent?: string
  eventIds?: string[]
}

// Sauvegarde agent — normalise TOUJOURS avant écriture (trim, cap 80/140,
// dédup + cap 12 sur eventIds, accent contraint) : jamais de donnée brute
// admin persistée telle quelle, même fidélité que saveActualite (legacy).
export async function updateHomepageConfig(agent: AgentCaller, input: UpdateHomepageConfigInput): Promise<HomepageActualiteConfig> {
  await getDb()
  const clean = normalize(input as RawConfig)
  const now = new Date()
  const updated = await HomepageConfig.findByIdAndUpdate(
    HOMEPAGE_ACTUALITE_ID,
    { $set: { ...clean, updatedAt: now, updatedBy: agent.id } },
    { upsert: true, new: true }
  ).lean()
  return normalize(updated as RawConfig)
}

export interface EventPickerOption {
  id: string
  name: string
  date: string
  dateDisplay: string
  city: string
  region: string
}

// Bassin d'événements « à la une » proposables — réutilise listPublicEvents
// (lib/server/events.ts) qui applique déjà isClientDiscoverableEvent (non
// annulé, non privé, non démo, publié, pas terminé) : exactement le filtre
// `allEvents.filter(isClientDiscoverableEvent)` du panneau legacy, sans
// dupliquer cette logique de découvrabilité ici.
export async function listCandidateEventsForActualite(): Promise<EventPickerOption[]> {
  const events = await listPublicEvents()
  return events
    .map((e) => ({ id: e.id, name: e.name, date: e.date, dateDisplay: e.dateDisplay ?? '', city: e.city ?? '', region: e.region ?? '' }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

// Résout le libellé des événements déjà curés dans la config, MÊME s'ils ne
// sont plus découvrables (annulé, terminé, dépublié depuis) — réutilise
// listEventsForAgent (lib/server/agentEvents.ts, #9 « Événements ») qui
// couvre déjà tous les événements sans filtre de découvrabilité, comme le
// `allEvents` (non filtré) que le panneau legacy utilisait pour son `byId`.
// Un id qui ne correspond plus à AUCUN événement (vraiment supprimé) est
// simplement absent de la map retournée — affiché « Introuvable » côté UI.
export async function resolveActualiteEventLabels(eventIds: string[]): Promise<Record<string, EventPickerOption>> {
  if (eventIds.length === 0) return {}
  const wanted = new Set(eventIds)
  const all = await listEventsForAgent()
  const out: Record<string, EventPickerOption> = {}
  for (const e of all) {
    if (wanted.has(e.id)) out[e.id] = { id: e.id, name: e.name, date: e.date, dateDisplay: e.dateDisplay, city: e.city, region: '' }
  }
  return out
}
