// Configuration éditoriale de l'accueil — carrousel « Actualité ».
//
// Un SEUL document global (app_config/homepage_actualite) curé par un agent
// depuis le panneau admin. Lu publiquement (règle Firestore : read public,
// write agent-only). Sert à mettre en avant une sélection d'événements en haut
// de l'accueil : temps forts du week-end, nouveautés, saison de festivals…
//
// Volontairement SIMPLE et déterministe : l'admin choisit EXPLICITEMENT les
// événements à mettre en avant (pas de détection automatique) → aucun contenu
// surprise, et le carrousel s'efface tout seul s'il est inactif ou vide
// (jamais de layout cassé, cf. exigence « que les carrousels ne fassent pas
// buguer le site »).

// firestore-sync est chargé en DYNAMIQUE (import()) dans listen/save : ça évite
// de tirer tout le SDK Firebase au simple import de ce module (logique pure
// testable en node), conformément à la règle d'import dynamique du projet.
import { isClientDiscoverableEvent } from './eventDiscovery.js'

export const ACTUALITE_PATH = 'app_config/homepage_actualite'

// Accents autorisés — strictement alignés sur la palette (teal / gold / pink).
// Pas de couleur libre : garde l'accueil cohérent quelles que soient les
// manipulations de l'admin.
export const ACTUALITE_ACCENTS = {
  teal: { key: 'teal', label: 'Teal',  dot: '#4ee8c8', soft: 'rgba(78,232,200,0.14)',  border: 'rgba(78,232,200,0.4)' },
  gold: { key: 'gold', label: 'Or',    dot: '#c8a96e', soft: 'rgba(200,169,110,0.14)', border: 'rgba(200,169,110,0.4)' },
  pink: { key: 'pink', label: 'Rose',  dot: '#e05aaa', soft: 'rgba(224,90,170,0.14)',  border: 'rgba(224,90,170,0.4)' },
}

export function accentOf(cfg) {
  return ACTUALITE_ACCENTS[cfg?.accent] || ACTUALITE_ACCENTS.teal
}

const DEFAULT_CONFIG = {
  active: false,
  title: "L'actu du moment",
  subtitle: 'Les temps forts à ne pas manquer',
  accent: 'teal',
  eventIds: [],
}

// Normalise une config brute (Firestore ou saisie admin) en objet sûr : jamais
// d'undefined, types garantis, accent contraint à la palette. Idempotent.
export function normalizeActualite(raw) {
  const c = raw || {}
  return {
    active: c.active === true,
    title: (typeof c.title === 'string' && c.title.trim()) ? c.title.trim().slice(0, 80) : DEFAULT_CONFIG.title,
    subtitle: (typeof c.subtitle === 'string') ? c.subtitle.slice(0, 140) : DEFAULT_CONFIG.subtitle,
    accent: ACTUALITE_ACCENTS[c.accent] ? c.accent : 'teal',
    eventIds: Array.isArray(c.eventIds)
      ? [...new Set(c.eventIds.filter(v => v != null && v !== '').map(String))].slice(0, 12)
      : [],
    updatedAt: Number(c.updatedAt) || 0,
    updatedBy: typeof c.updatedBy === 'string' ? c.updatedBy : '',
  }
}

export function defaultActualite() {
  return { ...DEFAULT_CONFIG }
}

// Écoute temps réel de la config. callback reçoit toujours une config NORMALISÉE
// (config par défaut si le doc n'existe pas). Retourne l'unsubscribe — sûr à
// appeler même avant que le SDK ne soit chargé.
export function listenActualite(callback) {
  let unsub = () => {}
  let cancelled = false
  import('./firestore-sync').then(({ listenDoc }) => {
    if (cancelled) return
    unsub = listenDoc(ACTUALITE_PATH, raw => callback(normalizeActualite(raw)))
  }).catch(() => {})
  return () => { cancelled = true; unsub() }
}

// Sauvegarde (admin). Écriture serveur gardée par la règle app_config
// (agent-only). Retourne { ok } / { ok:false, error }.
export async function saveActualite(cfg, uid = '') {
  const { syncDocAwaitable } = await import('./firestore-sync')
  const clean = normalizeActualite(cfg)
  return syncDocAwaitable(ACTUALITE_PATH, {
    ...clean,
    updatedAt: Date.now(),
    updatedBy: uid || clean.updatedBy || '',
  })
}

// Sélectionne, DANS L'ORDRE CURÉ, les événements de la config qui sont encore
// pertinents à afficher (découvrables : non annulés, non privés, publiés, non
// terminés). `allEvents` = liste complète (statiques + créés). `now` injectable
// pour les tests. Un id qui ne correspond plus à rien est simplement ignoré.
export function resolveActualiteEvents(cfg, allEvents, now = Date.now()) {
  const c = normalizeActualite(cfg)
  if (!c.active || c.eventIds.length === 0) return []
  const byId = new Map((allEvents || []).map(e => [String(e.id), e]))
  const out = []
  for (const id of c.eventIds) {
    const ev = byId.get(String(id))
    if (ev && isClientDiscoverableEvent(ev, now)) out.push(ev)
  }
  return out
}
