// ─── Firestore Write-Through Cache ────────────────────────────────────────────
// Pattern: localStorage = instant reads (sync), Firestore = persistence + cross-device
// Every write → localStorage first (existing behavior) then fire-and-forget to Firestore
// On login → pull from Firestore into localStorage (async)

import { db } from '../firebase'
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, onSnapshot, increment, runTransaction } from 'firebase/firestore'

// ── Merge concurrent-safe d'un tableau d'items keyés par id ───────────────────
// Écrire le tableau complet depuis le cache local = « dernier écrivain gagne » :
// deux appareils (ex. deux videurs sur la guestlist) s'écrasent mutuellement.
// Ici : transaction Firestore = lire l'état SERVEUR, y appliquer nos upserts/
// suppressions, écrire — atomique, aucun ajout concurrent perdu.
// Renvoie le tableau mergé (pour rafraîchir le cache local), ou null si échec.
// Options avancées (pour le POS commande, où l'objet ne doit PAS être écrasé
// aveuglément par une version issue d'un cache local périmé) :
//  - patches      : [{ id, set, requireUnserved, requireUnpaid }] → fusion de
//                   CHAMPS sur l'item SERVEUR, uniquement si la garde tient
//                   (empêche de ré-ouvrir une ligne servie/payée + préserve les
//                   champs concurrents comme quantity édités ailleurs).
//  - insertOnly   : [item] → insère seulement si l'id est ABSENT côté serveur
//                   (matérialisation de préco non destructive).
//  - guardedRemoveIds : [{ id, requireUnserved, requireUnpaid }] → suppression
//                   seulement si la garde tient côté serveur.
// La garde s'évalue contre l'état SERVEUR lu dans la transaction, jamais le cache.
const _served = it => it && it.status === 'served' // même valeur pour préco et sur-place
export async function mergeItemsById(path, { field = 'items', idKey = 'id', upserts = [], removeIds = [], patches = [], insertOnly = [], guardedRemoveIds = [] } = {}) {
  try {
    const [col, id] = path.split('/')
    const ref = doc(db, col, id)
    const removeSet = new Set(removeIds.map(String))
    let result = null
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      const remote = (snap.exists() && Array.isArray(snap.data()[field])) ? snap.data()[field] : []
      const byId = new Map(remote.map(it => [String(it[idKey]), it]))
      for (const it of upserts) byId.set(String(it[idKey]), it)
      for (const it of insertOnly) { const k = String(it[idKey]); if (!byId.has(k)) byId.set(k, it) }
      for (const p of patches) {
        const cur = byId.get(String(p.id))
        if (!cur) continue
        if (p.requireUnserved && _served(cur)) continue
        if (p.requireUnpaid && cur.paid_at) continue
        byId.set(String(p.id), { ...cur, ...p.set })
      }
      for (const rid of removeSet) byId.delete(rid)
      for (const g of guardedRemoveIds) {
        const cur = byId.get(String(g.id))
        if (!cur) continue
        if (g.requireUnserved && _served(cur)) continue
        if (g.requireUnpaid && cur.paid_at) continue
        byId.delete(String(g.id))
      }
      result = [...byId.values()]
      tx.set(ref, { [field]: result, updatedAt: new Date().toISOString() }, { merge: true })
    })
    return result
  } catch (e) {
    console.warn('[sync] mergeItemsById failed:', path, e?.message)
    return null
  }
}

// ── Real-time listeners ────────────────────────────────────────────────────────
// Each returns an unsubscribe function. Call it on unmount to stop listening.

// Listen to the public events collection (all published events — real-time)
export function listenEvents(callback) {
  try {
    return onSnapshot(collection(db, 'events'), snap => {
      const evts = snap.docs.map(d => ({ ...d.data(), id: d.data().id || d.id }))
      callback(evts)
    }, () => {})
  } catch { return () => {} }
}

// Pages publiques organisateurs. La requête porte explicitement sur `public`
// pour rester compatible avec les règles : brouillons/masqués/suspendus ne sont
// jamais téléchargés par un visiteur.
export function listenOrganizerProfiles(callback) {
  try {
    const q = query(collection(db, 'organizer_profiles'), where('status', '==', 'public'))
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({ ...d.data(), id: d.data().id || d.id, userId: d.data().userId || d.id })))
    }, () => {})
  } catch { return () => {} }
}

export function listenAllOrganizerProfiles(callback) {
  try {
    return onSnapshot(collection(db, 'organizer_profiles'), snap => {
      callback(snap.docs.map(d => ({ ...d.data(), id: d.data().id || d.id, userId: d.data().userId || d.id })))
    }, () => {})
  } catch { return () => {} }
}

// Version propriétaire/admin, utilisée par le studio et la modération.
export function listenOrganizerProfile(uid, callback) {
  try {
    if (!uid) return () => {}
    return onSnapshot(doc(db, 'organizer_profiles', uid), snap => {
      callback(snap.exists() ? { ...snap.data(), id: snap.data().id || snap.id, userId: snap.data().userId || snap.id } : null)
    }, () => {})
  } catch { return () => {} }
}

// Les abonnements sont un document privé par utilisateur : un organisateur ne
// peut pas interroger la liste nominative de ses abonnés.
export function listenOrganizerFollows(uid, callback) {
  try {
    if (!uid) return () => {}
    return onSnapshot(doc(db, 'organizer_follows', uid), snap => {
      callback(snap.exists() ? (snap.data().items || []) : [])
    }, () => {})
  } catch { return () => {} }
}

export function listenOrganizerReports(callback) {
  try {
    return onSnapshot(collection(db, 'organizer_reports'), snap => {
      callback(snap.docs.map(d => ({ ...d.data(), id: d.data().id || d.id })))
    }, () => {})
  } catch { return () => {} }
}

// Listen to an organizer's own created events (user_events/{uid})
export function listenUserEvents(uid, callback) {
  try {
    if (!uid) return () => {}
    return onSnapshot(doc(db, 'user_events', uid), snap => {
      callback(snap.exists() ? (snap.data().items || []) : [])
    }, () => {})
  } catch { return () => {} }
}

// Listen to the GLOBAL boosts collection (boosts/{boostId} — écrits par le webhook
// Stripe). C'est la source de vérité partagée du Top 3 : un boost acheté par un
// organisateur doit apparaître dans le Top 3 de TOUS les visiteurs de sa région,
// pas seulement dans le navigateur de l'acheteur (lib_boosts local ne contient
// que ses propres boosts). Filtre les boosts expirés côté client.
export function listenBoosts(callback) {
  try {
    return onSnapshot(collection(db, 'boosts'), snap => {
      const now = Date.now()
      const boosts = snap.docs
        .map(d => ({ ...d.data(), id: d.data().id || d.id }))
        .filter(b => {
          try { return new Date(b.expiresAt).getTime() > now } catch { return false }
        })
      callback(boosts)
    }, () => {})
  } catch { return () => {} }
}

// Charge tous les billets (registre tickets/) pour une liste d'eventIds.
// C'est la VRAIE source de ventes d'un organisateur (cross-device, écrite par
// le webhook Stripe + le flux client), contrairement à lib_bookings (per-device).
// Renvoie un tableau de billets : { ticketCode, eventId, place, userId, paid, source, bookedAt }.
export async function loadTicketsForEvents(eventIds) {
  const ids = [...new Set((eventIds || []).map(String))].filter(Boolean)
  if (!ids.length) return []
  try {
    const out = []
    // where('eventId','in', …) limité à 10 valeurs → on découpe en lots
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10)
      const q = query(collection(db, 'tickets'), where('eventId', 'in', chunk))
      const snap = await getDocs(q)
      snap.forEach(d => out.push({ ...d.data(), ticketCode: d.data().ticketCode || d.id }))
    }
    return out
  } catch (e) {
    console.warn('[sync] loadTicketsForEvents failed:', e.message)
    return []
  }
}

// Listen to ALL prestataire catalogs (collection catalogs/{userId}). Comme les
// boosts, un catalogue doit être visible par les ACHETEURS (organisateurs/agents)
// sur n'importe quel device — or getCatalog() ne lit que le localStorage du user
// courant. Renvoie un map { userId: items[] } pour la marketplace.
export function listenCatalogs(callback) {
  try {
    return onSnapshot(collection(db, 'catalogs'), snap => {
      const byUser = {}
      snap.docs.forEach(d => { byUser[d.id] = d.data().items || [] })
      callback(byUser)
    }, () => {})
  } catch { return () => {} }
}

// Listen to ALL prestataire profiles (collection providers/{uid}). L'annuaire de
// la marketplace doit montrer les profils créés sur N'IMPORTE QUEL device, pas
// seulement lib_provider_profiles local. Renvoie le tableau des profils.
export function listenProviders(callback) {
  try {
    return onSnapshot(collection(db, 'providers'), snap => {
      const list = snap.docs.map(d => ({ ...d.data(), userId: d.data().userId || d.id }))
      callback(list)
    }, () => {})
  } catch { return () => {} }
}

export function listenDoc(path, callback) {
  try {
    const ref = doc(db, ...path.split('/'))
    return onSnapshot(ref, snap => {
      callback(snap.exists() ? snap.data() : null)
    }, () => {})
  } catch { return () => {} }
}

// Listen to incoming friend requests for a specific user
export function listenFriendRequests(toId, callback) {
  try {
    const q = query(collection(db, 'friend_requests'), where('toId', '==', toId))
    return onSnapshot(q, snap => callback(snap.docs.map(d => ({ ...d.data(), _docId: d.id }))), () => {})
  } catch { return () => {} }
}

// Listen to direct conversations for a user
export function listenDirectConversations(uid, callback) {
  try {
    const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid))
    return onSnapshot(q, snap => callback(snap.docs.map(d => ({ ...d.data(), _docId: d.id }))), () => {})
  } catch { return () => {} }
}

// Listen to group conversations for a user
export function listenGroupConversations(uid, callback) {
  try {
    const q = query(collection(db, 'conversations'), where('participantIds', 'array-contains', uid))
    return onSnapshot(q, snap => callback(snap.docs.map(d => ({ ...d.data(), _docId: d.id }))), () => {})
  } catch { return () => {} }
}

// Listen to the group bookings a user participates in — temps réel des
// validations/paiements pour que la carte de résa de groupe se mette à jour
// sans rafraîchir la page quand un autre membre valide ou paie.
export function listenGroupBookings(uid, callback) {
  try {
    const q = query(collection(db, 'group_bookings'), where('participantIds', 'array-contains', uid))
    return onSnapshot(q, snap => callback(snap.docs.map(d => ({ ...d.data(), id: d.data().id || d.id }))), () => {})
  } catch { return () => {} }
}

// Listen to a user's presence (lastSeen / isOnline) — for MessagingPage "En ligne" indicator
export function listenUserPresence(userId, callback) {
  try {
    const ref = doc(db, 'users', userId)
    return onSnapshot(ref, snap => {
      if (!snap.exists()) return
      const data = snap.data()
      callback({ lastSeen: data.lastSeen || null, isOnline: data.isOnline || false })
    }, () => {})
  } catch { return () => {} }
}

// Listen to messages for a specific conversation
export function listenConvMessages(convId, callback) {
  try {
    const ref = doc(db, 'conv_messages', convId)
    return onSnapshot(ref, snap => callback(snap.exists() ? snap.data() : null), () => {})
  } catch { return () => {} }
}

// Listen to the authoritative ticket registry for one event. The organizer
// statistics page uses this stream so sales and check-ins update cross-device.
export function listenTicketsForEvent(eventId, callback, onError = () => {}) {
  try {
    if (!eventId) return () => {}
    const q = query(collection(db, 'tickets'), where('eventId', '==', String(eventId)))
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({ ...d.data(), ticketCode: d.data().ticketCode || d.id })))
    }, onError)
  } catch (error) {
    onError(error)
    return () => {}
  }
}

// Like/unlike transactionnel d'un morceau de playlist. Incrémente le compteur
// sur l'état SERVEUR (pas l'état local) : deux likes simultanés donnent bien +2,
// et les positions sur l'écran DJ ne sautent plus de façon erratique.
export async function adjustPlaylistLike(eventId, songId, delta) {
  try {
    const ref = doc(db, 'event_playlists', String(eventId))
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists()) return
      const songs = Array.isArray(snap.data().songs) ? snap.data().songs : []
      const next = songs.map(s => String(s.id) === String(songId)
        ? { ...s, likes: Math.max(0, (Number(s.likes) || 0) + delta) }
        : s)
      tx.set(ref, { songs: next, updatedAt: new Date().toISOString() }, { merge: true })
    })
    return true
  } catch (e) {
    console.warn('[sync] adjustPlaylistLike failed:', e?.message)
    return false
  }
}

// Listen to friends/social data for a user
export function listenUserSocial(uid, callback) {
  try {
    const ref = doc(db, 'user_social', uid)
    return onSnapshot(ref, snap => callback(snap.exists() ? snap.data() : null), () => {})
  } catch { return () => {} }
}

// Exported so MessagingPage can use it for local merges
export { mergeById }

// ── Explicit user profile push ───────────────────────────────────────────────
// Call this EXPLICITLY at register/login/profile-update with the trusted userData.
// Never reads from lib_user (which can be stale during account switching).
export function syncUserProfile(uid, userData) {
  if (!uid || !userData) return
  const profile = {
    id: uid,
    uid, // legacy compat — some docs use uid
    name: userData.name || '',
    email: userData.email || '',
    avatar: userData.avatar || null,
    username: userData.username || generateUsername(userData.name || userData.email || uid),
  }
  syncDoc(`users/${uid}`, profile)

  // Also update lib_users localStorage immediately so getUserById() works at once
  // (syncOnLogin runs async and may not complete before messaging features are used)
  try {
    const all = JSON.parse(localStorage.getItem('lib_users') || '[]')
    const idx = all.findIndex(u => (u.uid || u.id) === uid)
    const merged = { ...profile, ...userData, uid, id: uid }
    if (idx >= 0) all[idx] = { ...all[idx], ...merged }
    else all.push(merged)
    localStorage.setItem('lib_users', JSON.stringify(all))
  } catch {}
}

// ── Core helpers ──────────────────────────────────────────────────────────────

// Fire-and-forget write (merge mode — won't overwrite fields not in data)
export function syncDoc(path, data) {
  try {
    const segments = path.split('/')
    const ref = doc(db, ...segments)
    setDoc(ref, { ...data, _syncedAt: Date.now() }, { merge: true })
      .catch(e => console.warn('[sync] write:', path, e.message))
  } catch (e) { console.warn('[sync]', e.message) }
}

// Variante awaitable — retourne { ok: true } ou { ok: false, error: string }
// Utile quand on doit savoir si l'écriture a réussi (ex: publication d'event)
export async function syncDocAwaitable(path, data) {
  try {
    const segments = path.split('/')
    const ref = doc(db, ...segments)
    await setDoc(ref, { ...data, _syncedAt: Date.now() }, { merge: true })
    return { ok: true }
  } catch (e) {
    console.error('[sync] AWAIT write FAILED:', path, e.code, e.message)
    return { ok: false, error: e.message || String(e), code: e.code }
  }
}

// Réservation atomique d'un slug organisateur + sauvegarde du profil. Deux
// utilisateurs qui choisissent le même slug au même instant ne peuvent pas
// tous les deux réussir.
export async function saveOrganizerProfileWithSlug(profile) {
  try {
    const profileRef = doc(db, 'organizer_profiles', profile.id)
    const slugRef = doc(db, 'organizer_slugs', profile.slug)
    await runTransaction(db, async tx => {
      const [profileSnap, slugSnap] = await Promise.all([tx.get(profileRef), tx.get(slugRef)])
      if (slugSnap.exists() && slugSnap.data().organizerId !== profile.id) {
        throw new Error('Ce slug est déjà utilisé.')
      }
      const oldSlug = profileSnap.exists() ? profileSnap.data().slug : null
      if (oldSlug && oldSlug !== profile.slug) {
        const oldRef = doc(db, 'organizer_slugs', oldSlug)
        const oldSnap = await tx.get(oldRef)
        if (oldSnap.exists() && oldSnap.data().organizerId === profile.id) tx.delete(oldRef)
      }
      tx.set(slugRef, { organizerId: profile.id, updatedAt: Date.now() })
      tx.set(profileRef, { ...profile, _syncedAt: Date.now() }, { merge: true })
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message || String(e), code: e.code }
  }
}

// Incrément ATOMIQUE d'un champ numérique côté serveur (FieldValue.increment).
// Évite les pertes du pattern read-modify-write (multi-onglet, double-clic) :
// deux incréments concurrents s'additionnent au lieu de s'écraser. Utilisé pour
// les points de fidélité, comme le fait déjà le webhook Stripe.
export function syncIncrement(path, field, amount) {
  try {
    const ref = doc(db, ...path.split('/'))
    setDoc(ref, { [field]: increment(amount), _syncedAt: Date.now() }, { merge: true })
  } catch (e) {
    console.warn('[sync] increment failed:', path, e.message)
  }
}

// Fire-and-forget full overwrite (replaces entire doc)
export function syncDocOverwrite(path, data) {
  try {
    const ref = doc(db, ...path.split('/'))
    setDoc(ref, { ...data, _syncedAt: Date.now() })
      .catch(e => console.warn('[sync] overwrite:', path, e.message))
  } catch (e) { console.warn('[sync]', e.message) }
}

// Fire-and-forget delete
export function syncDelete(path) {
  try {
    const ref = doc(db, ...path.split('/'))
    deleteDoc(ref).catch(e => console.warn('[sync] delete:', path, e.message))
  } catch (e) { console.warn('[sync]', e.message) }
}

// Async read — returns null if missing
export async function loadDoc(path) {
  try {
    const ref = doc(db, ...path.split('/'))
    const snap = await getDoc(ref)
    return snap.exists() ? snap.data() : null
  } catch (e) { console.warn('[sync] load:', path, e.message); return null }
}

// Async query collection
export async function loadCollection(collPath, conditions = []) {
  try {
    const ref = collection(db, collPath)
    const q = conditions.length ? query(ref, ...conditions) : ref
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ ...d.data(), _docId: d.id }))
  } catch (e) { console.warn('[sync] query:', collPath, e.message); return [] }
}

// ── Merge helper: remote items win on ID conflict ─────────────────────────────
function mergeById(local, remote, idField = 'id') {
  const remoteIds = new Set(remote.map(r => r[idField]))
  const onlyLocal = local.filter(l => !remoteIds.has(l[idField]))
  return [...remote, ...onlyLocal]
}

// Réconcilie la liste locale des events créés avec un instantané COMPLET de
// Firestore (collection publique `events/`). Corrige le bug « un event supprimé
// ne disparaît jamais du cache local » : avant, tout event local absent de
// Firestore était conservé indéfiniment (traité comme « local-only »).
//
// Règle : on garde un event local absent de Firestore UNIQUEMENT s'il est
// marqué `_pendingSync` (création locale pas encore synchronisée). Dès qu'un
// event apparaît dans Firestore, sa version serveur (sans le flag) remplace la
// version locale → s'il est supprimé ensuite, il n'a plus de flag et disparaît.
// ⚠️ Ne pas utiliser avec un instantané PARTIEL (ex: user_events d'un seul orga).
export function reconcileCreatedEvents(prevList, incoming) {
  const inc = Array.isArray(incoming) ? incoming : []
  const incomingIds = new Set(inc.map(e => String(e.id)))
  const pendingLocal = (Array.isArray(prevList) ? prevList : []).filter(
    e => e && e._pendingSync === true && !incomingIds.has(String(e.id))
  )
  return [...inc, ...pendingLocal]
}

// ── Master sync: pull all Firestore data → localStorage on login ──────────────
// opts.light : resync de focus d'onglet — saute les scans de collections
// entières (users, events, pending_validations) qui coûtent cher en lectures
// Firestore et bloquent le thread principal. Le full sync ne tourne qu'au login.
export async function syncOnLogin(uid, opts = {}) {
  const light = !!opts.light
  if (!uid) return
  console.log(`[sync] ${light ? 'Light' : 'Full'} sync starting for`, uid)

  try {
    // ── 0. User profile (metadata only — never email/name) ──
    // Firebase Auth is the source of truth for email & name. LoginPage writes them
    // to lib_user from auth.currentUser. We MUST NOT let Firestore overwrite them,
    // because legacy corrupted users/{uid} docs (from the rename race bug) would
    // re-poison lib_user on every login. Only merge safe metadata fields.
    const userProfile = await loadDoc(`users/${uid}`)
    if (userProfile) {
      try {
        const current = JSON.parse(localStorage.getItem('lib_user') || 'null')
        // Garde anti-race : ne merger que si la session active correspond toujours
        // au uid demandé (sinon un sync en vol pollue la session d'un autre compte)
        if (current && current.uid === uid) {
          const safeMeta = {}
          if (userProfile.avatar != null) safeMeta.avatar = userProfile.avatar
          if (userProfile.username) safeMeta.username = userProfile.username
          if (userProfile.nameChangedAt != null) safeMeta.nameChangedAt = userProfile.nameChangedAt
          // Préférences de goûts (recommandations) : rapatriées SEULEMENT si plus
          // récentes que le local (updatedAt) — sinon un sync en vol écraserait
          // des goûts fraîchement enregistrés sur cet appareil.
          if (userProfile.preferences
              && (userProfile.preferences.updatedAt || 0) >= (current.preferences?.updatedAt || 0)) {
            safeMeta.preferences = userProfile.preferences
          }
          const merged = { ...current, ...safeMeta }
          localStorage.setItem('lib_user', JSON.stringify(merged))
        }
      } catch {}
    }

    // ── 1. (Wallet retiré — paiements via Stripe) ──

    // ── 2. Bookings ──
    const bookingsDoc = await loadDoc(`user_bookings/${uid}`)
    if (bookingsDoc?.items?.length) {
      const local = safeParseArray('lib_bookings')
      localStorage.setItem('lib_bookings', JSON.stringify(mergeById(local, bookingsDoc.items)))
    }

    // ── 2b. Events privés débloqués (codes d'accès) ──
    // Le déblocage doit suivre l'utilisateur : débloqué/acheté sur PC, le billet
    // doit rester accessible sur téléphone (le code d'accès est à usage unique,
    // impossible de le re-saisir sur le second appareil).
    const accessDoc = await loadDoc(`user_private_access/${uid}`)
    if (accessDoc?.items?.length) {
      const local = safeParseArray('lib_unlocked_events')
      const merged = [...new Set([...local.map(String), ...accessDoc.items.map(String)])]
      localStorage.setItem('lib_unlocked_events', JSON.stringify(merged))
    }

    // ── 3. Created events ──
    const eventsDoc = await loadDoc(`user_events/${uid}`)
    if (eventsDoc?.items?.length) {
      const local = safeParseArray('lib_created_events')
      localStorage.setItem('lib_created_events', JSON.stringify(mergeById(local, eventsDoc.items)))
    }

    // ── 3.5. [RETIRÉ] Auto-delete orphan events ──
    // Ce code supprimait dangereusement des events publics présents en local
    // mais créés par un autre user (ex: events cachés par fetchEventById sur la
    // fiche d'un événement). Résultat : l'event "disparaissait" pour le visiteur
    // après chaque login, alors qu'il était toujours bien sur Firestore.
    // Si jamais il faut nettoyer des events réellement orphelins (ex: comptes
    // supprimés), ça doit se faire côté admin via une fonction dédiée, pas
    // automatiquement dans syncOnLogin.

    // ── 4. Conversations (directs + groupes) ──
    const [directConvsSnap, groupConvsSnap] = await Promise.all([
      loadCollection('conversations', [where('participants', 'array-contains', uid)]),
      loadCollection('conversations', [where('participantIds', 'array-contains', uid)]),
    ])
    // Deduplicate by id (participants query and participantIds query may return same conv)
    const seen = new Set()
    const allConvsSnap = [...directConvsSnap, ...groupConvsSnap].filter(c => {
      const id = c.id || c._docId
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    if (allConvsSnap.length) {
      const local = safeParseArray('lib_conversations')
      localStorage.setItem('lib_conversations', JSON.stringify(mergeById(local, allConvsSnap)))
    }

    // Préférences sociales avant les messages : une conversation masquée par
    // cet utilisateur ne doit pas être réhydratée inutilement sur cet appareil.
    const social = await loadDoc(`user_social/${uid}`)
    if (social?.hiddenConversations) {
      const hidden = safeParseObj('lib_hidden_conversations')
      hidden[uid] = social.hiddenConversations.map(String)
      localStorage.setItem('lib_hidden_conversations', JSON.stringify(hidden))
    }

    // ── 5. Messages for each conversation ──
    const allMessages = safeParseObj('lib_messages')
    const hiddenConversationIds = new Set((social?.hiddenConversations || []).map(String))
    const convIds = allConvsSnap.map(c => c.id || c._docId).filter(id => !hiddenConversationIds.has(String(id)))
    for (const cid of convIds) {
      const msgDoc = await loadDoc(`conv_messages/${cid}`)
      if (msgDoc?.items?.length) {
        const localMsgs = allMessages[cid] || []
        allMessages[cid] = mergeById(localMsgs, msgDoc.items)
      }
    }
    if (allConvsSnap.length) localStorage.setItem('lib_messages', JSON.stringify(allMessages))

    // ── 6. Friends + Blocked ──
    if (social) {
      if (social.friends) {
        const f = safeParseObj('lib_friends')
        f[uid] = social.friends
        localStorage.setItem('lib_friends', JSON.stringify(f))
      }
      if (social.blocked) {
        const b = safeParseObj('lib_blocked')
        b[uid] = social.blocked
        localStorage.setItem('lib_blocked', JSON.stringify(b))
      }
      if (social.mutedConvs) {
        const m = safeParseObj('lib_muted_convs')
        m[uid] = social.mutedConvs
        localStorage.setItem('lib_muted_convs', JSON.stringify(m))
      }
      if (social.starred) {
        const starred = safeParseObj('lib_starred')
        starred[uid] = social.starred
        localStorage.setItem('lib_starred', JSON.stringify(starred))
      }
    }

    // ── 7. Friend requests (to me) ──
    const reqsSnap = await loadCollection('friend_requests', [where('toId', '==', uid)])
    if (reqsSnap.length) {
      const local = safeParseArray('lib_friend_requests')
      localStorage.setItem('lib_friend_requests', JSON.stringify(mergeById(local, reqsSnap)))
    }

    // ── 8. Catalog ──
    // Garde anti-écrasement (même logique que le listener de ProposerServicesPage) :
    // un doc distant périmé ou vide ne doit pas effacer un catalogue local plus récent.
    const catalog = await loadDoc(`catalogs/${uid}`)
    if (catalog?.items) {
      const localItems = safeParseArray(`lib_catalog_${uid}`)
      const localCatalogTs = localStorage.getItem(`lib_catalog_ts_${uid}`) || ''
      const remoteCatalogTs = catalog.updatedAt || ''
      const remoteIsStale = (remoteCatalogTs && localCatalogTs)
        ? remoteCatalogTs < localCatalogTs
        : (catalog.items.length === 0 && localItems.length > 0)
      if (!remoteIsStale) {
        localStorage.setItem(`lib_catalog_${uid}`, JSON.stringify(catalog.items))
        if (remoteCatalogTs) localStorage.setItem(`lib_catalog_ts_${uid}`, remoteCatalogTs)
      }
    }

    // ── 9. Provider profile ──
    const provider = await loadDoc(`providers/${uid}`)
    if (provider) {
      const profiles = safeParseArray('lib_provider_profiles')
      const idx = profiles.findIndex(p => p.userId === uid)
      if (idx >= 0) profiles[idx] = provider; else profiles.push(provider)
      localStorage.setItem('lib_provider_profiles', JSON.stringify(profiles))
    }

    // ── 10. Users (contacts cross-device) — READ ONLY, never push here ──
    // (Push is handled by syncUserProfile() called explicitly at login/register/profile-update)
    // This prevents a race: if syncOnLogin(A) is still running when the user logs in as B,
    // a stale read of lib_user (now containing B's data) would overwrite users/A with B's name.
    // ⚠ Scan de la collection ENTIÈRE : réservé au full sync (login). En light
    // (focus d'onglet), ce scan coûtait des milliers de lectures + un JSON.parse
    // bloquant sur mobile — à chaque changement d'onglet.
    if (!light) {
      const usersSnap = await loadCollection('users')
      // Firestore est source de vérité — on écrase lib_users entièrement
      // pour ne jamais afficher d'anciens comptes supprimés ou comptes démo
      const normalizedUsers = usersSnap.map(u => ({ ...u, id: u.id || u.uid || u._docId }))
      localStorage.setItem('lib_users', JSON.stringify(normalizedUsers))
    }

    // ── 10-bis. Service orders (only this user's orders as buyer or seller) ──
    const [buyerOrders, sellerOrders] = await Promise.all([
      loadCollection('service_orders', [where('buyerId', '==', uid)]),
      loadCollection('service_orders', [where('sellerId', '==', uid)]),
    ])
    const allOrders = [...buyerOrders, ...sellerOrders].filter((o, i, arr) => arr.findIndex(x => (x.id || x._docId) === (o.id || o._docId)) === i)
    if (allOrders.length) localStorage.setItem('lib_service_orders', JSON.stringify(allOrders))

    // ── 11. Group bookings ──
    const gBookings = await loadCollection('group_bookings', [where('participantIds', 'array-contains', uid)])
    if (gBookings.length) {
      const obj = {}
      gBookings.forEach(gb => { obj[gb.id || gb._docId] = gb })
      localStorage.setItem('lib_group_bookings', JSON.stringify(obj))
    }

    // ── 12. Boosts ──
    const boosts = await loadDoc(`user_boosts/${uid}`)
    if (boosts?.items) localStorage.setItem('lib_boosts', JSON.stringify(boosts.items))

    // ── 13. Used tickets ──
    const usedTix = await loadDoc(`used_tickets/${uid}`)
    if (usedTix?.items) localStorage.setItem('lib_used_tickets', JSON.stringify(usedTix.items))

    // ── 13b. Notifications in-app (cross-device) ──
    try {
      const { syncNotificationsFromFirestore } = await import('./notifications')
      await syncNotificationsFromFirestore(uid)
    } catch {}

    // ── 14. Reports (only reports submitted by this user) ──
    const reports = await loadCollection('reports', [where('fromId', '==', uid)])
    if (reports.length) localStorage.setItem('lib_reports', JSON.stringify(reports))

    // ── 15. Public events (shared collection — all organizers) ──
    // Light sync : inutile, EventsPage/HomePage écoutent déjà la collection en
    // temps réel via listenEvents (onSnapshot).
    const publicEvents = light ? [] : await loadCollection('events')
    if (publicEvents.length) {
      const localEvents = safeParseArray('lib_created_events')
      // reconcile (pas mergeById) : retire les events supprimés côté Firestore,
      // garde uniquement les créations locales encore _pendingSync.
      localStorage.setItem('lib_created_events', JSON.stringify(reconcileCreatedEvents(localEvents, publicEvents)))
    }

    // ── 16. Pending validations + role requests — AGENTS uniquement ──
    // Les règles Firestore rejetaient déjà cette lecture pour les non-agents
    // (d'où le spam « Missing or insufficient permissions » en console) : on
    // ne tente même plus la requête pour un client/organisateur.
    const myRole = (() => { try { return JSON.parse(localStorage.getItem('lib_user') || '{}').role } catch { return null } })()
    const pendingSnap = (!light && (myRole === 'agent' || myRole === 'admin')) ? await loadCollection('pending_validations') : []
    if (pendingSnap.length) {
      const validations = pendingSnap.filter(p => p.type !== 'role_request' && p.status === 'pending')
      const roleReqs = pendingSnap.filter(p => p.type === 'role_request' && p.status === 'pending')
      // Always overwrite local with the filtered Firestore list (removes approved/rejected items)
      const local = safeParseArray('lib_pending_validations')
      const filtered = local.filter(p => p.status === 'pending')
      localStorage.setItem('lib_pending_validations', JSON.stringify(mergeById(filtered, validations, 'uid')))
      if (roleReqs.length) {
        const localRR = safeParseArray('lib_role_requests')
        const filteredRR = localRR.filter(r => r.status === 'pending')
        localStorage.setItem('lib_role_requests', JSON.stringify(mergeById(filteredRR, roleReqs)))
      }
    }

    // ── 17. Last-read timestamps ──
    const readStatus = await loadDoc(`user_read_status/${uid}`)
    if (readStatus) {
      try {
        const current = JSON.parse(localStorage.getItem('lib_last_read') || '{}')
        // Take the LATER of local vs Firestore (don't un-read things)
        Object.entries(readStatus).forEach(([cid, ts]) => {
          if (!current[cid] || ts > current[cid]) current[cid] = ts
        })
        localStorage.setItem('lib_last_read', JSON.stringify(current))
      } catch {}
    }

    console.log('[sync] Full sync complete')
    // Notify UI components so they re-read from localStorage
    window.dispatchEvent(new CustomEvent('lib:sync-complete', { detail: { uid } }))
  } catch (e) {
    console.warn('[sync] syncOnLogin error:', e.message)
  }
}

// ── Push all local data to Firestore (for first-time sync from existing device) ──
export async function pushLocalToFirestore(uid) {
  if (!uid) return
  console.log('[sync] Pushing local data to Firestore for', uid)

  try {
    // (Wallet retiré — paiements via Stripe)

    // Bookings
    const bookings = safeParseArray('lib_bookings').filter(b => b.userId === uid)
    if (bookings.length) syncDoc(`user_bookings/${uid}`, { items: bookings })

    // Created events
    const events = safeParseArray('lib_created_events').filter(e => e.createdBy === uid || e.organizerId === uid)
    if (events.length) syncDoc(`user_events/${uid}`, { items: events })

    // Conversations (directs + groupes)
    const convs = safeParseArray('lib_conversations').filter(c =>
      c.participants?.includes(uid) || c.members?.some(m => m.userId === uid)
    )
    for (const conv of convs) {
      // Ensure participantIds exists for groups
      const toSync = conv.type === 'group' && !conv.participantIds
        ? { ...conv, participantIds: (conv.members || []).map(m => m.userId) }
        : conv
      syncDoc(`conversations/${conv.id}`, toSync)
    }

    // Messages
    const allMsgs = safeParseObj('lib_messages')
    for (const convId of Object.keys(allMsgs)) {
      if (allMsgs[convId]?.length) syncDoc(`conv_messages/${convId}`, { items: allMsgs[convId] })
    }

    // Friends + blocked
    const friends = safeParseObj('lib_friends')
    const blocked = safeParseObj('lib_blocked')
    const muted = safeParseObj('lib_muted_convs')
    const hidden = safeParseObj('lib_hidden_conversations')
    const starred = safeParseObj('lib_starred')
    syncDoc(`user_social/${uid}`, {
      friends: friends[uid] || [],
      blocked: blocked[uid] || [],
      mutedConvs: muted[uid] || [],
      hiddenConversations: hidden[uid] || [],
      starred: starred[uid] || [],
    })

    // Friend requests (sent by me)
    const reqs = safeParseArray('lib_friend_requests').filter(r => r.fromId === uid || r.toId === uid)
    for (const r of reqs) { syncDoc(`friend_requests/${r.id}`, r) }

    // Catalog
    const catalogKey = `lib_catalog_${uid}`
    const catalog = safeParseArray(catalogKey)
    if (catalog.length) syncDoc(`catalogs/${uid}`, { items: catalog, updatedAt: localStorage.getItem(`lib_catalog_ts_${uid}`) || new Date().toISOString() })

    // Provider profile
    const providers = safeParseArray('lib_provider_profiles')
    const myProvider = providers.find(p => p.userId === uid)
    if (myProvider) syncDoc(`providers/${uid}`, myProvider)

    // Service orders
    const orders = safeParseArray('lib_service_orders')
    for (const o of orders) { syncDoc(`service_orders/${o.id}`, o) }

    // Group bookings
    const gBookings = safeParseObj('lib_group_bookings')
    for (const id of Object.keys(gBookings)) { syncDoc(`group_bookings/${id}`, gBookings[id]) }

    // Les reçus de boosts sont exclusivement écrits par le webhook Stripe.

    // Reports
    const reports = safeParseArray('lib_reports')
    for (const r of reports) { syncDoc(`reports/${r.id}`, r) }

    console.log('[sync] Push complete')
  } catch (e) {
    console.warn('[sync] push error:', e.message)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateUsername(name) {
  return (name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
}

// ── Safe JSON parsers ─────────────────────────────────────────────────────────
function safeParseArray(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') || [] } catch { return [] }
}

function safeParseObj(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {} } catch { return {} }
}
