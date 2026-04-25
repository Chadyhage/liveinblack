// ─── Firestore Write-Through Cache ────────────────────────────────────────────
// Pattern: localStorage = instant reads (sync), Firestore = persistence + cross-device
// Every write → localStorage first (existing behavior) then fire-and-forget to Firestore
// On login → pull from Firestore into localStorage (async)

import { db } from '../firebase'
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore'

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

// Listen to an organizer's own created events (user_events/{uid})
export function listenUserEvents(uid, callback) {
  try {
    if (!uid) return () => {}
    return onSnapshot(doc(db, 'user_events', uid), snap => {
      callback(snap.exists() ? (snap.data().items || []) : [])
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

// ── Master sync: pull all Firestore data → localStorage on login ──────────────
export async function syncOnLogin(uid) {
  if (!uid) return
  console.log('[sync] Full sync starting for', uid)

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
        if (current) {
          const safeMeta = {}
          if (userProfile.avatar != null) safeMeta.avatar = userProfile.avatar
          if (userProfile.username) safeMeta.username = userProfile.username
          if (userProfile.nameChangedAt != null) safeMeta.nameChangedAt = userProfile.nameChangedAt
          const merged = { ...current, ...safeMeta }
          localStorage.setItem('lib_user', JSON.stringify(merged))
        }
      } catch {}
    }

    // ── 1. Wallet ──
    const wallet = await loadDoc(`wallets/${uid}`)
    if (wallet && wallet.balance !== undefined) {
      localStorage.setItem(`lib_wallet_${uid}`, JSON.stringify({
        balance: wallet.balance,
        transactions: wallet.transactions || [],
      }))
    }

    // ── 2. Bookings ──
    const bookingsDoc = await loadDoc(`user_bookings/${uid}`)
    if (bookingsDoc?.items?.length) {
      const local = safeParseArray('lib_bookings')
      localStorage.setItem('lib_bookings', JSON.stringify(mergeById(local, bookingsDoc.items)))
    }

    // ── 3. Created events ──
    const eventsDoc = await loadDoc(`user_events/${uid}`)
    if (eventsDoc?.items?.length) {
      const local = safeParseArray('lib_created_events')
      localStorage.setItem('lib_created_events', JSON.stringify(mergeById(local, eventsDoc.items)))
    }

    // ── 3.5. Auto-delete orphan events (created by a different/deleted account) ──
    // Any userCreated event with a different UID is deleted from localStorage AND Firestore
    // so it never reappears in the public listing.
    try {
      const localEvts = safeParseArray('lib_created_events')
      const orphans = localEvts.filter(ev =>
        ev.userCreated &&
        ev.createdBy &&
        ev.createdBy !== uid &&
        (!ev.organizerId || ev.organizerId !== uid)
      )
      if (orphans.length) {
        // Delete each orphan from Firestore (events + user_events of the old uid)
        for (const ev of orphans) {
          try {
            const { deleteDoc, doc: fsDoc } = await import('firebase/firestore')
            const { db: fsDb } = await import('../firebase')
            await deleteDoc(fsDoc(fsDb, 'events', String(ev.id)))
          } catch {}
        }
        // Remove from localStorage
        const orphanIds = new Set(orphans.map(ev => String(ev.id)))
        const cleaned = localEvts.filter(ev => !orphanIds.has(String(ev.id)))
        localStorage.setItem('lib_created_events', JSON.stringify(cleaned))
      }
    } catch {}

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

    // ── 5. Messages for each conversation ──
    const allMessages = safeParseObj('lib_messages')
    const convIds = allConvsSnap.map(c => c.id || c._docId)
    for (const cid of convIds) {
      const msgDoc = await loadDoc(`conv_messages/${cid}`)
      if (msgDoc?.items?.length) {
        const localMsgs = allMessages[cid] || []
        allMessages[cid] = mergeById(localMsgs, msgDoc.items)
      }
    }
    if (allConvsSnap.length) localStorage.setItem('lib_messages', JSON.stringify(allMessages))

    // ── 6. Friends + Blocked ──
    const social = await loadDoc(`user_social/${uid}`)
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
    }

    // ── 7. Friend requests (to me) ──
    const reqsSnap = await loadCollection('friend_requests', [where('toId', '==', uid)])
    if (reqsSnap.length) {
      const local = safeParseArray('lib_friend_requests')
      localStorage.setItem('lib_friend_requests', JSON.stringify(mergeById(local, reqsSnap)))
    }

    // ── 8. Catalog ──
    const catalog = await loadDoc(`catalogs/${uid}`)
    if (catalog?.items) localStorage.setItem(`lib_catalog_${uid}`, JSON.stringify(catalog.items))

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
    const usersSnap = await loadCollection('users')
    // Firestore est source de vérité — on écrase lib_users entièrement
    // pour ne jamais afficher d'anciens comptes supprimés ou comptes démo
    const normalizedUsers = usersSnap.map(u => ({ ...u, id: u.id || u.uid || u._docId }))
    localStorage.setItem('lib_users', JSON.stringify(normalizedUsers))

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

    // ── 14. Reports (only reports submitted by this user) ──
    const reports = await loadCollection('reports', [where('fromId', '==', uid)])
    if (reports.length) localStorage.setItem('lib_reports', JSON.stringify(reports))

    // ── 15. Public events (shared collection — all organizers) ──
    const publicEvents = await loadCollection('events')
    if (publicEvents.length) {
      const localEvents = safeParseArray('lib_created_events')
      localStorage.setItem('lib_created_events', JSON.stringify(mergeById(localEvents, publicEvents)))
    }

    // ── 16. Pending validations + role requests (all users: admin needs them) ──
    const pendingSnap = await loadCollection('pending_validations')
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
    // Wallet
    const wallet = safeParseObj(`lib_wallet_${uid}`)
    if (wallet.balance !== undefined) syncDoc(`wallets/${uid}`, wallet)

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
    syncDoc(`user_social/${uid}`, {
      friends: friends[uid] || [],
      blocked: blocked[uid] || [],
    })

    // Friend requests (sent by me)
    const reqs = safeParseArray('lib_friend_requests').filter(r => r.fromId === uid || r.toId === uid)
    for (const r of reqs) { syncDoc(`friend_requests/${r.id}`, r) }

    // Catalog
    const catalogKey = `lib_catalog_${uid}`
    const catalog = safeParseArray(catalogKey)
    if (catalog.length) syncDoc(`catalogs/${uid}`, { items: catalog })

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

    // Boosts
    const boosts = safeParseArray('lib_boosts')
    if (boosts.length) syncDoc(`user_boosts/${uid}`, { items: boosts })

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
