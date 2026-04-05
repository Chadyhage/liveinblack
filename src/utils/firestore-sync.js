// ─── Firestore Write-Through Cache ────────────────────────────────────────────
// Pattern: localStorage = instant reads (sync), Firestore = persistence + cross-device
// Every write → localStorage first (existing behavior) then fire-and-forget to Firestore
// On login → pull from Firestore into localStorage (async)

import { db } from '../firebase'
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where } from 'firebase/firestore'

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
    // ── 0. User profile (always restore latest from Firestore) ──
    const userProfile = await loadDoc(`users/${uid}`)
    if (userProfile) {
      try {
        const current = JSON.parse(localStorage.getItem('lib_user') || 'null')
        const merged = current ? { ...current, ...userProfile } : userProfile
        localStorage.setItem('lib_user', JSON.stringify(merged))
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

    // ── 4. Conversations (directs + groupes) ──
    const [directConvsSnap, groupConvsSnap] = await Promise.all([
      loadCollection('conversations', [where('participants', 'array-contains', uid)]),
      loadCollection('conversations', [where('participantIds', 'array-contains', uid)]),
    ])
    const convsSnap = mergeById([...directConvsSnap, ...groupConvsSnap], [], 'id').length
      ? mergeById(directConvsSnap, groupConvsSnap, '_docId')
      : [...directConvsSnap, ...groupConvsSnap]
    // Deduplicate by id
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
    if (convsSnap.length) localStorage.setItem('lib_messages', JSON.stringify(allMessages))

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

    // ── 10. Users (contacts cross-device) ──
    const usersSnap = await loadCollection('users')
    if (usersSnap.length) {
      const localUsers = JSON.parse(localStorage.getItem('lib_users') || '[]')
      const remoteIds = new Set(usersSnap.map(u => u.id))
      const merged = [...usersSnap, ...localUsers.filter(u => !remoteIds.has(u.id))]
      localStorage.setItem('lib_users', JSON.stringify(merged))
    }
    // Push current user profile to Firestore so others can find them
    const currentUser = JSON.parse(localStorage.getItem('lib_user') || 'null')
    if (currentUser && uid) {
      const myProfile = {
        id: uid,
        name: currentUser.name || '',
        email: currentUser.email || '',
        avatar: currentUser.avatar || null,
        username: currentUser.username || generateUsername(currentUser.name || currentUser.email || uid),
      }
      syncDoc(`users/${uid}`, myProfile)
    }

    // ── 10-bis. Service orders ──
    const orders = await loadCollection('service_orders')
    if (orders.length) localStorage.setItem('lib_service_orders', JSON.stringify(orders))

    // ── 11. Group bookings ──
    const gBookings = await loadCollection('group_bookings')
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

    // ── 14. Reports ──
    const reports = await loadCollection('reports')
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
      const validations = pendingSnap.filter(p => p.type !== 'role_request')
      const roleReqs = pendingSnap.filter(p => p.type === 'role_request')
      if (validations.length) {
        const local = safeParseArray('lib_pending_validations')
        localStorage.setItem('lib_pending_validations', JSON.stringify(mergeById(local, validations, 'uid')))
      }
      if (roleReqs.length) {
        const local = safeParseArray('lib_role_requests')
        localStorage.setItem('lib_role_requests', JSON.stringify(mergeById(local, roleReqs)))
      }
    }

    console.log('[sync] Full sync complete')
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
