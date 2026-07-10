// ─── Demo users ───────────────────────────────────────────────────────────────
export const DEMO_USERS = [
  { id: 'u_alex',  name: 'Alex Martin',   username: 'alex.martin',   email: 'alex@lib.com',   avatar: null },
  { id: 'u_sarah', name: 'Sarah Koné',    username: 'sarah.kone',    email: 'sarah@lib.com',  avatar: null },
  { id: 'u_tom',   name: 'Tom Becker',    username: 'tom.becker',    email: 'tom@lib.com',    avatar: null },
  { id: 'u_julie', name: 'Julie Roy',     username: 'julie.roy',     email: 'julie@lib.com',  avatar: null },
  { id: 'u_karim', name: 'Karim Diallo',  username: 'karim.diallo',  email: 'karim@lib.com',  avatar: null },
  { id: 'u_ines',  name: 'Inès Larbi',   username: 'ines.larbi',    email: 'ines@lib.com',   avatar: null },
  { id: 'u_marco', name: 'Marco Silva',   username: 'marco.silva',   email: 'marco@lib.com',  avatar: null },
  { id: 'u_laure', name: 'Laureen Mbaye', username: 'laure.mbaye',   email: 'laure@lib.com',  avatar: null },
]

// ─── Username helpers ─────────────────────────────────────────────────────────
function generateUsername(name) {
  return (name || 'user')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents : ï→i, é→e, ç→c…
    .toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
}

function ensureUniqueUsername(base, existingUsers) {
  let username = base
  let n = 1
  while (existingUsers.some(u => u.username === username)) {
    username = `${base}${n++}`
  }
  return username
}

// ─── User identity ────────────────────────────────────────────────────────────
export function getUserId(user) {
  if (!user) return null
  if (user.id) return user.id
  let h = 0
  for (let i = 0; i < (user.email || '').length; i++) {
    h = Math.imul(h ^ user.email.charCodeAt(i), 0x9e3779b9)
  }
  return 'u_' + Math.abs(h >>> 0).toString(36)
}

export function getAllUsers() {
  try { return JSON.parse(localStorage.getItem('lib_users') || 'null') } catch { return null }
}

export function initUsers(currentUser) {
  const myId = getUserId(currentUser)
  const existing = getAllUsers()
  if (existing && existing.find(u => u.id === myId)) return existing
  const baseUsername = generateUsername(currentUser.name || currentUser.email?.split('@')[0] || 'user')
  const username = ensureUniqueUsername(baseUsername, existing || DEMO_USERS)
  const me = {
    id: myId,
    name: currentUser.name,
    email: currentUser.email,
    avatar: currentUser.avatar || null,
    username,
  }
  const all = existing ? [...existing.filter(u => u.id !== myId), me] : [...DEMO_USERS, me]
  localStorage.setItem('lib_users', JSON.stringify(all))
  return all
}

export function getUserById(id) {
  const all = getAllUsers() || []
  return all.find(u => u.id === id) || null
}

export function getUserByUsername(username) {
  const all = getAllUsers() || []
  return all.find(u => u.username === username?.toLowerCase()) || null
}

export function searchUsers(query) {
  if (!query?.trim()) return []
  const q = query.toLowerCase()
  const all = getAllUsers() || []
  return all.filter(u =>
    u.name?.toLowerCase().includes(q) ||
    u.username?.toLowerCase().includes(q) ||
    u.email?.toLowerCase().includes(q)
  )
}

export function updateUserProfile(userId, updates) {
  try {
    const all = getAllUsers() || []
    const updated = all.map(u => u.id === userId ? { ...u, ...updates } : u)
    localStorage.setItem('lib_users', JSON.stringify(updated))
  } catch {}
}

export function getUserAvatar(userId) {
  const u = getUserById(userId)
  return u?.avatar || null
}

// ─── Online status ────────────────────────────────────────────────────────────
// ── Confidentialité (réglages perso, stockés sur le profil lib_user.privacy) ──
// Défauts = tout activé. Lus en direct depuis lib_user pour rester cohérents.
export function getMyPrivacy() {
  try {
    const u = JSON.parse(localStorage.getItem('lib_user') || '{}')
    const p = u.privacy || {}
    return {
      showOnline: p.showOnline !== false,
      showPhoto: p.showPhoto !== false,
      showInfo: p.showInfo !== false,
      readReceipts: p.readReceipts !== false,
    }
  } catch { return { showOnline: true, showPhoto: true, showInfo: true, readReceipts: true } }
}
// Le profil d'un AUTRE utilisateur expose-t-il sa photo ? (privacy synchronisée)
export function userShowsPhoto(user) {
  return user?.privacy?.showPhoto !== false
}

export function setOnline(userId) {
  // Confidentialité : si l'utilisateur masque son statut en ligne, on ne diffuse
  // jamais « en ligne » — il apparaît hors-ligne pour tout le monde.
  if (!getMyPrivacy().showOnline) { setOffline(userId); return }
  try {
    const all = JSON.parse(localStorage.getItem('lib_online') || '{}')
    all[userId] = Date.now()
    localStorage.setItem('lib_online', JSON.stringify(all))
  } catch {}
  // Sync to Firestore so other devices can see presence
  import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
    if (!USE_REAL_FIREBASE) return
    import('firebase/firestore').then(({ doc, setDoc }) => {
      setDoc(doc(db, 'users', userId), { lastSeen: Date.now(), isOnline: true }, { merge: true }).catch(() => {})
    }).catch(() => {})
  }).catch(() => {})
}

export function setOffline(userId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_online') || '{}')
    delete all[userId]
    localStorage.setItem('lib_online', JSON.stringify(all))
  } catch {}
  import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
    if (!USE_REAL_FIREBASE) return
    import('firebase/firestore').then(({ doc, setDoc }) => {
      setDoc(doc(db, 'users', userId), { isOnline: false, lastSeen: Date.now() }, { merge: true }).catch(() => {})
    }).catch(() => {})
  }).catch(() => {})
}

export function isOnline(userId) {
  try {
    // 1. Fast local heartbeat (own device → very recent, 90s window)
    const all = JSON.parse(localStorage.getItem('lib_online') || '{}')
    const ts = all[userId]
    if (ts && (Date.now() - ts) < 90000) return true

    // 2. Firestore-synced accounts (populated from Firestore via syncOnLogin — 5min window)
    try {
      const users = JSON.parse(localStorage.getItem('lib_users') || '[]')
      const u = users.find(u => u.uid === userId || u.id === userId)
      if (u?.isOnline) return true
      if (u?.lastSeen && (Date.now() - u.lastSeen) < 5 * 60 * 1000) return true
    } catch {}

    return false
  } catch { return false }
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
export function setTyping(convId, userId, isTyping) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_typing') || '{}')
    const key = `${convId}__${userId}`
    if (isTyping) {
      all[key] = Date.now()
    } else {
      delete all[key]
    }
    localStorage.setItem('lib_typing', JSON.stringify(all))
  } catch {}
}

export function getTypingUsers(convId, myId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_typing') || '{}')
    const now = Date.now()
    return Object.entries(all)
      .filter(([key, ts]) => key.startsWith(convId + '__') && (now - ts) < 4000)
      .map(([key]) => key.replace(convId + '__', ''))
      .filter(uid => uid !== myId)
  } catch { return [] }
}

// ─── Friends ─────────────────────────────────────────────────────────────────
export function getFriends(myId) {
  try { return JSON.parse(localStorage.getItem('lib_friends') || '{}')[myId] || [] } catch { return [] }
}

export function saveFriend(myId, friendId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friends') || '{}')
    all[myId] = [...new Set([...(all[myId] || []), friendId])]
    all[friendId] = [...new Set([...(all[friendId] || []), myId])]
    localStorage.setItem('lib_friends', JSON.stringify(all))
    // Sync both users' social data to Firestore
    import('./firestore-sync').then(({ syncDoc }) => {
      const blocked = JSON.parse(localStorage.getItem('lib_blocked') || '{}')
      syncDoc(`user_social/${myId}`, { friends: all[myId] || [], blocked: blocked[myId] || [] })
      syncDoc(`user_social/${friendId}`, { friends: all[friendId] || [], blocked: blocked[friendId] || [] })
    }).catch(() => {})
  } catch {}
}

export function removeFriend(myId, friendId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friends') || '{}')
    all[myId] = (all[myId] || []).filter(id => id !== friendId)
    all[friendId] = (all[friendId] || []).filter(id => id !== myId)
    localStorage.setItem('lib_friends', JSON.stringify(all))
    // Sync to Firestore so removal persists cross-device
    import('./firestore-sync').then(({ syncDoc }) => {
      const blocked = JSON.parse(localStorage.getItem('lib_blocked') || '{}')
      syncDoc(`user_social/${myId}`, { friends: all[myId] || [], blocked: blocked[myId] || [] })
    }).catch(() => {})
  } catch {}
}

// ─── Friend requests ──────────────────────────────────────────────────────────
export function getFriendRequests(toId) {
  try { return JSON.parse(localStorage.getItem('lib_friend_requests') || '[]').filter(r => r.toId === toId) } catch { return [] }
}

export function sendFriendRequest(fromId, fromName, toId, fromUsername) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friend_requests') || '[]')
    if (all.find(r => r.fromId === fromId && r.toId === toId)) return
    const req = { id: Date.now().toString(), fromId, fromName, fromUsername: fromUsername || null, toId, sentAt: new Date().toISOString() }
    all.push(req)
    localStorage.setItem('lib_friend_requests', JSON.stringify(all))
    // Sync to Firestore so recipient sees it on other devices
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`friend_requests/${req.id}`, req)
    }).catch(() => {})
  } catch {}
}

export function acceptFriendRequest(reqId, myId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friend_requests') || '[]')
    const req = all.find(r => r.id === reqId)
    if (req) {
      saveFriend(myId, req.fromId)
      // Mark as new contact so the UI can show a "Nouveau" badge
      const newContacts = JSON.parse(localStorage.getItem('lib_new_contacts') || '[]')
      if (!newContacts.includes(req.fromId)) {
        localStorage.setItem('lib_new_contacts', JSON.stringify([...newContacts, req.fromId]))
      }
    }
    localStorage.setItem('lib_friend_requests', JSON.stringify(all.filter(r => r.id !== reqId)))
    // Delete from Firestore so it doesn't reappear on next sync
    import('./firestore-sync').then(({ syncDelete }) => {
      syncDelete(`friend_requests/${reqId}`)
    }).catch(() => {})
  } catch {}
}

export function declineFriendRequest(reqId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friend_requests') || '[]')
    localStorage.setItem('lib_friend_requests', JSON.stringify(all.filter(r => r.id !== reqId)))
    // Delete from Firestore — sender can re-send without limit
    import('./firestore-sync').then(({ syncDelete }) => {
      syncDelete(`friend_requests/${reqId}`)
    }).catch(() => {})
  } catch {}
}

export function clearNewContact(friendId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_new_contacts') || '[]')
    localStorage.setItem('lib_new_contacts', JSON.stringify(all.filter(id => id !== friendId)))
  } catch {}
}

export function getNewContacts() {
  try { return JSON.parse(localStorage.getItem('lib_new_contacts') || '[]') } catch { return [] }
}

// ─── Conversations ────────────────────────────────────────────────────────────
export function getHiddenConversationIds(myId) {
  if (!myId) return []
  try { return JSON.parse(localStorage.getItem('lib_hidden_conversations') || '{}')[myId] || [] } catch { return [] }
}

export function isConversationHidden(myId, convId) {
  return getHiddenConversationIds(myId).includes(String(convId))
}

export function filterVisibleConversations(conversations, myId, hiddenIds = []) {
  const hidden = new Set((hiddenIds || []).map(String))
  return (conversations || []).filter(c => {
    if (!c || hidden.has(String(c.id))) return false
    return c.type === 'direct'
      ? c.participants?.includes(myId)
      : c.members?.some(m => m.userId === myId)
  })
}

// Masquage personnel : ne supprime JAMAIS le document conversation partagé.
// L'autre participant conserve donc son historique. Le choix est synchronisé
// dans user_social/{uid} pour rester valable sur tous les appareils.
export function hideConversationForUser(myId, convId) {
  if (!myId || !convId) return []
  try {
    const id = String(convId)
    const all = JSON.parse(localStorage.getItem('lib_hidden_conversations') || '{}')
    all[myId] = [...new Set([...(all[myId] || []).map(String), id])]
    localStorage.setItem('lib_hidden_conversations', JSON.stringify(all))

    // Nettoie les préférences devenues inutiles pour ce compte uniquement.
    const starred = JSON.parse(localStorage.getItem('lib_starred') || '{}')
    starred[myId] = (starred[myId] || []).filter(key => !String(key).startsWith(`${id}:`))
    localStorage.setItem('lib_starred', JSON.stringify(starred))
    // Sourdine des notifs : le format est une MAP { convId: untilMs } depuis la
    // refonte — un .filter (ancien format tableau) planterait ici et avortait
    // toute la fonction AVANT la sync Firestore. On passe par le helper migré.
    clearConvMute(myId, id)
    const pinned = JSON.parse(localStorage.getItem('lib_pinned_convs') || '{}')
    pinned[myId] = (pinned[myId] || []).filter(value => String(value) !== id)
    localStorage.setItem('lib_pinned_convs', JSON.stringify(pinned))

    import('./firestore-sync').then(({ syncDoc }) => syncDoc(`user_social/${myId}`, {
      hiddenConversations: all[myId],
      starred: starred[myId],
      pinnedConvs: pinned[myId],
    })).catch(() => {})
    return all[myId]
  } catch { return [] }
}

export function unhideConversationForUser(myId, convId) {
  if (!myId || !convId) return []
  try {
    const all = JSON.parse(localStorage.getItem('lib_hidden_conversations') || '{}')
    all[myId] = (all[myId] || []).filter(id => String(id) !== String(convId))
    localStorage.setItem('lib_hidden_conversations', JSON.stringify(all))
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`user_social/${myId}`, { hiddenConversations: all[myId] })
    }).catch(() => {})
    return all[myId]
  } catch { return [] }
}

export function getConversations(myId) {
  try {
    return filterVisibleConversations(
      JSON.parse(localStorage.getItem('lib_conversations') || '[]'),
      myId,
      getHiddenConversationIds(myId),
    )
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  } catch { return [] }
}

export function getConversationById(id) {
  try { return JSON.parse(localStorage.getItem('lib_conversations') || '[]').find(c => c.id === id) || null } catch { return null }
}

export function saveConversation(conv) {
  try {
    // Les groupes historiques n'avaient pas de liste d'admins dédiée. On la
    // dérive à chaque écriture afin que les nouvelles règles de modération
    // restent compatibles avec eux, sans perdre les rôles déjà attribués.
    const nextConv = conv?.type === 'group'
      ? {
          ...conv,
          participantIds: [...new Set((conv.members || []).map(member => member.userId).filter(Boolean))],
          adminIds: [...new Set((conv.members || []).filter(member => member.role === 'admin').map(member => member.userId).filter(Boolean))],
        }
      : conv
    const all = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    const idx = all.findIndex(c => c.id === nextConv.id)
    if (idx >= 0) all[idx] = nextConv; else all.push(nextConv)
    localStorage.setItem('lib_conversations', JSON.stringify(all))
    // Fire-and-forget Firestore sync
    import('./firestore-sync').then(({ syncDoc }) => syncDoc(`conversations/${nextConv.id}`, conversationForRemoteSync(nextConv))).catch(() => {})
  } catch {}
}

export function createDirectConversation(myId, myName, otherId, otherName) {
  let existing = null
  try {
    existing = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
      .find(c => c.type === 'direct' && c.participants?.includes(myId) && c.participants?.includes(otherId))
  } catch {}
  if (existing) {
    unhideConversationForUser(myId, existing.id)
    return existing
  }
  const conv = {
    id: 'conv_' + Date.now(),
    type: 'direct',
    participants: [myId, otherId],
    names: { [myId]: myName, [otherId]: otherName },
    updatedAt: new Date().toISOString(),
    lastMessage: '',
    pinnedMessageId: null,
  }
  saveConversation(conv)
  return conv
}

export function createGroup(name, creatorId, creatorName, memberIds, memberNames) {
  const members = memberIds.map((uid, i) => ({
    userId: uid,
    name: memberNames[i],
    role: uid === creatorId ? 'admin' : 'member',
  }))
  const conv = {
    id: 'grp_' + Date.now(),
    type: 'group',
    name,
    avatar: null,
    members,
    participantIds: memberIds, // used by Firestore queries
    adminIds: [creatorId],
    // { [memberId]: { untilAtMs, mutedById, mutedByName, createdAt } }
    // Une date plutôt qu'un booléen rend la sanction automatique et vérifiable.
    memberMutes: {},
    updatedAt: new Date().toISOString(),
    lastMessage: `Groupe créé par ${creatorName}`,
    pinnedMessageId: null,
  }
  saveConversation(conv)
  sendMessage(conv.id, creatorId, creatorName, 'system', `${creatorName} a créé le groupe « ${name} »`)
  return conv
}

export function leaveGroup(convId, userId, userName) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    const idx = all.findIndex(c => c.id === convId)
    if (idx < 0) return
    const conv = all[idx]
    const remaining = conv.members.filter(m => m.userId !== userId)
    if (remaining.length === 0) {
      // Delete group if empty
      all.splice(idx, 1)
    } else {
      // If admin left, promote oldest member
      const wasAdmin = conv.members.find(m => m.userId === userId)?.role === 'admin'
      if (wasAdmin && !remaining.some(m => m.role === 'admin')) {
        remaining[0].role = 'admin'
      }
      all[idx] = {
        ...conv,
        members: remaining,
        participantIds: remaining.map(member => member.userId),
        adminIds: remaining.filter(member => member.role === 'admin').map(member => member.userId),
      }
    }
    // Capture reference before any mutation changes its meaning
    const updatedConv = remaining.length > 0 ? all[idx] : null
    localStorage.setItem('lib_conversations', JSON.stringify(all))
    // Sync updated conversation to Firestore so other devices see the change
    if (remaining.length > 0) {
      sendMessage(convId, userId, userName, 'system', `${userName} a quitté le groupe`)
      import('./firestore-sync').then(({ syncDoc }) => {
        syncDoc(`conversations/${convId}`, conversationForRemoteSync(updatedConv))
      }).catch(() => {})
    } else {
      import('./firestore-sync').then(({ syncDelete }) => {
        syncDelete(`conversations/${convId}`)
      }).catch(() => {})
    }
  } catch {}
}

export function deleteGroup(convId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    localStorage.setItem('lib_conversations', JSON.stringify(all.filter(c => c.id !== convId)))
    // Also remove messages
    const msgs = JSON.parse(localStorage.getItem('lib_messages') || '{}')
    delete msgs[convId]
    localStorage.setItem('lib_messages', JSON.stringify(msgs))
    // Sync deletion to Firestore
    import('./firestore-sync').then(({ syncDelete }) => {
      syncDelete(`conversations/${convId}`)
      syncDelete(`conv_messages/${convId}`)
    }).catch(() => {})
  } catch {}
}

export function updateGroupInfo(convId, updates) {
  try {
    const conv = getConversationById(convId)
    if (!conv) return
    saveConversation({ ...conv, ...updates })
  } catch {}
}

// ─── Modération de groupe : sourdine temporaire ──────────────────────────────
// `untilAtMs` reste un nombre pour pouvoir être relu sans ambiguïté depuis le
// cache local, Firestore et les anciens navigateurs. Les entrées expirées sont
// considérées inactives immédiatement (même avant le nettoyage du document).
function toMuteTimestamp(value) {
  if (Number.isFinite(value)) return Number(value)
  if (value && Number.isFinite(value.seconds)) return Number(value.seconds) * 1000
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

// localStorage transforme les Date en chaînes ISO. À chaque écriture Firestore,
// on les recompose donc en Timestamp (via Date) ; sinon une écriture de dernier
// message pourrait écraser l'échéance serveur et rendre la règle de sourdine
// inopérante.
function conversationForRemoteSync(conv) {
  if (!conv || conv.type !== 'group' || !conv.memberMutes) return conv
  const memberMutes = Object.fromEntries(Object.entries(conv.memberMutes).map(([memberId, mute]) => {
    const untilAtMs = toMuteTimestamp(mute?.untilAtMs ?? mute?.untilAt)
    return [memberId, untilAtMs
      ? { ...mute, untilAtMs, untilAt: new Date(untilAtMs) }
      : mute]
  }))
  return { ...conv, memberMutes }
}

export function getGroupMemberMute(convOrId, memberId, now = Date.now()) {
  const conv = typeof convOrId === 'string' ? getConversationById(convOrId) : convOrId
  if (!conv || conv.type !== 'group' || !memberId) return null
  const raw = conv.memberMutes?.[memberId]
  if (!raw) return null
  const untilAtMs = toMuteTimestamp(raw.untilAtMs ?? raw.untilAt)
  if (!untilAtMs || untilAtMs <= now) return null
  return { ...raw, untilAtMs }
}

export function isGroupMemberMuted(convOrId, memberId, now = Date.now()) {
  return !!getGroupMemberMute(convOrId, memberId, now)
}

// « Jusqu'à réactivation » = échéance à +100 ans (pas d'expiration naturelle).
// Au-delà de ce seuil d'affichage, l'UI montre « jusqu'à réactivation ».
export const MEMBER_MUTE_INDEFINITE_MS = 100 * 365 * 24 * 60 * 60 * 1000
export const MEMBER_MUTE_INDEFINITE_THRESHOLD_MS = 5 * 365 * 24 * 60 * 60 * 1000

export function setGroupMemberMute(convId, adminId, adminName, memberId, durationMs, now = Date.now()) {
  const conv = getConversationById(convId)
  if (!conv || conv.type !== 'group') return { ok: false, reason: 'not_group' }
  const admin = (conv.members || []).find(member => member.userId === adminId)
  const target = (conv.members || []).find(member => member.userId === memberId)
  if (!admin || admin.role !== 'admin') return { ok: false, reason: 'not_admin' }
  if (!target) return { ok: false, reason: 'unknown_member' }
  // Un administrateur ne peut pas réduire au silence un autre administrateur.
  // Cette règle évite les conflits de pouvoir et les mises à l'écart abusives.
  if (target.role === 'admin') return { ok: false, reason: 'target_is_admin' }
  // durationMs peut valoir MEMBER_MUTE_INDEFINITE_MS pour « jusqu'à réactivation »
  // (échéance très lointaine → le membre reste muet tant qu'un admin ne lève pas
  // la sourdine ; la règle serveur compare untilAt > request.time, donc une date
  // à +100 ans fonctionne sans changement de règle).
  const safeDuration = Number(durationMs)
  if (!Number.isFinite(safeDuration) || safeDuration < 60_000 || safeDuration > MEMBER_MUTE_INDEFINITE_MS) {
    return { ok: false, reason: 'invalid_duration' }
  }

  const memberMutes = { ...(conv.memberMutes || {}) }
  Object.keys(memberMutes).forEach(id => {
    const until = toMuteTimestamp(memberMutes[id]?.untilAtMs ?? memberMutes[id]?.untilAt)
    if (!until || until <= now) delete memberMutes[id]
  })
  const mute = {
    untilAtMs: now + safeDuration,
    // Date est sérialisée en Timestamp par Firestore. Elle permet aux règles
    // serveur de comparer directement l'échéance avec request.time.
    untilAt: new Date(now + safeDuration),
    mutedById: adminId,
    mutedByName: adminName || admin.name || 'Un administrateur',
    createdAt: new Date(now).toISOString(),
  }
  memberMutes[memberId] = mute
  saveConversation({ ...conv, memberMutes })
  return { ok: true, mute: { ...mute, memberId, memberName: target.name } }
}

export function clearGroupMemberMute(convId, adminId, memberId) {
  const conv = getConversationById(convId)
  if (!conv || conv.type !== 'group') return { ok: false, reason: 'not_group' }
  const admin = (conv.members || []).find(member => member.userId === adminId)
  if (!admin || admin.role !== 'admin') return { ok: false, reason: 'not_admin' }
  if (!(conv.memberMutes || {})[memberId]) return { ok: true, changed: false }
  const memberMutes = { ...(conv.memberMutes || {}) }
  delete memberMutes[memberId]
  saveConversation({ ...conv, memberMutes })
  // saveConversation synchronise via syncDoc(merge:true), qui NE PEUT PAS retirer
  // une clé imbriquée : sans ça l'échéance (souvent +100 ans « jusqu'à
  // réactivation ») survit côté serveur et la règle isMutedGroupMember continue
  // de bloquer le membre APRÈS sa réactivation. On supprime donc explicitement
  // memberMutes.<memberId> côté serveur avec le sentinel deleteField().
  import('./firestore-sync').then(({ syncDeleteField }) =>
    syncDeleteField(`conversations/${convId}`, `memberMutes.${memberId}`)).catch(() => {})
  return { ok: true, changed: true }
}

export function canSendInConversation(convId, senderId, type = 'text', now = Date.now()) {
  const conv = getConversationById(convId)
  if (!conv) return { ok: false, reason: 'unknown_conversation' }
  // Les messages système sont nécessaires pour quitter un groupe ou tracer une
  // action de modération. Tous les contenus utilisateur restent bloqués.
  if (type !== 'system' && isGroupMemberMuted(conv, senderId, now)) {
    return { ok: false, reason: 'muted', mute: getGroupMemberMute(conv, senderId, now) }
  }
  return { ok: true }
}

export function pinMessage(convId, msgId) {
  const conv = getConversationById(convId)
  if (!conv) return
  saveConversation({ ...conv, pinnedMessageId: msgId })
}

export function unpinMessage(convId) {
  const conv = getConversationById(convId)
  if (!conv) return
  saveConversation({ ...conv, pinnedMessageId: null })
}

// ─── Messages ─────────────────────────────────────────────────────────────────
export function getMessages(convId) {
  try { return JSON.parse(localStorage.getItem('lib_messages') || '{}')[convId] || [] } catch { return [] }
}

function saveMessages(convId, msgs) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_messages') || '{}')
    all[convId] = msgs
    localStorage.setItem('lib_messages', JSON.stringify(all))
    // NOTE: No Firestore sync here — callers that need cross-device sync
    // (sendMessage, reactToMessage, deleteMessageForAll, voteOnPoll) do it explicitly.
    // markMessagesRead intentionally does NOT sync to Firestore to prevent stale
    // local state from overwriting newer messages written by the other participant.
  } catch {}
}

// Sync message array to Firestore — strips heavy base64 blobs before writing
// to avoid exceeding Firestore's 1MB document limit.
function syncMessagesToFirestore(convId, msgs) {
  if (!msgs.length) return
  import('./firestore-sync').then(({ syncDoc }) => {
    const safe = msgs.map(m => {
      if (m.type === 'image' && typeof m.content === 'string' && m.content.startsWith('data:')) {
        // Store a placeholder — actual image stays in localStorage only
        // TODO: replace with Firebase Storage URL when implemented
        return { ...m, content: '[image]', _hasLocalImage: true }
      }
      if (m.type === 'voice' && typeof m.content === 'string' && m.content.startsWith('data:')) {
        return { ...m, content: '[voice]', _hasLocalVoice: true }
      }
      return m
    })
    syncDoc(`conv_messages/${convId}`, { items: safe })
  }).catch(() => {})
}

// extra: { replyTo: { id, senderName, preview }, forwardedFrom: { senderName, convName } }
export function sendMessage(convId, senderId, senderName, type, content, extra = {}) {
  const permission = canSendInConversation(convId, senderId, type)
  if (!permission.ok) return { blocked: true, reason: permission.reason, mute: permission.mute || null }
  const msgs = getMessages(convId)
  const msg = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    senderId,
    senderName,
    type,
    content,
    timestamp: new Date().toISOString(),
    reactions: {},       // { emoji: [userId, ...] }
    readBy: {},          // { userId: timestamp }
    deliveredTo: {},     // { userId: timestamp }
    deletedForAll: false,
    deletedForSelf: [],  // array of userIds who deleted for themselves
    pinned: false,
    ...(extra.replyTo ? { replyTo: extra.replyTo } : {}),
    ...(extra.forwardedFrom ? { forwardedFrom: extra.forwardedFrom } : {}),
    ...(extra.viewOnce ? { viewOnce: true, viewedBy: {} } : {}),
  }
  const updatedMsgs = [...msgs, msg]
  saveMessages(convId, updatedMsgs)
  try {
    const all = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    const idx = all.findIndex(c => c.id === convId)
    if (idx >= 0) {
      all[idx].updatedAt = msg.timestamp
      all[idx].lastSenderId = senderId
      all[idx].lastMessage = type === 'text' ? content
        : type === 'image' ? 'Photo'
        : type === 'voice' ? 'Message vocal'
        : type === 'story' ? 'Article'
        : type === 'poll' ? 'Sondage'
        : type === 'event' ? 'Événement'
        : type === 'catalog_item' ? 'Offre prestataire'
        : type === 'group_booking' ? 'Réservation clôturée'
        : type === 'system' ? content
        : 'Pièce jointe'
      localStorage.setItem('lib_conversations', JSON.stringify(all))
      // Sync conv + messages to Firestore
      const updatedConv = all[idx]
      import('./firestore-sync').then(({ syncDoc }) => {
        syncDoc(`conversations/${convId}`, conversationForRemoteSync(updatedConv))
      }).catch(() => {})
      syncMessagesToFirestore(convId, updatedMsgs)
    }
  } catch {}
  return msg
}

export function reactToMessage(convId, msgId, userId, emoji) {
  const msgs = getMessages(convId)
  const updated = msgs.map(m => {
    if (m.id !== msgId || m.deletedForAll) return m
    const reactions = { ...(m.reactions || {}) }
    Object.keys(reactions).forEach(e => {
      reactions[e] = (reactions[e] || []).filter(uid => uid !== userId)
      if (reactions[e].length === 0) delete reactions[e]
    })
    const had = (m.reactions?.[emoji] || []).includes(userId)
    if (!had) reactions[emoji] = [...(reactions[emoji] || []), userId]
    return { ...m, reactions }
  })
  saveMessages(convId, updated)
  syncMessagesToFirestore(convId, updated)
}

// Édition d'un message texte (par son auteur). Persiste + sync Firestore +
// marque editedAt pour afficher « (modifié) ». Renvoie true si édité.
export function editMessage(convId, msgId, userId, newContent) {
  const text = (newContent || '').trim()
  if (!text) return false
  const msgs = getMessages(convId)
  let changed = false
  const updated = msgs.map(m => {
    if (m.id !== msgId || m.deletedForAll) return m
    if (m.senderId !== userId) return m       // seul l'auteur édite
    if (m.type !== 'text') return m            // texte uniquement
    if (m.content === text) return m
    changed = true
    return { ...m, content: text, editedAt: new Date().toISOString() }
  })
  if (!changed) return false
  saveMessages(convId, updated)
  syncMessagesToFirestore(convId, updated)
  return true
}

export function deleteMessageForSelf(convId, msgId, userId) {
  const msgs = getMessages(convId)
  const updated = msgs.map(m =>
    m.id === msgId
      ? { ...m, deletedForSelf: [...new Set([...(m.deletedForSelf || []), userId])] }
      : m
  )
  saveMessages(convId, updated)
}

export function deleteMessageForAll(convId, msgId) {
  const msgs = getMessages(convId)
  const updated = msgs.map(m =>
    m.id === msgId
      ? { ...m, deletedForAll: true, content: '', reactions: {}, replyTo: undefined, forwardedFrom: undefined }
      : m
  )
  saveMessages(convId, updated)
  syncMessagesToFirestore(convId, updated)
}

export function markMessagesRead(convId, userId) {
  // Confidentialité : si J'ai désactivé les accusés de lecture, je ne diffuse
  // PAS mes lectures (readBy). Le badge non-lu, lui, reste géré par setLastRead.
  if (!getMyPrivacy().readReceipts) return
  const msgs = getMessages(convId)
  const now = new Date().toISOString()
  const updated = msgs.map(m =>
    m.senderId !== userId && !(m.readBy?.[userId])
      ? { ...m, readBy: { ...(m.readBy || {}), [userId]: now } }
      : m
  )
  saveMessages(convId, updated)
}

// ── Last-read timestamp per conversation (persists across Firestore merges) ──
export function setLastRead(convId, userId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_last_read') || '{}')
    all[convId] = new Date().toISOString()
    localStorage.setItem('lib_last_read', JSON.stringify(all))
    // Sync cross-device
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`user_read_status/${userId}`, { [convId]: all[convId] })
    }).catch(() => {})
  } catch {}
}

export function getLastRead(convId) {
  try { return JSON.parse(localStorage.getItem('lib_last_read') || '{}')[convId] || null } catch { return null }
}

export function markPhotoViewed(convId, msgId, userId) {
  const msgs = getMessages(convId)
  const updated = msgs.map(m =>
    m.id === msgId ? { ...m, viewedBy: { ...(m.viewedBy || {}), [userId]: new Date().toISOString() } } : m
  )
  saveMessages(convId, updated)
  syncMessagesToFirestore(convId, updated)
}

export function markMessagesDelivered(convId, userId) {
  const msgs = getMessages(convId)
  let changed = false
  const updated = msgs.map(m => {
    if (m.senderId === userId || m.deletedForAll || m.deliveredTo?.[userId]) return m
    changed = true
    return { ...m, deliveredTo: { ...(m.deliveredTo || {}), [userId]: new Date().toISOString() } }
  })
  if (!changed) return
  saveMessages(convId, updated)
  syncMessagesToFirestore(convId, updated)
}

export function getUnreadCount(convId, userId) {
  try {
    const msgs = getMessages(convId)
    const lastRead = getLastRead(convId)
    return msgs.filter(m =>
      m.senderId !== userId &&
      !m.deletedForAll &&
      !(m.deletedForSelf || []).includes(userId) &&
      (!lastRead || new Date(m.timestamp) > new Date(lastRead))
    ).length
  } catch { return 0 }
}

export function voteOnPoll(convId, msgId, optionId, userId) {
  const msgs = getMessages(convId)
  const updated = msgs.map(m => {
    if (m.id !== msgId || (m.type !== 'poll' && m.type !== 'event_poll')) return m
    let poll
    try { poll = typeof m.content === 'string' ? JSON.parse(m.content) : m.content } catch { return m }
    // Remove previous vote
    const options = poll.options.map(o => ({
      ...o,
      votes: { ...(o.votes || {}) }
    }))
    options.forEach(o => { delete o.votes[userId] })
    // Add new vote (toggle)
    const opt = options.find(o => o.id === optionId)
    if (opt) {
      const alreadyVoted = (m.content?.options || poll.options).find(o => o.id === optionId)?.votes?.[userId]
      if (!alreadyVoted) opt.votes[userId] = true
    }
    const newPoll = { ...poll, options }
    return { ...m, content: JSON.stringify(newPoll) }
  })
  saveMessages(convId, updated)
  syncMessagesToFirestore(convId, updated)
}

// Legacy compatibility
export function voteOnMessage(convId, msgId, userId, vote) {
  voteOnPoll(convId, msgId, vote, userId)
}

export function deleteMessage(convId, msgId) {
  deleteMessageForAll(convId, msgId)
}

// NB : l'ancien flux « réservation de groupe part-par-part » (getGroupBookings,
// saveGroupBooking, validateGroupBooking, payGroupBookingShare, etc.) a été
// retiré — remplacé par le modèle « table hôte » (achat de la table entière +
// attribution des billets via api/tickets.js, cf. ProfilePage/TableHostPanel).

// ─── Seed demo data ───────────────────────────────────────────────────────────
export function seedDemoData(myId) {
  // Demo data disabled — clean up any previously seeded data
  const seedKey = 'lib_seeded_' + myId
  if (!localStorage.getItem(seedKey)) return // nothing was ever seeded
  const dmId  = 'conv_dm_alex_' + myId
  const grpId = 'conv_grp_squad_' + myId
  // Remove seeded conversations
  try {
    const convs = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    localStorage.setItem('lib_conversations', JSON.stringify(convs.filter(c => c.id !== dmId && c.id !== grpId)))
    const msgs = JSON.parse(localStorage.getItem('lib_messages') || '{}')
    delete msgs[dmId]; delete msgs[grpId]
    localStorage.setItem('lib_messages', JSON.stringify(msgs))
    // Remove seeded demo friends
    const friends = JSON.parse(localStorage.getItem('lib_friends') || '{}')
    friends[myId] = (friends[myId] || []).filter(id => !['u_alex','u_sarah','u_tom'].includes(id))
    localStorage.setItem('lib_friends', JSON.stringify(friends))
  } catch {}
  localStorage.removeItem(seedKey)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 1000 * 60 * 60) return `${Math.max(1, Math.floor(diff / 60000))}min`
  if (diff < 1000 * 60 * 60 * 24) return d.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('fr', { day: '2-digit', month: 'short' })
}

export function formatMsgTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateSeparator(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui"
  if (d.toDateString() === yesterday.toDateString()) return 'Hier'
  return d.toLocaleDateString('fr', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export function isSameDay(isoA, isoB) {
  if (!isoA || !isoB) return false
  return new Date(isoA).toDateString() === new Date(isoB).toDateString()
}

// ─── Total unread (all conversations) ────────────────────────────────────────
export function getTotalUnreadCount(myId) {
  if (!myId) return 0
  try {
    const convs = getConversations(myId)
    const muted = new Set(getMutedConvs(myId))
    // Les conversations en sourdine ne pèsent pas dans le badge global
    return convs.reduce((sum, c) => sum + (muted.has(c.id) ? 0 : getUnreadCount(c.id, myId)), 0)
  } catch { return 0 }
}

// ─── Block / Unblock ─────────────────────────────────────────────────────────
export function getBlockedUsers(myId) {
  try { return JSON.parse(localStorage.getItem('lib_blocked') || '{}')[myId] || [] } catch { return [] }
}

// ── Sourdine des NOTIFICATIONS d'une conversation (pour MOI) ──────────────────
// À ne PAS confondre avec la sourdine d'un MEMBRE (setGroupMemberMute, qui
// EMPÊCHE ce membre d'écrire). Ici c'est purement personnel : je ne veux plus
// être notifié par cette conv, éventuellement pour une durée limitée.
//
// Modèle : lib_muted_convs = { [userId]: { [convId]: untilMs } }
//   untilMs === 0  → sourdine « jusqu'à réactivation » (permanente)
//   untilMs  > now → sourdine temporaire (expire toute seule)
// Rétrocompat : l'ancien format (tableau de convId) est migré en {convId:0}.
// Sync : user_social.mutedConvsUntil (map) + mutedConvs (tableau des convs
// actuellement en sourdine, conservé pour la rétrocompat + le badge).
export const CONV_MUTE_FOREVER = 0

function readConvMuteMap(myId) {
  try {
    const raw = JSON.parse(localStorage.getItem('lib_muted_convs') || '{}')[myId]
    if (Array.isArray(raw)) { const m = {}; raw.forEach(id => { m[id] = CONV_MUTE_FOREVER }); return m }
    return raw && typeof raw === 'object' ? raw : {}
  } catch { return {} }
}
function writeConvMuteMap(myId, map) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_muted_convs') || '{}')
    all[myId] = map
    localStorage.setItem('lib_muted_convs', JSON.stringify(all))
  } catch {}
  // Le tableau dérivé (convs actuellement en sourdine) reste synchronisé pour
  // le badge et les anciens clients ; la map porte les échéances.
  const activeList = getMutedConvs(myId)
  import('./firestore-sync').then(({ syncDoc }) => {
    syncDoc(`user_social/${myId}`, { mutedConvsUntil: map, mutedConvs: activeList })
  }).catch(() => {})
}

// convId → untilMs si en sourdine ACTIVE, sinon null. Nettoie les échéances passées.
export function getConvMuteUntil(myId, convId, now = Date.now()) {
  const map = readConvMuteMap(myId)
  if (!(convId in map)) return null
  const until = Number(map[convId]) || CONV_MUTE_FOREVER
  if (until !== CONV_MUTE_FOREVER && until <= now) return null // expirée
  return until
}
// Liste des convs actuellement en sourdine (permanente ou non expirée).
export function getMutedConvs(myId, now = Date.now()) {
  const map = readConvMuteMap(myId)
  let changed = false
  const out = []
  for (const [id, v] of Object.entries(map)) {
    const until = Number(v) || CONV_MUTE_FOREVER
    if (until === CONV_MUTE_FOREVER || until > now) out.push(id)
    else { delete map[id]; changed = true } // purge des échéances passées
  }
  if (changed) { try {
    const all = JSON.parse(localStorage.getItem('lib_muted_convs') || '{}'); all[myId] = map
    localStorage.setItem('lib_muted_convs', JSON.stringify(all))
  } catch {} }
  return out
}
export function isConvMuted(myId, convId, now = Date.now()) {
  return getConvMuteUntil(myId, convId, now) !== null
}
// durationMs : null/0 = jusqu'à réactivation ; sinon expire après ce délai.
export function setConvMute(myId, convId, durationMs = null, now = Date.now()) {
  const map = readConvMuteMap(myId)
  map[convId] = (!durationMs || durationMs <= 0) ? CONV_MUTE_FOREVER : now + Number(durationMs)
  writeConvMuteMap(myId, map)
  return map[convId]
}
export function clearConvMute(myId, convId) {
  const map = readConvMuteMap(myId)
  if (!(convId in map)) return false
  delete map[convId]
  writeConvMuteMap(myId, map)
  return true
}
// Rétrocompat : bascule permanente (muet ⇄ actif).
export function toggleMuteConv(myId, convId) {
  if (isConvMuted(myId, convId)) { clearConvMute(myId, convId); return false }
  setConvMute(myId, convId, null); return true
}

// ── Épinglage de conversation (par user) ─────────────────────────────────────
// Stocké comme lib_pinned_convs = { [userId]: [convId] }, synchronisé dans
// user_social/{uid}.pinnedConvs. Les conversations épinglées remontent en tête
// de liste (tri stable, ordre habituel conservé entre elles).
export function getPinnedConvs(myId) {
  if (!myId) return []
  try { return JSON.parse(localStorage.getItem('lib_pinned_convs') || '{}')[myId] || [] } catch { return [] }
}
export function isConvPinned(myId, convId) {
  return getPinnedConvs(myId).map(String).includes(String(convId))
}
export function togglePinConv(myId, convId) {
  try {
    const id = String(convId)
    const all = JSON.parse(localStorage.getItem('lib_pinned_convs') || '{}')
    const cur = new Set((all[myId] || []).map(String))
    if (cur.has(id)) cur.delete(id); else cur.add(id)
    all[myId] = [...cur]
    localStorage.setItem('lib_pinned_convs', JSON.stringify(all))
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`user_social/${myId}`, { pinnedConvs: all[myId] })
    }).catch(() => {})
    return cur.has(id)
  } catch { return false }
}

export function blockUser(myId, userId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_blocked') || '{}')
    all[myId] = [...new Set([...(all[myId] || []), userId])]
    localStorage.setItem('lib_blocked', JSON.stringify(all))
    // Sync to Firestore so block persists cross-device
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`user_social/${myId}`, { blocked: all[myId] })
    }).catch(() => {})
  } catch {}
}

export function unblockUser(myId, userId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_blocked') || '{}')
    all[myId] = (all[myId] || []).filter(id => id !== userId)
    localStorage.setItem('lib_blocked', JSON.stringify(all))
    // Sync to Firestore so unblock persists cross-device
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`user_social/${myId}`, { blocked: all[myId] })
    }).catch(() => {})
  } catch {}
}

export function isBlocked(myId, userId) {
  return getBlockedUsers(myId).includes(userId)
}

// ── Messages importants (étoile, personnels, façon WhatsApp) ─────────────────
// Stocké lib_starred = { [userId]: ["convId:msgId", …] }, synchronisé dans
// user_social/{uid}.starred.
export function getStarredMessages(myId) {
  try { return JSON.parse(localStorage.getItem('lib_starred') || '{}')[myId] || [] } catch { return [] }
}
export function isMessageStarred(myId, convId, msgId) {
  return getStarredMessages(myId).includes(`${convId}:${msgId}`)
}
export function toggleStarMessage(myId, convId, msgId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_starred') || '{}')
    const key = `${convId}:${msgId}`
    const cur = new Set(all[myId] || [])
    if (cur.has(key)) cur.delete(key); else cur.add(key)
    all[myId] = [...cur]
    localStorage.setItem('lib_starred', JSON.stringify(all))
    import('./firestore-sync').then(({ syncDoc }) => { syncDoc(`user_social/${myId}`, { starred: all[myId] }) }).catch(() => {})
    return cur.has(key)
  } catch { return false }
}

// ─── Reports ─────────────────────────────────────────────────────────────────
export function reportUser(fromId, fromName, targetId, targetName, reason) {
  try {
    const report = { id: Date.now().toString(), fromId, fromName, targetId, targetName, reason, reportedAt: new Date().toISOString() }
    const all = JSON.parse(localStorage.getItem('lib_reports') || '[]')
    all.push(report)
    localStorage.setItem('lib_reports', JSON.stringify(all))
    // Sync to Firestore so agents can review reports cross-device
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`reports/${report.id}`, report)
    }).catch(() => {})
  } catch {}
}

// ─── Effacer l'historique d'une conversation ─────────────────────────────────
// Vide UNIQUEMENT les messages. La conversation (et donc le contact/ami) est
// CONSERVÉE — on remet juste son aperçu à zéro. Avant, on supprimait aussi la
// conv, ce qui faisait disparaître la personne de la liste (bug signalé).
export function deleteConversationHistory(convId) {
  try {
    const msgs = JSON.parse(localStorage.getItem('lib_messages') || '{}')
    msgs[convId] = []
    localStorage.setItem('lib_messages', JSON.stringify(msgs))
    // Reset de l'aperçu de la conversation (lastMessage), sans la retirer.
    const convs = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    const i = convs.findIndex(c => c.id === convId)
    if (i !== -1) { convs[i] = { ...convs[i], lastMessage: '', lastMessageType: 'text', updatedAt: new Date().toISOString() }; localStorage.setItem('lib_conversations', JSON.stringify(convs)) }
    // Persistance Firestore : le champ réel est `items` (pas `messages`). Sans
    // ça, le listener réhydratait les anciens messages → effacement inopérant.
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`conv_messages/${convId}`, { items: [] })
      if (i !== -1) syncDoc(`conversations/${convId}`, { lastMessage: '', updatedAt: convs[i].updatedAt })
    }).catch(() => {})
  } catch {}
}

// Supprimer DÉFINITIVEMENT une conversation (retire la conv + messages). À
// n'utiliser que pour un retrait d'ami / suppression volontaire, pas pour un
// simple « effacer l'historique ».
export function deleteConversationCompletely(convId) {
  try {
    const msgs = JSON.parse(localStorage.getItem('lib_messages') || '{}')
    delete msgs[convId]
    localStorage.setItem('lib_messages', JSON.stringify(msgs))
    const convs = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    localStorage.setItem('lib_conversations', JSON.stringify(convs.filter(c => c.id !== convId)))
  } catch {}
}
