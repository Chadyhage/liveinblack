import { getRegionName, normalizeRegionId } from './locations.js'

// Profils publics organisateurs + abonnements privés par utilisateur.
// Lecture instantanée via localStorage, persistance cross-device via Firestore.

const PROFILES_KEY = 'lib_organizer_profiles'
const followsKey = uid => `lib_organizer_follows_${uid}`
const notificationMarkerKey = uid => `lib_organizer_notification_markers_${uid}`

export const ORGANIZER_STATUSES = ['draft', 'public', 'hidden', 'suspended', 'pending_review']
export const RESERVED_ORGANIZER_SLUGS = new Set([
  'admin', 'support', 'login', 'register', 'api', 'dashboard',
  'prestataires', 'evenements', 'organisateurs', 'connexion', 'profil',
])

export const DEFAULT_NOTIFICATION_SETTINGS = {
  newEvent: true,
  ticketing: true,
  almostFull: true,
  scheduleChanges: true,
  newMedia: true,
  importantAnnouncements: true,
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export function slugifyOrganizer(value = '') {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54)
}

export function validateOrganizerSlug(value, profiles = [], currentId = null) {
  const slug = slugifyOrganizer(value)
  if (slug.length < 3) return { ok: false, slug, error: 'L’adresse personnalisée doit contenir au moins 3 caractères.' }
  if (RESERVED_ORGANIZER_SLUGS.has(slug)) return { ok: false, slug, error: 'Cette adresse personnalisée est réservée.' }
  const duplicate = profiles.some(p => p.id !== currentId && p.slug === slug)
  if (duplicate) return { ok: false, slug, error: 'Cette adresse personnalisée est déjà prise. Choisis-en une autre.' }
  return { ok: true, slug, error: '' }
}

export function makeUniqueOrganizerSlug(value, profiles = [], currentId = null) {
  let base = slugifyOrganizer(value) || 'organisateur'
  if (RESERVED_ORGANIZER_SLUGS.has(base)) base = `${base}-events`
  let slug = base
  let index = 2
  while (profiles.some(p => p.id !== currentId && p.slug === slug)) slug = `${base}-${index++}`
  return slug
}

export function getLocalOrganizerProfiles() {
  return readJson(PROFILES_KEY, [])
}

export function cacheOrganizerProfiles(items) {
  const clean = Array.isArray(items) ? items.filter(Boolean) : []
  writeJson(PROFILES_KEY, clean)
  return clean
}

export function getOrganizerProfile(identifier) {
  const target = decodeURIComponent(String(identifier || ''))
  return getLocalOrganizerProfiles().find(p => p.id === target || p.userId === target || p.slug === target) || null
}

export function createOrganizerProfileSeed(user, formData = {}, verified = false) {
  const uid = user?.uid || user?.id
  const profiles = getLocalOrganizerProfiles()
  const publicName = (formData.nomCommercial || formData.nomOrganisation || user?.name || 'Organisateur').trim()
  const regionId = normalizeRegionId(formData.pays)
  return {
    id: uid,
    userId: uid,
    publicName,
    slug: makeUniqueOrganizerSlug(publicName, profiles, uid),
    shortDescription: (formData.description || '').trim().slice(0, 180),
    longDescription: '',
    city: (formData.ville || '').trim(),
    country: (formData.pays || '').trim(),
    regionId,
    avatarUrl: user?.avatar || null,
    bannerUrl: null,
    status: 'draft',
    isPublic: false,
    isVerified: !!verified,
    socialLinks: {},
    eventTypes: [],
    vibes: [],
    followersCount: 0,
    totalEventsCount: 0,
    viewsCount: 0,
    eventClicksCount: 0,
    mediaViewsCount: 0,
    stats: { viewsCount: 0, eventClicksCount: 0, mediaViewsCount: 0 },
    media: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export async function saveOrganizerProfile(profile) {
  if (!profile?.id && !profile?.userId) return null
  const id = profile.id || profile.userId
  const profiles = getLocalOrganizerProfiles()
  const regionId = normalizeRegionId(profile.regionId || profile.country)
  const normalized = {
    ...profile,
    id,
    userId: id,
    publicName: (profile.publicName || 'Organisateur').trim(),
    slug: makeUniqueOrganizerSlug(profile.slug || profile.publicName, profiles, id),
    status: ORGANIZER_STATUSES.includes(profile.status) ? profile.status : 'draft',
    isPublic: profile.status === 'public',
    city: (profile.city || '').trim(),
    country: getRegionName(regionId) || (profile.country || '').trim(),
    regionId,
    followersCount: Math.max(0, Number(profile.followersCount) || 0),
    // Compteurs TOUJOURS présents et numériques : les règles Firestore comparent
    // `viewsCount == resource.viewsCount + 1` — si le champ manque sur le doc,
    // l'évaluation ÉCHOUE et tout le tracking vues/clics est refusé en silence.
    viewsCount: Math.max(0, Number(profile.viewsCount) || 0),
    eventClicksCount: Math.max(0, Number(profile.eventClicksCount) || 0),
    mediaViewsCount: Math.max(0, Number(profile.mediaViewsCount) || 0),
    updatedAt: Date.now(),
  }
  const next = [...profiles.filter(p => p.id !== id), normalized]
  cacheOrganizerProfiles(next)
  const { saveOrganizerProfileWithSlug } = await import('./firestore-sync')
  const result = await saveOrganizerProfileWithSlug(normalized)
  if (!result.ok) {
    cacheOrganizerProfiles(profiles)
    throw new Error(result.error || 'Impossible d’enregistrer la page organisateur.')
  }
  return normalized
}

export function getOrganizerFollows(uid) {
  return readJson(followsKey(uid), [])
}

export function cacheOrganizerFollows(uid, items) {
  if (!uid) return []
  const clean = Array.isArray(items) ? items.filter(Boolean) : []
  writeJson(followsKey(uid), clean)
  return clean
}

export function isFollowingOrganizer(uid, organizerId) {
  return getOrganizerFollows(uid).some(f => f.organizerId === organizerId && f.status === 'active')
}

export async function followOrganizer(uid, organizerId) {
  if (!uid || !organizerId || uid === organizerId) return getOrganizerFollows(uid)
  const all = getOrganizerFollows(uid)
  const existing = all.find(f => f.organizerId === organizerId)
  if (existing?.status === 'active') return all
  const now = Date.now()
  const item = {
    id: `${uid}__${organizerId}`,
    userId: uid,
    organizerId,
    notificationsEnabled: true,
    notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS, ...(existing?.notificationSettings || {}) },
    status: 'active',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  const next = [...all.filter(f => f.organizerId !== organizerId), item]
  cacheOrganizerFollows(uid, next)
  const { syncDocAwaitable, syncIncrement } = await import('./firestore-sync')
  const result = await syncDocAwaitable(`organizer_follows/${uid}`, { items: next, updatedAt: now })
  if (!result.ok) {
    cacheOrganizerFollows(uid, all)
    throw new Error(result.error || 'Abonnement impossible.')
  }
  syncIncrement(`organizer_profiles/${organizerId}`, 'followersCount', 1)
  return next
}

export async function unfollowOrganizer(uid, organizerId) {
  const all = getOrganizerFollows(uid)
  const previous = all.find(f => f.organizerId === organizerId)
  if (!previous || previous.status !== 'active') return all
  const next = all.map(f => f.organizerId === organizerId
    ? { ...f, status: 'unfollowed', notificationsEnabled: false, updatedAt: Date.now() }
    : f)
  cacheOrganizerFollows(uid, next)
  const { syncDocAwaitable, syncIncrement } = await import('./firestore-sync')
  const result = await syncDocAwaitable(`organizer_follows/${uid}`, { items: next, updatedAt: Date.now() })
  if (!result.ok) {
    cacheOrganizerFollows(uid, all)
    throw new Error(result.error || 'Désabonnement impossible.')
  }
  syncIncrement(`organizer_profiles/${organizerId}`, 'followersCount', -1)
  return next
}

export async function updateOrganizerFollow(uid, organizerId, patch) {
  const all = getOrganizerFollows(uid)
  const next = all.map(f => f.organizerId === organizerId ? {
    ...f,
    ...patch,
    notificationSettings: patch.notificationSettings
      ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...(f.notificationSettings || {}), ...patch.notificationSettings }
      : f.notificationSettings,
    updatedAt: Date.now(),
  } : f)
  cacheOrganizerFollows(uid, next)
  const { syncDocAwaitable } = await import('./firestore-sync')
  const result = await syncDocAwaitable(`organizer_follows/${uid}`, { items: next, updatedAt: Date.now() })
  if (!result.ok) throw new Error(result.error || 'Préférences non enregistrées.')
  return next
}

export async function reportOrganizer(uid, organizerId, reason, description = '') {
  const id = `org-report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const report = {
    id,
    reporterUserId: uid,
    organizerProfileId: organizerId,
    reason,
    description: description.trim().slice(0, 1200),
    status: 'new',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const { syncDocAwaitable } = await import('./firestore-sync')
  const result = await syncDocAwaitable(`organizer_reports/${id}`, report)
  if (!result.ok) throw new Error(result.error || 'Signalement non envoyé.')
  return report
}

export function startOrganizerNotificationBridge(uid) {
  if (!uid) return () => {}
  let stopEvents = () => {}
  let stopFollows = () => {}
  let stopProfiles = () => {}
  let currentFollows = getOrganizerFollows(uid)
  const markers = readJson(notificationMarkerKey(uid), {})

  const inspect = events => {
    const active = currentFollows.filter(f => f.status === 'active' && f.notificationsEnabled !== false)
    if (!active.length) return
    const byOrganizer = new Map(active.map(f => [f.organizerId, f]))
    for (const event of events || []) {
      if (event.isPrivate) continue
      const follow = byOrganizer.get(event.organizerId || event.createdBy)
      if (!follow) continue
      const publishedAt = Number(event.publishedAt || event.createdAt || event.id) || 0
      const organizerName = event.organizerName || event.organizer || 'Un organisateur suivi'
      const notify = (marker, type, body) => {
        if (markers[marker]) return
        markers[marker] = Date.now()
        import('./notifications').then(({ createNotification }) => {
          createNotification(uid, type, organizerName, body, { eventId: event.id, organizerId: event.organizerId || event.createdBy })
        }).catch(() => {})
      }
      if (publishedAt > (follow.createdAt || 0) && follow.notificationSettings?.newEvent !== false) {
        notify(`event:${event.id}`, 'organizer_new_event', `vient de publier un nouvel événement : ${event.name}.`)
      }
      if (event.cancelled && follow.notificationSettings?.scheduleChanges !== false) {
        notify(`cancelled:${event.id}`, 'organizer_event_update', `L’événement ${event.name} a été annulé.`)
      } else if ((event.postponed || event.status === 'postponed') && follow.notificationSettings?.scheduleChanges !== false) {
        notify(`postponed:${event.id}`, 'organizer_event_update', `L’événement ${event.name} a été reporté.`)
      }
      const places = event.places || []
      const total = places.reduce((sum, place) => sum + (Number(place.total) || 0), 0)
      const remaining = places.reduce((sum, place) => sum + (Number(place.available) || 0), 0)
      if (!event.cancelled && total > 0 && remaining > 0 && remaining / total <= .15 && follow.notificationSettings?.almostFull !== false) {
        notify(`almost-full:${event.id}`, 'organizer_almost_full', `L’événement ${event.name} est bientôt complet.`)
      }
    }
    const recent = Object.fromEntries(Object.entries(markers).sort((a, b) => b[1] - a[1]).slice(0, 250))
    writeJson(notificationMarkerKey(uid), recent)
  }

  const inspectMedia = profiles => {
    const active = new Map(currentFollows
      .filter(f => f.status === 'active' && f.notificationsEnabled !== false && f.notificationSettings?.newMedia !== false)
      .map(f => [f.organizerId, f]))
    for (const profile of profiles || []) {
      const follow = active.get(profile.id)
      if (!follow) continue
      for (const media of (profile.media || [])) {
        if (media.visibility === 'hidden' || (media.createdAt || 0) <= (follow.createdAt || 0)) continue
        const marker = `media:${media.id}`
        if (markers[marker]) continue
        markers[marker] = Date.now()
        import('./notifications').then(({ createNotification }) => {
          createNotification(uid, 'organizer_new_media', profile.publicName || 'Un organisateur suivi', 'vient de publier un nouveau média.', { organizerId: profile.id, mediaId: media.id })
        }).catch(() => {})
      }
    }
    writeJson(notificationMarkerKey(uid), Object.fromEntries(Object.entries(markers).sort((a, b) => b[1] - a[1]).slice(0, 250)))
  }

  import('./firestore-sync').then(({ listenOrganizerFollows, listenEvents, listenOrganizerProfiles }) => {
    stopFollows = listenOrganizerFollows(uid, items => {
      currentFollows = cacheOrganizerFollows(uid, items)
    })
    stopEvents = listenEvents(inspect)
    stopProfiles = listenOrganizerProfiles(inspectMedia)
  }).catch(() => {})

  return () => { stopEvents(); stopFollows(); stopProfiles() }
}
