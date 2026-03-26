// ─── Demo users pre-seeded in the app ───────────────────────────────────────
export const DEMO_USERS = [
  { id: 'u_alex',  name: 'Alex Martin',   email: 'alex@lib.com',   avatar: null, online: true  },
  { id: 'u_sarah', name: 'Sarah Koné',    email: 'sarah@lib.com',  avatar: null, online: false },
  { id: 'u_tom',   name: 'Tom Becker',    email: 'tom@lib.com',    avatar: null, online: true  },
  { id: 'u_julie', name: 'Julie Roy',     email: 'julie@lib.com',  avatar: null, online: false },
  { id: 'u_karim', name: 'Karim Diallo',  email: 'karim@lib.com',  avatar: null, online: true  },
  { id: 'u_ines',  name: 'Inès Larbi',   email: 'ines@lib.com',   avatar: null, online: false },
  { id: 'u_marco', name: 'Marco Silva',   email: 'marco@lib.com',  avatar: null, online: true  },
  { id: 'u_laure', name: 'Laureen Mbaye', email: 'laure@lib.com',  avatar: null, online: false },
]

// ─── User identity ───────────────────────────────────────────────────────────
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
  const me = { id: myId, name: currentUser.name, email: currentUser.email, avatar: currentUser.avatar || null }
  const all = existing ? [...existing.filter(u => u.id !== myId), me] : [...DEMO_USERS, me]
  localStorage.setItem('lib_users', JSON.stringify(all))
  return all
}

export function getUserById(id) {
  const all = getAllUsers() || DEMO_USERS
  return all.find(u => u.id === id) || null
}

export function getUserAvatar(userId) {
  const u = getUserById(userId)
  return u?.avatar || null
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
  } catch {}
}

export function removeFriend(myId, friendId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friends') || '{}')
    all[myId] = (all[myId] || []).filter(id => id !== friendId)
    all[friendId] = (all[friendId] || []).filter(id => id !== myId)
    localStorage.setItem('lib_friends', JSON.stringify(all))
  } catch {}
}

// ─── Friend requests ─────────────────────────────────────────────────────────
export function getFriendRequests(toId) {
  try { return JSON.parse(localStorage.getItem('lib_friend_requests') || '[]').filter(r => r.toId === toId) } catch { return [] }
}

export function sendFriendRequest(fromId, fromName, toId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friend_requests') || '[]')
    if (all.find(r => r.fromId === fromId && r.toId === toId)) return
    all.push({ id: Date.now().toString(), fromId, fromName, toId, sentAt: new Date().toISOString() })
    localStorage.setItem('lib_friend_requests', JSON.stringify(all))
  } catch {}
}

export function acceptFriendRequest(reqId, myId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friend_requests') || '[]')
    const req = all.find(r => r.id === reqId)
    if (req) saveFriend(myId, req.fromId)
    localStorage.setItem('lib_friend_requests', JSON.stringify(all.filter(r => r.id !== reqId)))
  } catch {}
}

export function declineFriendRequest(reqId) {
  try {
    const all = JSON.parse(localStorage.getItem('lib_friend_requests') || '[]')
    localStorage.setItem('lib_friend_requests', JSON.stringify(all.filter(r => r.id !== reqId)))
  } catch {}
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
    updatedAt: new Date().toISOString(),
    lastMessage: `Groupe créé par ${creatorName}`,
  }
  saveConversation(conv)
  sendMessage(conv.id, creatorId, creatorName, 'system', `${creatorName} a créé le groupe "${name}"`)
  return conv
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
  } catch {}
}

export function sendMessage(convId, senderId, senderName, type, content) {
  const msgs = getMessages(convId)
  const msg = { id: Date.now().toString() + Math.random().toString(36).slice(2), senderId, senderName, type, content, timestamp: new Date().toISOString(), votes: {} }
  saveMessages(convId, [...msgs, msg])
  try {
    const all = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
    const idx = all.findIndex(c => c.id === convId)
    if (idx >= 0) {
      all[idx].updatedAt = msg.timestamp
      all[idx].lastMessage = type === 'text' ? content : type === 'event' ? '🎟 Événement partagé' : type === 'group_booking' ? '👥 Réservation de groupe' : type === 'group_auction_bid' ? '🔨 Enchère de groupe' : type === 'purchase_proposal' ? '🛒 Proposition d\'achat' : type === 'auction_vote' ? '🔨 Vote enchère' : '📎'
      localStorage.setItem('lib_conversations', JSON.stringify(all))
    }
  } catch {}
  return msg
}

export function voteOnMessage(convId, msgId, userId, vote) {
  const msgs = getMessages(convId)
  const updated = msgs.map(m => m.id === msgId ? { ...m, votes: { ...m.votes, [userId]: vote } } : m)
  saveMessages(convId, updated)
}

export function deleteMessage(convId, msgId) {
  const msgs = getMessages(convId)
  saveMessages(convId, msgs.filter(m => m.id !== msgId))
}

// ─── Seed demo data on first run ─────────────────────────────────────────────
export function seedDemoData(myId, myName) {
  const key = 'lib_seeded_' + myId
  if (localStorage.getItem(key)) return
  const t = ms => new Date(Date.now() - ms).toISOString()

  const dmId = 'conv_dm_alex_' + myId
  const grpId = 'conv_grp_squad_' + myId

  const conversations = [
    {
      id: dmId, type: 'direct',
      participants: [myId, 'u_alex'],
      names: { [myId]: myName, 'u_alex': 'Alex Martin' },
      updatedAt: t(1000*60*20), lastMessage: 'On devrait y aller 🔥',
    },
    {
      id: grpId, type: 'group', name: 'Squad LIVEINBLACK 🔥', avatar: null,
      members: [
        { userId: myId, name: myName, role: 'admin', contributionPct: 40 },
        { userId: 'u_alex', name: 'Alex Martin', role: 'member', contributionPct: 30 },
        { userId: 'u_sarah', name: 'Sarah Koné', role: 'member', contributionPct: 30 },
      ],
      updatedAt: t(1000*60*5), lastMessage: 'Prêts pour ce soir ?',
    },
  ]

  const existingConvs = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
  const filtered = existingConvs.filter(c => c.id !== dmId && c.id !== grpId)
  localStorage.setItem('lib_conversations', JSON.stringify([...conversations, ...filtered]))

  const allMsgs = JSON.parse(localStorage.getItem('lib_messages') || '{}')
  allMsgs[dmId] = [
    { id: 'dm1', senderId: 'u_alex', senderName: 'Alex Martin', type: 'text', content: "Yo t'as vu la soirée NEON NOIR ?", timestamp: t(1000*60*35), votes: {} },
    { id: 'dm2', senderId: 'u_alex', senderName: 'Alex Martin', type: 'text', content: 'On devrait y aller 🔥', timestamp: t(1000*60*20), votes: {} },
  ]
  allMsgs[grpId] = [
    { id: 'g1', senderId: 'u_alex', senderName: 'Alex Martin', type: 'text', content: 'Salut tout le monde ! 🎉', timestamp: t(1000*60*60), votes: {} },
    { id: 'g2', senderId: 'u_sarah', senderName: 'Sarah Koné', type: 'text', content: 'On réserve les places pour NEON NOIR ?', timestamp: t(1000*60*30), votes: {} },
    { id: 'g3', senderId: 'u_alex', senderName: 'Alex Martin', type: 'text', content: 'Prêts pour ce soir ?', timestamp: t(1000*60*5), votes: {} },
  ]
  localStorage.setItem('lib_messages', JSON.stringify(allMsgs))

  saveFriend(myId, 'u_alex')
  saveFriend(myId, 'u_sarah')
  saveFriend(myId, 'u_tom')

  localStorage.setItem(key, '1')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 1000*60*60) return `${Math.max(1, Math.floor(diff / 60000))}min`
  if (diff < 1000*60*60*24) return d.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('fr', { day: '2-digit', month: 'short' })
}

export function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
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

export function approveGroupBooking(bookingId, userId) {
  const all = getGroupBookings()
  if (!all[bookingId]) return null
  all[bookingId].approvals = { ...(all[bookingId].approvals || {}), [userId]: true }
  localStorage.setItem('lib_group_bookings', JSON.stringify(all))
  return all[bookingId]
}

// ─── Group Auction Bids ───────────────────────────────────────────────────────
export function getGroupAuctionBids() {
  try { return JSON.parse(localStorage.getItem('lib_group_auction_bids') || '{}') } catch { return {} }
}

export function saveGroupAuctionBid(bid) {
  const all = getGroupAuctionBids()
  all[bid.id] = bid
  localStorage.setItem('lib_group_auction_bids', JSON.stringify(all))
}

export function approveGroupAuctionBid(bidId, userId) {
  const all = getGroupAuctionBids()
  if (!all[bidId]) return null
  all[bidId].approvals = { ...(all[bidId].approvals || {}), [userId]: true }
  localStorage.setItem('lib_group_auction_bids', JSON.stringify(all))
  return all[bidId]
}

export function placeGroupAuctionBid(bidId, userId, userName) {
  const all = getGroupAuctionBids()
  if (!all[bidId]) return false
  const bid = all[bidId]
  // Save to lib_bids
  try {
    const saved = JSON.parse(localStorage.getItem('lib_bids') || '[]')
    saved.unshift({
      eventId: bid.eventId,
      eventName: bid.eventName,
      placeType: bid.placeName,
      amount: bid.bidAmount,
      time: new Date().toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('fr-FR'),
      group: true,
      placedBy: userName,
    })
    localStorage.setItem('lib_bids', JSON.stringify(saved))
  } catch {}
  all[bidId].status = 'placed'
  localStorage.setItem('lib_group_auction_bids', JSON.stringify(all))
  return bid
}

export function getCurrentAuctionPrice(eventId, placeName) {
  try {
    const bids = JSON.parse(localStorage.getItem('lib_bids') || '[]')
    const matching = bids.filter(b => b.eventId === eventId && b.placeType === placeName)
    if (matching.length === 0) return 0
    return Math.max(...matching.map(b => b.amount))
  } catch { return 0 }
}

export function addSongToGroupBooking(bookingId, userId, song) {
  const all = getGroupBookings()
  if (!all[bookingId]) return null
  all[bookingId].songSelections = { ...(all[bookingId].songSelections || {}), [userId]: song }
  localStorage.setItem('lib_group_bookings', JSON.stringify(all))
  return all[bookingId]
}
