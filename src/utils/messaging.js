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
  return (name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
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
export function setOnline(userId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_online') || '{}')
    all[userId] = Date.now()
    localStorage.setItem('lib_online', JSON.stringify(all))
  } catch {}
  // Sync to Firestore so other devices can see presence
  import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
    if (!USE_REAL_FIREBASE) return
    import('firebase/firestore').then(({ doc, updateDoc }) => {
      updateDoc(doc(db, 'users', userId), { lastSeen: Date.now(), isOnline: true }).catch(() => {})
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
    import('firebase/firestore').then(({ doc, updateDoc }) => {
      updateDoc(doc(db, 'users', userId), { isOnline: false, lastSeen: Date.now() }).catch(() => {})
    }).catch(() => {})
  }).catch(() => {})
}

export function isOnline(userId) {
  try {
    // 1. Fast local heartbeat (own device → very recent, 90s window)
    const all = JSON.parse(localStorage.getItem('lib_online') || '{}')
    const ts = all[userId]
    if (ts && (Date.now() - ts) < 90000) return true

    // 2. Firestore-synced accounts (populated from Firestore — 5min window)
    try {
      const users = JSON.parse(localStorage.getItem('lib_registered_users') || '[]')
      const u = users.find(u => u.uid === userId || u.id === userId)
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

export function sendFriendRequest(fromId, fromName, toId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friend_requests') || '[]')
    if (all.find(r => r.fromId === fromId && r.toId === toId)) return
    const req = { id: Date.now().toString(), fromId, fromName, toId, sentAt: new Date().toISOString() }
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
export function getConversations(myId) {
  try {
    return JSON.parse(localStorage.getItem('lib_conversations') || '[]')
      .filter(c => c.type === 'direct' ? c.participants.includes(myId) : c.members?.some(m => m.userId === myId))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  } catch { return [] }
}

export function getConversationById(id) {
  try { return JSON.parse(localStorage.getItem('lib_conversations') || '[]').find(c => c.id === id) || null } catch { return null }
}

export function saveConversation(conv) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    const idx = all.findIndex(c => c.id === conv.id)
    if (idx >= 0) all[idx] = conv; else all.push(conv)
    localStorage.setItem('lib_conversations', JSON.stringify(all))
    // Fire-and-forget Firestore sync
    import('./firestore-sync').then(({ syncDoc }) => syncDoc(`conversations/${conv.id}`, conv)).catch(() => {})
  } catch {}
}

export function createDirectConversation(myId, myName, otherId, otherName) {
  const existing = getConversations(myId).find(c => c.type === 'direct' && c.participants.includes(otherId))
  if (existing) return existing
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
  const equalPct = Math.floor(100 / memberIds.length)
  const remainder = 100 - equalPct * memberIds.length
  const members = memberIds.map((uid, i) => ({
    userId: uid,
    name: memberNames[i],
    role: uid === creatorId ? 'admin' : 'member',
    contributionPct: i === 0 ? equalPct + remainder : equalPct,
  }))
  const conv = {
    id: 'grp_' + Date.now(),
    type: 'group',
    name,
    avatar: null,
    members,
    participantIds: memberIds, // used by Firestore queries
    updatedAt: new Date().toISOString(),
    lastMessage: `Groupe créé par ${creatorName}`,
    pinnedMessageId: null,
  }
  saveConversation(conv)
  sendMessage(conv.id, creatorId, creatorName, 'system', `${creatorName} a créé le groupe "${name}"`)
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
      all[idx] = { ...conv, members: remaining }
    }
    localStorage.setItem('lib_conversations', JSON.stringify(all))
    if (remaining.length > 0) {
      sendMessage(convId, userId, userName, 'system', `${userName} a quitté le groupe`)
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
  } catch {}
}

export function updateGroupInfo(convId, updates) {
  try {
    const conv = getConversationById(convId)
    if (!conv) return
    saveConversation({ ...conv, ...updates })
  } catch {}
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
        : type === 'image' ? '📷 Photo'
        : type === 'voice' ? '🎤 Vocal'
        : type === 'story' ? '📰 Article'
        : type === 'poll' ? '📊 Sondage'
        : type === 'event' ? '🎟 Événement'
        : type === 'group_booking' ? '👥 Réservation groupe'
        : type === 'system' ? content
        : '📎'
      localStorage.setItem('lib_conversations', JSON.stringify(all))
      // Sync conv + messages to Firestore
      const updatedConv = all[idx]
      import('./firestore-sync').then(({ syncDoc }) => {
        syncDoc(`conversations/${convId}`, updatedConv)
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

// ─── Group Bookings ───────────────────────────────────────────────────────────
export function getGroupBookings() {
  try { return JSON.parse(localStorage.getItem('lib_group_bookings') || '{}') } catch { return {} }
}

export function saveGroupBooking(booking) {
  const all = getGroupBookings()
  all[booking.id] = booking
  localStorage.setItem('lib_group_bookings', JSON.stringify(all))
}

export function getGroupBookingById(id) {
  return getGroupBookings()[id] || null
}

// Step 1: validate (agree to participate, no payment yet)
export function validateGroupBooking(bookingId, userId) {
  const all = getGroupBookings()
  if (!all[bookingId]) return null
  all[bookingId].validations = { ...(all[bookingId].validations || {}), [userId]: true }
  localStorage.setItem('lib_group_bookings', JSON.stringify(all))
  return all[bookingId]
}

// Step 2: pay share (only after all validated)
export function payGroupBookingShare(bookingId, userId) {
  const all = getGroupBookings()
  if (!all[bookingId]) return null
  all[bookingId].payments = { ...(all[bookingId].payments || {}), [userId]: true }
  localStorage.setItem('lib_group_bookings', JSON.stringify(all))
  return all[bookingId]
}

// Legacy compatibility — keep for EventDetailPage
export function approveGroupBooking(bookingId, userId) {
  return validateGroupBooking(bookingId, userId)
}

export function addSongToGroupBooking(bookingId, userId, song) {
  const all = getGroupBookings()
  if (!all[bookingId]) return null
  all[bookingId].songSelections = { ...(all[bookingId].songSelections || {}), [userId]: song }
  localStorage.setItem('lib_group_bookings', JSON.stringify(all))
  return all[bookingId]
}

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
    return convs.reduce((sum, c) => sum + getUnreadCount(c.id, myId), 0)
  } catch { return 0 }
}

// ─── Block / Unblock ─────────────────────────────────────────────────────────
export function getBlockedUsers(myId) {
  try { return JSON.parse(localStorage.getItem('lib_blocked') || '{}')[myId] || [] } catch { return [] }
}

export function blockUser(myId, userId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_blocked') || '{}')
    all[myId] = [...new Set([...(all[myId] || []), userId])]
    localStorage.setItem('lib_blocked', JSON.stringify(all))
  } catch {}
}

export function unblockUser(myId, userId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_blocked') || '{}')
    all[myId] = (all[myId] || []).filter(id => id !== userId)
    localStorage.setItem('lib_blocked', JSON.stringify(all))
  } catch {}
}

export function isBlocked(myId, userId) {
  return getBlockedUsers(myId).includes(userId)
}

// ─── Reports ─────────────────────────────────────────────────────────────────
export function reportUser(fromId, fromName, targetId, targetName, reason) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_reports') || '[]')
    all.push({ id: Date.now().toString(), fromId, fromName, targetId, targetName, reason, reportedAt: new Date().toISOString() })
    localStorage.setItem('lib_reports', JSON.stringify(all))
  } catch {}
}

// ─── Delete conversation history ─────────────────────────────────────────────
export function deleteConversationHistory(convId) {
  try {
    // Supprime les messages
    const msgs = JSON.parse(localStorage.getItem('lib_messages') || '{}')
    delete msgs[convId]
    localStorage.setItem('lib_messages', JSON.stringify(msgs))
    // Supprime la conversation elle-même
    const convs = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    localStorage.setItem('lib_conversations', JSON.stringify(convs.filter(c => c.id !== convId)))
  } catch {}
}
