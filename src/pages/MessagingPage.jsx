import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { events as BASE_EVENTS } from '../data/events'

function getAllEvents() {
  try { return [...BASE_EVENTS, ...JSON.parse(localStorage.getItem('lib_created_events') || '[]')] } catch { return BASE_EVENTS }
}
import {
  getUserId, initUsers, getAllUsers, getUserById, getInitials, formatTime,
  getFriends, saveFriend, removeFriend,
  getFriendRequests, sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  getConversations, getConversationById, saveConversation,
  createDirectConversation, createGroup,
  getMessages, sendMessage, voteOnMessage,
  seedDemoData, DEMO_USERS,
  getGroupBookings, approveGroupBooking, addSongToGroupBooking,
  getGroupAuctionBids, approveGroupAuctionBid, placeGroupAuctionBid, getCurrentAuctionPrice
} from '../utils/messaging'
import { deductFunds, getBalance } from '../utils/wallet'

// ─── Avatar helper ────────────────────────────────────────────────────────────
function Avatar({ user, size = 10, className = '' }) {
  const initials = getInitials(user?.name || '?')
  const colors = ['#d4af37', '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b']
  const color = user?.id ? colors[user.id.charCodeAt(user.id.length - 1) % colors.length] : '#d4af37'
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name}
        className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }
  return (
    <div
      className={`w-${size} h-${size} rounded-full flex items-center justify-center flex-shrink-0 text-black font-bold text-xs ${className}`}
      style={{ background: color, fontSize: size <= 8 ? 10 : 12 }}
    >
      {initials}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MessagingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const myId = getUserId(user)
  const myName = user?.name || 'Moi'

  const [view, setView] = useState('list') // 'list' | 'chat' | 'friends' | 'new-group'
  const [activeConvId, setActiveConvId] = useState(null)
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [allUsers, setAllUsers] = useState([])
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])
  const [friendTab, setFriendTab] = useState('friends')
  const [friendSearch, setFriendSearch] = useState('')

  // New group wizard
  const [groupName, setGroupName] = useState('')
  const [groupStep, setGroupStep] = useState(1)
  const [selectedMembers, setSelectedMembers] = useState([])
  const [contributions, setContributions] = useState({})

  // Group settings
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const [editGroupName, setEditGroupName] = useState('')
  const [pendingContribs, setPendingContribs] = useState({})
  const [confirmDialog, setConfirmDialog] = useState(null) // { type:'crown'|'rename', target?, targetName?, newName? }

  // Proposal modal
  const [showProposalModal, setShowProposalModal] = useState(false)
  const [proposalType, setProposalType] = useState('purchase')
  const [proposalDesc, setProposalDesc] = useState('')
  const [proposalAmount, setProposalAmount] = useState('')
  const [proposalPlace, setProposalPlace] = useState('')

  // Group bookings
  const [groupBookings, setGroupBookings] = useState({})
  const [songPickerModal, setSongPickerModal] = useState(null) // { bookingId }
  const [songInput, setSongInput] = useState({ title: '', artist: '' })
  const [groupWalletError, setGroupWalletError] = useState(null) // { msg }

  // Group auction bids
  const [groupAuctionBids, setGroupAuctionBids] = useState({})

  // Attach menu
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const photoInputRef = useRef(null)

  const messagesEndRef = useRef(null)

  // ── Init ──
  useEffect(() => {
    if (!user) return
    const users = initUsers(user)
    setAllUsers(users || DEMO_USERS)
    seedDemoData(myId, myName)
    refresh()
  }, [])

  function refresh() {
    setConversations(getConversations(myId))
    setFriends(getFriends(myId))
    setRequests(getFriendRequests(myId))
    setGroupBookings(getGroupBookings())
    setGroupAuctionBids(getGroupAuctionBids())
  }

  useEffect(() => {
    if (activeConvId) {
      setMessages(getMessages(activeConvId))
      setGroupBookings(getGroupBookings())
      setGroupAuctionBids(getGroupAuctionBids())
    }
  }, [activeConvId])

  function handleApproveGroupBooking(bookingId) {
    const booking = getGroupBookings()[bookingId]
    if (booking) {
      // Use member's contribution percentage if available, else equal split
      const conv = booking.convId ? getConversationById(booking.convId) : activeConv
      const myMember = conv?.members?.find((m) => m.userId === myId)
      const memberCount = conv?.members?.length || Math.max(booking.groupMin || 1, 1)
      const myPct = myMember?.contributionPct ?? Math.round(100 / memberCount)
      const myShare = Math.round((booking.totalPrice * myPct / 100) * 100) / 100
      const deducted = deductFunds(myId, myShare, `Réservation groupe — ${booking.eventName}`)
      if (!deducted) {
        setGroupWalletError({ msg: `Solde insuffisant (${myShare}€ requis — ta part : ${myPct}%). Rechargez votre portefeuille.` })
        setTimeout(() => setGroupWalletError(null), 4000)
        return
      }
    }
    approveGroupBooking(bookingId, myId)
    setGroupBookings(getGroupBookings())
  }

  function handleApproveGroupAuctionBid(bidId) {
    const bid = getGroupAuctionBids()[bidId]
    if (!bid || bid.status !== 'pending') return
    const currentPrice = getCurrentAuctionPrice(bid.eventId, bid.placeName)
    if (bid.bidAmount <= currentPrice) return // outbid — invalid

    // Use member's contribution percentage from the group conv
    const conv = getConversationById(bid.convId) || activeConv
    const myMember = conv?.members?.find((m) => m.userId === myId)
    const memberCount = conv?.members?.length || Math.max(bid.convMemberCount || 1, 1)
    const myPct = myMember?.contributionPct ?? Math.round(100 / memberCount)
    const myShare = Math.round((bid.bidAmount * myPct / 100) * 100) / 100

    const deducted = deductFunds(myId, myShare, `Enchère groupe — ${bid.eventName}`)
    if (!deducted) {
      setGroupWalletError({ msg: `Solde insuffisant (${myShare}€ requis — ta part : ${myPct}% de ${bid.bidAmount}€). Rechargez votre portefeuille.` })
      setTimeout(() => setGroupWalletError(null), 4000)
      return
    }
    const updated = approveGroupAuctionBid(bidId, myId)
    if (!updated) return
    const totalApprovals = Object.keys(updated.approvals || {}).length
    if (totalApprovals >= (updated.convMemberCount || 2)) {
      placeGroupAuctionBid(bidId, myId, activeConv?.name || 'Groupe')
    }
    setGroupAuctionBids(getGroupAuctionBids())
  }

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file || !activeConvId) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      sendMessage(activeConvId, myId, myName, 'image', ev.target.result)
      setMessages(getMessages(activeConvId))
      setConversations(getConversations(myId))
    }
    reader.readAsDataURL(file)
  }

  function handleAddSong(bookingId) {
    if (!songInput.title.trim()) return
    addSongToGroupBooking(bookingId, myId, { title: songInput.title.trim(), artist: songInput.artist.trim() })
    setGroupBookings(getGroupBookings())
    setSongPickerModal(null)
    setSongInput({ title: '', artist: '' })
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Poll every 2s
  useEffect(() => {
    const id = setInterval(() => {
      setConversations(getConversations(myId))
      setFriends(getFriends(myId))
      setRequests(getFriendRequests(myId))
      if (activeConvId) setMessages(getMessages(activeConvId))
    }, 2000)
    return () => clearInterval(id)
  }, [myId, activeConvId])

  // ── Actions ──
  function openConv(convId) {
    setActiveConvId(convId)
    setView('chat')
    setMessages(getMessages(convId))
  }

  function handleSend() {
    if (!inputText.trim() || !activeConvId) return
    sendMessage(activeConvId, myId, myName, 'text', inputText.trim())
    setInputText('')
    setMessages(getMessages(activeConvId))
    setConversations(getConversations(myId))
  }

  function handleVote(msgId, vote) {
    if (!activeConvId) return
    voteOnMessage(activeConvId, msgId, myId, vote)
    setMessages(getMessages(activeConvId))
  }

  function handleSendProposal() {
    if (!proposalDesc.trim() || !activeConvId) return
    const type = proposalType === 'purchase' ? 'purchase_proposal' : 'auction_vote'
    const content = JSON.stringify({ description: proposalDesc, amount: proposalAmount, place: proposalPlace })
    sendMessage(activeConvId, myId, myName, type, content)
    setShowProposalModal(false)
    setProposalDesc(''); setProposalAmount(''); setProposalPlace('')
    setMessages(getMessages(activeConvId))
    setConversations(getConversations(myId))
  }

  function handleStartDM(otherId) {
    const other = getUserById(otherId) || allUsers.find(u => u.id === otherId)
    if (!other) return
    const conv = createDirectConversation(myId, myName, otherId, other.name)
    setConversations(getConversations(myId))
    openConv(conv.id)
  }

  function handleSendRequest(userId) {
    sendFriendRequest(myId, myName, userId)
    refresh()
  }

  function handleAccept(reqId) {
    acceptFriendRequest(reqId, myId)
    refresh()
    setAllUsers(getAllUsers() || DEMO_USERS)
  }

  function handleDecline(reqId) {
    declineFriendRequest(reqId)
    setRequests(getFriendRequests(myId))
  }

  function handleRemoveFriend(friendId) {
    removeFriend(myId, friendId)
    setFriends(getFriends(myId))
  }

  function handleCreateGroup() {
    if (groupStep === 1) {
      if (!groupName.trim() || selectedMembers.length === 0) return
      const allM = [myId, ...selectedMembers]
      const eq = Math.floor(100 / allM.length)
      const rem = 100 - eq * allM.length
      const c = {}
      allM.forEach((id, i) => { c[id] = i === 0 ? eq + rem : eq })
      setContributions(c)
      setGroupStep(2)
    } else {
      const allM = [myId, ...selectedMembers]
      const memberNames = allM.map(id => {
        if (id === myId) return myName
        const u = getUserById(id) || allUsers.find(x => x.id === id)
        return u?.name || id
      })
      const conv = createGroup(groupName.trim(), myId, myName, allM, memberNames)
      // Override with custom contributions
      const saved = getConversationById(conv.id)
      if (saved) {
        saved.members = saved.members.map(m => ({ ...m, contributionPct: contributions[m.userId] ?? m.contributionPct }))
        saveConversation(saved)
      }
      setConversations(getConversations(myId))
      setGroupName(''); setSelectedMembers([]); setGroupStep(1)
      setView('list')
      openConv(conv.id)
    }
  }

  function handleRenameGroup(newName) {
    if (!newName?.trim() || !activeConv) return
    saveConversation({ ...activeConv, name: newName.trim() })
    sendMessage(activeConv.id, myId, myName, 'system', `${myName} a renommé le groupe en "${newName.trim()}"`)
    setConversations(getConversations(myId))
    setMessages(getMessages(activeConv.id))
    setEditGroupName('')
  }

  function handleRemoveMember(memberId) {
    if (!activeConv || memberId === myId) return
    const removed = activeConv.members.find((m) => m.userId === memberId)
    const remaining = activeConv.members.filter((m) => m.userId !== memberId)
    if (remaining.length > 0 && (removed?.contributionPct || 0) > 0) {
      // Redistribute the removed member's percentage evenly among remaining members
      const freed = removed.contributionPct
      const share = Math.floor(freed / remaining.length)
      const leftover = freed - share * remaining.length
      const updatedMembers = remaining.map((m, i) => ({
        ...m,
        contributionPct: (m.contributionPct || 0) + share + (i === 0 ? leftover : 0),
      }))
      saveConversation({ ...activeConv, members: updatedMembers })
      sendMessage(activeConv.id, myId, myName, 'system', `${removed.name || memberId} a été retiré du groupe`)
    } else {
      saveConversation({ ...activeConv, members: remaining })
    }
    setConversations(getConversations(myId))
  }

  function handleSetAdmin(memberId) {
    if (!activeConv) return
    const target = activeConv.members.find(m => m.userId === memberId)
    const updated = { ...activeConv, members: activeConv.members.map(m => m.userId === memberId ? { ...m, role: 'admin' } : m) }
    saveConversation(updated)
    if (target) sendMessage(activeConv.id, myId, myName, 'system', `${myName} a nommé ${target.name} admin du groupe`)
    setConversations(getConversations(myId))
    setMessages(getMessages(activeConv.id))
  }

  function handleUpdateContrib(memberId, val) {
    const n = Math.max(0, Math.min(100, parseInt(val) || 0))
    setPendingContribs(prev => ({ ...prev, [memberId]: n }))
  }

  function handleSaveContribs() {
    if (!activeConv) return
    const updated = { ...activeConv, members: activeConv.members.map(m => ({ ...m, contributionPct: pendingContribs[m.userId] ?? m.contributionPct })) }
    saveConversation(updated)
    setConversations(getConversations(myId))
  }

  const activeConv = conversations.find(c => c.id === activeConvId) || getConversationById(activeConvId)
  const amAdmin = activeConv?.type === 'group' && activeConv?.members?.find(m => m.userId === myId)?.role === 'admin'
  const pendingRequests = requests.length

  // ── Render helpers ──
  function getConvDisplay(conv) {
    if (conv.type === 'direct') {
      const otherId = conv.participants?.find(id => id !== myId)
      const other = getUserById(otherId) || allUsers.find(u => u.id === otherId)
      return { name: other?.name || 'Utilisateur', user: other, isGroup: false }
    }
    return { name: conv.name, user: null, isGroup: true, memberCount: conv.members?.length || 0 }
  }

  // ────────────────── VIEWS ────────────────────────────────────────────────────

  // ── Conversation List ──
  if (view === 'list') {
    return (
      <Layout>
        <div className="flex flex-col h-[calc(100vh-112px)]">
          {/* Header */}
          <div className="px-4 pt-5 pb-3 border-b border-[#1a1a1a]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-3xl font-black text-[#d4af37]" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                Messagerie
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => { setView('friends'); setFriendTab('requests') }}
                  className="relative w-9 h-9 rounded-xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center hover:border-[#d4af37]/50 transition-colors"
                >
                  <span className="text-sm">👥</span>
                  {pendingRequests > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#d4af37] text-black text-[9px] font-bold flex items-center justify-center">
                      {pendingRequests}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setView('new-group'); setGroupStep(1); setGroupName(''); setSelectedMembers([]) }}
                  className="w-9 h-9 rounded-xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center hover:border-[#d4af37]/50 transition-colors"
                >
                  <span className="text-sm">✦</span>
                </button>
              </div>
            </div>
          </div>

          {/* Conv list */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                <span className="text-5xl">💬</span>
                <p className="text-sm">Aucune conversation</p>
                <button
                  onClick={() => setView('friends')}
                  className="text-xs text-[#d4af37] border border-[#d4af37]/30 px-4 py-2 rounded-xl hover:bg-[#d4af37]/10"
                >
                  Trouver des amis
                </button>
              </div>
            ) : (
              conversations.map(conv => {
                const { name, user: otherUser, isGroup, memberCount } = getConvDisplay(conv)
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConv(conv.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#111] border-b border-[#111] text-left transition-colors"
                  >
                    {isGroup ? (
                      <div className="w-10 h-10 rounded-full bg-[#d4af37]/20 border border-[#d4af37]/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">👥</span>
                      </div>
                    ) : (
                      <Avatar user={otherUser} size={10} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm font-semibold truncate">{name}</span>
                        <span className="text-gray-600 text-[10px] ml-2 flex-shrink-0">{formatTime(conv.updatedAt)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-gray-500 text-xs truncate">{conv.lastMessage || 'Démarrer la conversation'}</p>
                        {isGroup && <span className="text-gray-700 text-[10px] ml-2 flex-shrink-0">{memberCount} membres</span>}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </Layout>
    )
  }

  // ── Friends panel ──
  if (view === 'friends') {
    const nonFriends = allUsers.filter(u => u.id !== myId && !friends.includes(u.id))
    const searched = nonFriends.filter(u => u.name.toLowerCase().includes(friendSearch.toLowerCase()))
    return (
      <Layout>
        <div className="flex flex-col h-[calc(100vh-112px)]">
          <div className="px-4 pt-5 pb-3 border-b border-[#1a1a1a] flex items-center gap-3">
            <button onClick={() => setView('list')} className="text-gray-400 hover:text-white p-1">←</button>
            <h2 className="text-xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>Amis</h2>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#1a1a1a]">
            {[
              { key: 'friends', label: 'Mes amis' },
              { key: 'add', label: 'Ajouter' },
              { key: 'requests', label: `Demandes${pendingRequests > 0 ? ` (${pendingRequests})` : ''}` },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setFriendTab(t.key)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${friendTab === t.key ? 'text-[#d4af37] border-b-2 border-[#d4af37]' : 'text-gray-500'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {friendTab === 'friends' && (
              friends.length === 0 ? (
                <div className="text-center py-12 text-gray-600">
                  <p className="text-4xl mb-2">🤝</p>
                  <p className="text-sm">Aucun ami pour l'instant</p>
                </div>
              ) : (
                friends.map(fId => {
                  const f = getUserById(fId) || allUsers.find(u => u.id === fId)
                  if (!f) return null
                  return (
                    <div key={fId} className="flex items-center gap-3 p-3 bg-[#111] rounded-xl border border-[#1a1a1a]">
                      <Avatar user={f} size={10} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">{f.name}</p>
                        <p className="text-gray-600 text-xs">{f.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStartDM(fId)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/20"
                        >
                          💬
                        </button>
                        <button
                          onClick={() => handleRemoveFriend(fId)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })
              )
            )}

            {friendTab === 'add' && (
              <>
                <input
                  className="input-dark text-sm"
                  placeholder="Rechercher un membre..."
                  value={friendSearch}
                  onChange={e => setFriendSearch(e.target.value)}
                />
                {searched.map(u => {
                  const alreadySent = getFriendRequests(u.id).some(r => r.fromId === myId)
                  return (
                    <div key={u.id} className="flex items-center gap-3 p-3 bg-[#111] rounded-xl border border-[#1a1a1a]">
                      <Avatar user={u} size={10} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">{u.name}</p>
                        <p className="text-gray-600 text-xs">{u.email}</p>
                      </div>
                      <button
                        onClick={() => handleSendRequest(u.id)}
                        disabled={alreadySent}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          alreadySent
                            ? 'bg-[#1a1a1a] border-[#333] text-gray-600 cursor-not-allowed'
                            : 'bg-[#d4af37]/10 border-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/20'
                        }`}
                      >
                        {alreadySent ? 'Envoyée' : '+ Ajouter'}
                      </button>
                    </div>
                  )
                })}
                {searched.length === 0 && friendSearch && (
                  <p className="text-center text-gray-600 text-sm py-8">Aucun résultat</p>
                )}
              </>
            )}

            {friendTab === 'requests' && (
              requests.length === 0 ? (
                <div className="text-center py-12 text-gray-600">
                  <p className="text-4xl mb-2">📭</p>
                  <p className="text-sm">Aucune demande en attente</p>
                </div>
              ) : (
                requests.map(req => (
                  <div key={req.id} className="flex items-center gap-3 p-3 bg-[#111] rounded-xl border border-[#1a1a1a]">
                    <div className="w-10 h-10 rounded-full bg-[#d4af37]/20 flex items-center justify-center flex-shrink-0 text-sm font-bold text-[#d4af37]">
                      {getInitials(req.fromName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold">{req.fromName}</p>
                      <p className="text-gray-600 text-xs">{formatTime(req.sentAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(req.id)} className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20">
                        ✓
                      </button>
                      <button onClick={() => handleDecline(req.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20">
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </Layout>
    )
  }

  // ── New Group wizard ──
  if (view === 'new-group') {
    const availableMembers = allUsers.filter(u => u.id !== myId)
    return (
      <Layout>
        <div className="flex flex-col h-[calc(100vh-112px)]">
          <div className="px-4 pt-5 pb-3 border-b border-[#1a1a1a] flex items-center gap-3">
            <button onClick={() => { setView('list'); setGroupStep(1) }} className="text-gray-400 hover:text-white p-1">←</button>
            <h2 className="text-xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              {groupStep === 1 ? 'Nouveau groupe' : 'Contributions'}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {groupStep === 1 ? (
              <>
                <input
                  className="input-dark"
                  placeholder="Nom du groupe..."
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                />
                <p className="text-gray-500 text-xs">Sélectionne les membres ({selectedMembers.length} choisis)</p>
                <div className="space-y-2">
                  {availableMembers.map(u => {
                    const selected = selectedMembers.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        onClick={() => setSelectedMembers(prev =>
                          selected ? prev.filter(id => id !== u.id) : [...prev, u.id]
                        )}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          selected ? 'border-[#d4af37]/50 bg-[#d4af37]/10' : 'border-[#1a1a1a] bg-[#111] hover:border-[#333]'
                        }`}
                      >
                        <Avatar user={u} size={10} />
                        <div className="flex-1 text-left">
                          <p className="text-white text-sm font-semibold">{u.name}</p>
                          <p className="text-gray-600 text-xs">{u.email}</p>
                        </div>
                        {selected && <span className="text-[#d4af37]">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-sm">Définis la part de contribution de chaque membre (total = 100%)</p>
                <div className="space-y-3">
                  {[myId, ...selectedMembers].map(id => {
                    const u = id === myId ? { id: myId, name: myName } : (getUserById(id) || allUsers.find(x => x.id === id))
                    const total = Object.values(contributions).reduce((a, b) => a + b, 0)
                    return (
                      <div key={id} className="flex items-center gap-3 p-3 bg-[#111] rounded-xl border border-[#1a1a1a]">
                        <Avatar user={u} size={9} />
                        <div className="flex-1">
                          <p className="text-white text-xs font-semibold">{u?.name || id}{id === myId ? ' (toi)' : ''}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={contributions[id] || 0}
                            onChange={e => {
                              const n = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                              setContributions(prev => ({ ...prev, [id]: n }))
                            }}
                            className="w-16 bg-[#1a1a1a] border border-[#333] text-white text-xs rounded-lg px-2 py-1 text-center"
                          />
                          <span className="text-gray-500 text-xs">%</span>
                        </div>
                      </div>
                    )
                  })}
                  <div className="text-center">
                    <span className={`text-xs font-semibold ${
                      Object.values(contributions).reduce((a, b) => a + b, 0) === 100
                        ? 'text-green-400'
                        : 'text-red-400'
                    }`}>
                      Total : {Object.values(contributions).reduce((a, b) => a + b, 0)}%
                      {Object.values(contributions).reduce((a, b) => a + b, 0) !== 100 && ' ≠ 100%'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="p-4 border-t border-[#1a1a1a]">
            <button
              onClick={handleCreateGroup}
              disabled={groupStep === 1
                ? (!groupName.trim() || selectedMembers.length === 0)
                : Object.values(contributions).reduce((a, b) => a + b, 0) !== 100
              }
              className="btn-gold w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {groupStep === 1 ? 'Suivant →' : 'Créer le groupe'}
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  // ── Chat view ──
  if (view === 'chat' && activeConv) {
    const { name, user: otherUser, isGroup } = getConvDisplay(activeConv)

    return (
      <Layout>
        <div className="flex flex-col h-[calc(100vh-112px)]">
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-center gap-3">
            <button onClick={() => { setView('list'); refresh() }} className="text-gray-400 hover:text-white p-1 flex-shrink-0">←</button>
            {isGroup ? (
              <div className="w-9 h-9 rounded-full bg-[#d4af37]/20 border border-[#d4af37]/30 flex items-center justify-center flex-shrink-0">
                <span>👥</span>
              </div>
            ) : (
              <Avatar user={otherUser} size={9} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{name}</p>
              {isGroup && (
                <p className="text-gray-600 text-[10px]">{activeConv.members?.length} membres</p>
              )}
            </div>
            {isGroup && (
              <button
                onClick={() => {
                  setShowGroupSettings(true)
                  setEditGroupName(activeConv.name)
                  const pc = {}
                  activeConv.members?.forEach(m => { pc[m.userId] = m.contributionPct })
                  setPendingContribs(pc)
                }}
                className="w-8 h-8 rounded-xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-xs hover:border-[#d4af37]/50"
              >
                ⚙️
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                myId={myId}
                onVote={handleVote}
                allUsers={allUsers}
                groupBookings={groupBookings}
                groupAuctionBids={groupAuctionBids}
                onApproveGroupBooking={handleApproveGroupBooking}
                onApproveGroupAuctionBid={handleApproveGroupAuctionBid}
                onOpenSongPicker={(id) => { setSongPickerModal({ bookingId: id }); setSongInput({ title: '', artist: '' }) }}
                navigate={navigate}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Wallet error toast */}
          {groupWalletError && (
            <div className="mx-4 mb-2 bg-red-500/10 border border-red-500/30 rounded-2xl p-3 flex items-start gap-2 animate-fade-in">
              <span className="text-red-400 flex-shrink-0">💳</span>
              <div>
                <p className="text-red-400 text-xs font-bold">Solde insuffisant</p>
                <p className="text-gray-500 text-[10px]">{groupWalletError.msg}</p>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-[#1a1a1a] relative">
            {/* Attach menu popup */}
            {showAttachMenu && (
              <div className="absolute bottom-16 left-4 z-40 bg-[#0d0d0d] border border-[#222] rounded-2xl shadow-2xl overflow-hidden w-56">
                <button
                  onClick={() => { navigate(`/evenements?share=${activeConvId}`); setShowAttachMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a1a] transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/20 flex items-center justify-center text-base flex-shrink-0">🎟</div>
                  <div>
                    <p className="text-white text-sm font-semibold">Proposer un événement</p>
                    <p className="text-gray-600 text-[10px]">Partage une fiche événement</p>
                  </div>
                </button>
                <div className="h-px bg-[#1a1a1a]" />
                <button
                  onClick={() => { photoInputRef.current?.click(); setShowAttachMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a1a] transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-base flex-shrink-0">📷</div>
                  <div>
                    <p className="text-white text-sm font-semibold">Envoyer une photo</p>
                    <p className="text-gray-600 text-[10px]">JPG, PNG, WEBP</p>
                  </div>
                </button>
                {isGroup && amAdmin && (
                  <>
                    <div className="h-px bg-[#1a1a1a]" />
                    <button
                      onClick={() => { setShowProposalModal(true); setShowAttachMenu(false) }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a1a] transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-base flex-shrink-0">📋</div>
                      <div>
                        <p className="text-white text-sm font-semibold">Proposition de groupe</p>
                        <p className="text-gray-600 text-[10px]">Vote achat / enchère</p>
                      </div>
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="flex items-end gap-2">
              <button
                onClick={() => setShowAttachMenu(v => !v)}
                className={`w-9 h-9 flex-shrink-0 rounded-xl border flex items-center justify-center text-lg transition-colors ${showAttachMenu ? 'bg-[#d4af37]/20 border-[#d4af37]/40 text-[#d4af37]' : 'bg-[#d4af37]/10 border-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/20'}`}
              >
                {showAttachMenu ? '×' : '+'}
              </button>
              {/* Hidden photo input */}
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              <input
                className="flex-1 bg-[#111] border border-[#222] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#d4af37]/40 placeholder-gray-600"
                placeholder="Message..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { handleSend(); setShowAttachMenu(false) } }}
                onFocus={() => setShowAttachMenu(false)}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim()}
                className="w-9 h-9 flex-shrink-0 rounded-xl bg-[#d4af37] text-black flex items-center justify-center font-bold text-base disabled:opacity-30 hover:bg-[#c9a227] transition-colors"
              >
                ↑
              </button>
            </div>
          </div>
        </div>

        {/* Group Settings Modal */}
        {showGroupSettings && activeConv.type === 'group' && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowGroupSettings(false)} />
            <div className="relative w-full max-w-md bg-[#0d0d0d] border border-[#1a1a1a] rounded-t-3xl max-h-[80vh] overflow-y-auto pb-8">
              <div className="p-5 border-b border-[#1a1a1a]">
                <div className="w-10 h-1 bg-[#333] rounded-full mx-auto mb-4" />
                <h3 className="text-white font-bold text-center">Paramètres du groupe</h3>
              </div>

              <div className="p-4 space-y-5">
                {/* Rename */}
                {amAdmin && (
                  <div className="space-y-2">
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Nom du groupe</p>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 bg-[#111] border border-[#222] text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#d4af37]/40"
                        value={editGroupName}
                        onChange={e => setEditGroupName(e.target.value)}
                      />
                      <button
                        onClick={() => editGroupName.trim() && setConfirmDialog({ type: 'rename', newName: editGroupName.trim() })}
                        disabled={!editGroupName.trim() || editGroupName.trim() === activeConv.name}
                        className="px-3 py-2 bg-[#d4af37]/10 border border-[#d4af37]/20 text-[#d4af37] text-xs rounded-xl hover:bg-[#d4af37]/20 disabled:opacity-30"
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                )}

                {/* Members */}
                <div className="space-y-2">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Membres & contributions</p>
                  {activeConv.members?.map(m => {
                    const u = getUserById(m.userId) || allUsers.find(x => x.id === m.userId) || { id: m.userId, name: m.name }
                    const isMe = m.userId === myId
                    return (
                      <div key={m.userId} className="flex items-center gap-2 p-3 bg-[#111] rounded-xl border border-[#1a1a1a]">
                        <Avatar user={u} size={8} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-white text-xs font-semibold truncate">{m.name || u.name}</p>
                            {m.role === 'admin' && <span className="text-[10px]">👑</span>}
                            {isMe && <span className="text-[10px] text-gray-600">(toi)</span>}
                          </div>
                        </div>
                        {amAdmin ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={pendingContribs[m.userId] ?? m.contributionPct}
                              onChange={e => handleUpdateContrib(m.userId, e.target.value)}
                              className="w-12 bg-[#1a1a1a] border border-[#333] text-white text-xs rounded-lg px-1 py-1 text-center"
                            />
                            <span className="text-gray-600 text-[10px]">%</span>
                            {!isMe && (
                              <div className="flex gap-1 ml-1">
                                {m.role !== 'admin' && (
                                  <button
                                    onClick={() => setConfirmDialog({ type: 'crown', target: m.userId, targetName: m.name || u.name })}
                                    className="w-6 h-6 rounded-lg bg-[#d4af37]/10 text-[#d4af37] text-[10px] flex items-center justify-center hover:bg-[#d4af37]/20"
                                    title="Nommer admin"
                                  >
                                    👑
                                  </button>
                                )}
                                <button onClick={() => handleRemoveMember(m.userId)} className="w-6 h-6 rounded-lg bg-red-500/10 text-red-400 text-[10px] flex items-center justify-center hover:bg-red-500/20" title="Retirer">
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500 text-xs">{m.contributionPct}%</span>
                        )}
                      </div>
                    )
                  })}
                  {amAdmin && (() => {
                    const total = Object.values(pendingContribs).reduce((a, b) => a + b, 0)
                    const ok = total === 100
                    return (
                      <div className="space-y-2 pt-1">
                        <p className={`text-xs text-center font-semibold ${ok ? 'text-green-400' : 'text-red-400'}`}>
                          Total : {total}%{!ok && ' ≠ 100%'}
                        </p>
                        <button
                          onClick={handleSaveContribs}
                          disabled={!ok}
                          className="w-full py-2 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-[#d4af37]/10 border-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/20"
                        >
                          Sauvegarder les contributions
                        </button>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Proposal Modal */}
        {showProposalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowProposalModal(false)} />
            <div className="relative w-full max-w-sm bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl p-5 space-y-4">
              <h3 className="text-white font-bold text-center">Proposition de groupe</h3>

              {/* Type selector */}
              <div className="flex gap-2">
                {[
                  { key: 'purchase', label: '🛒 Achat groupé' },
                  { key: 'auction', label: '🔨 Enchère groupée' },
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => setProposalType(t.key)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      proposalType === t.key
                        ? 'bg-[#d4af37]/20 border-[#d4af37]/50 text-[#d4af37]'
                        : 'border-[#222] text-gray-500 hover:border-[#333]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <input
                className="input-dark text-sm"
                placeholder="Description (ex: VIP Golden Gate × 4)"
                value={proposalDesc}
                onChange={e => setProposalDesc(e.target.value)}
              />
              <input
                className="input-dark text-sm"
                placeholder="Type de place (ex: VIP, Standard...)"
                value={proposalPlace}
                onChange={e => setProposalPlace(e.target.value)}
              />
              <input
                className="input-dark text-sm"
                placeholder={proposalType === 'purchase' ? 'Montant total (€)' : 'Mise enchère (€)'}
                type="number"
                value={proposalAmount}
                onChange={e => setProposalAmount(e.target.value)}
              />

              <div className="flex gap-2">
                <button onClick={() => setShowProposalModal(false)} className="btn-outline flex-1 text-sm">
                  Annuler
                </button>
                <button onClick={handleSendProposal} disabled={!proposalDesc.trim()} className="btn-gold flex-1 text-sm disabled:opacity-40">
                  Envoyer →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Dialog (crown / rename) */}
        {confirmDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setConfirmDialog(null)} />
            <div className="relative w-full max-w-xs bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl p-5 space-y-4">
              {confirmDialog.type === 'crown' ? (
                <>
                  <div className="text-center space-y-1">
                    <span className="text-3xl">👑</span>
                    <h3 className="text-white font-bold">Nommer admin</h3>
                    <p className="text-gray-400 text-sm">
                      Nommer <span className="text-white font-semibold">{confirmDialog.targetName}</span> comme admin du groupe ?
                    </p>
                    <p className="text-gray-600 text-xs">Il aura les mêmes droits que toi.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDialog(null)} className="btn-outline flex-1 text-sm">Annuler</button>
                    <button
                      onClick={() => { handleSetAdmin(confirmDialog.target); setConfirmDialog(null) }}
                      className="btn-gold flex-1 text-sm"
                    >
                      Confirmer
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center space-y-1">
                    <span className="text-3xl">✏️</span>
                    <h3 className="text-white font-bold">Renommer le groupe</h3>
                    <p className="text-gray-400 text-sm">
                      Renommer en <span className="text-white font-semibold">"{confirmDialog.newName}"</span> ?
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDialog(null)} className="btn-outline flex-1 text-sm">Annuler</button>
                    <button
                      onClick={() => { handleRenameGroup(confirmDialog.newName); setConfirmDialog(null) }}
                      className="btn-gold flex-1 text-sm"
                    >
                      Confirmer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Song picker modal */}
        {songPickerModal && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSongPickerModal(null)} />
            <div className="relative w-full max-w-md bg-[#0d0d0d] border border-[#1a1a1a] rounded-t-3xl p-5 space-y-4 pb-8">
              <div className="w-10 h-1 bg-[#333] rounded-full mx-auto" />
              <div className="text-center">
                <span className="text-3xl">🎵</span>
                <h3 className="text-white font-bold mt-1">Choisis ton son</h3>
                <p className="text-gray-500 text-xs mt-0.5">Ce morceau sera ajouté à la playlist de la soirée</p>
              </div>
              <div className="space-y-2">
                <input
                  className="input-dark text-sm"
                  placeholder="Titre du morceau *"
                  value={songInput.title}
                  onChange={e => setSongInput(s => ({ ...s, title: e.target.value }))}
                />
                <input
                  className="input-dark text-sm"
                  placeholder="Artiste (optionnel)"
                  value={songInput.artist}
                  onChange={e => setSongInput(s => ({ ...s, artist: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setSongPickerModal(null)} className="btn-outline flex-1 text-sm">Annuler</button>
                <button
                  onClick={() => handleAddSong(songPickerModal.bookingId)}
                  disabled={!songInput.title.trim()}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${songInput.title.trim() ? 'btn-gold' : 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'}`}
                >
                  Valider mon son
                </button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    )
  }

  return null
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, myId, onVote, allUsers, groupBookings = {}, groupAuctionBids = {}, onApproveGroupBooking, onApproveGroupAuctionBid, onOpenSongPicker, navigate }) {
  const isMe = msg.senderId === myId
  const isSystem = msg.type === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-gray-600 text-[10px] bg-[#111] px-3 py-1 rounded-full border border-[#1a1a1a]">
          {msg.content}
        </span>
      </div>
    )
  }

  if (msg.type === 'event') {
    let ev = {}
    try { ev = JSON.parse(msg.content) } catch {}

    function handleOpenEvent() {
      if (!ev.id) return
      // Auto-unlock private events shared in chat
      try {
        const unlocked = JSON.parse(localStorage.getItem('lib_unlocked_events') || '[]')
        if (!unlocked.includes(String(ev.id))) {
          localStorage.setItem('lib_unlocked_events', JSON.stringify([...unlocked, String(ev.id)]))
        }
      } catch {}
      navigate && navigate(`/evenements/${ev.id}`)
    }

    return (
      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} gap-1`}>
        {!isMe && <span className="text-gray-600 text-[10px] px-2">{msg.senderName}</span>}
        <div className="max-w-[85%] rounded-2xl border border-[#333] overflow-hidden bg-[#111]">
          {ev.image ? (
            <img src={ev.image} alt={ev.name} className="w-full h-28 object-cover" />
          ) : (
            <div className="w-full h-16 bg-gradient-to-br from-[#d4af37]/10 to-[#1a1a1a] flex items-center justify-center">
              <span className="text-3xl">🎟</span>
            </div>
          )}
          <div className="p-3 space-y-1">
            <p className="text-white text-sm font-bold truncate">{ev.name || 'Événement'}</p>
            {ev.date && <p className="text-gray-500 text-xs">📅 {ev.date}</p>}
            {ev.price != null && <p className="text-[#d4af37] text-xs font-semibold">À partir de {ev.price}€</p>}
            <button
              onClick={handleOpenEvent}
              className="mt-2 w-full py-1.5 rounded-xl bg-[#d4af37] text-black text-xs font-bold hover:bg-[#c9a227] transition-colors"
            >
              Voir l'événement →
            </button>
          </div>
        </div>
        <span className="text-gray-700 text-[9px] px-2">{formatTime(msg.timestamp)}</span>
      </div>
    )
  }

  if (msg.type === 'image') {
    return (
      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} gap-1`}>
        {!isMe && <span className="text-gray-600 text-[10px] px-2">{msg.senderName}</span>}
        <div className="max-w-[75%] rounded-2xl overflow-hidden border border-[#222]">
          <img src={msg.content} alt="photo" className="w-full object-cover" style={{ maxHeight: 260 }} />
        </div>
        <span className="text-gray-700 text-[9px] px-2">{formatTime(msg.timestamp)}</span>
      </div>
    )
  }

  if (msg.type === 'group_booking') {
    const booking = groupBookings[msg.content]
    if (!booking) return (
      <div className="flex justify-center">
        <span className="text-gray-700 text-[10px] bg-[#111] px-3 py-1 rounded-full border border-[#1a1a1a]">👥 Réservation de groupe</span>
      </div>
    )
    const approvals = booking.approvals || {}
    const approvalCount = Object.keys(approvals).length
    const isApproved = approvalCount >= (booking.groupMin || 1)
    const hasApproved = !!approvals[myId]
    const isProposer = booking.proposerId === myId
    const songSelections = booking.songSelections || {}
    const myHasSong = !!songSelections[myId]
    const preorderItems = Object.entries(booking.preorderData?.items || {}).filter(([, q]) => q > 0)
    const progressPct = Math.min(100, Math.round((approvalCount / (booking.groupMin || 1)) * 100))

    return (
      <div className="flex flex-col items-start gap-1 max-w-[90%]">
        <span className="text-gray-600 text-[10px] px-2">{msg.senderName}</span>
        <div className="w-full bg-[#0d0d0d] border border-blue-500/20 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600/10 border-b border-blue-500/20 px-3 py-2 flex items-center gap-2">
            <span className="text-base">👥</span>
            <div className="flex-1 min-w-0">
              <p className="text-blue-300 text-xs font-bold">Réservation de groupe</p>
              <p className="text-gray-400 text-[10px] truncate">{booking.eventName}</p>
            </div>
            {isApproved && <span className="text-green-400 text-[10px] font-bold">✓ Validé</span>}
          </div>

          <div className="p-3 space-y-2.5">
            {/* Place info */}
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Place</span>
              <span className="text-white font-semibold">{booking.placeName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Groupe</span>
              <span className="text-blue-400 font-semibold">👥 {booking.groupMin || '?'}–{booking.groupMax || '?'} pers.</span>
            </div>
            {preorderItems.length > 0 && (
              <div className="text-[10px] text-gray-500">
                🛒 {preorderItems.map(([n, q]) => `${q}× ${n}`).join(', ')}
              </div>
            )}
            <div className="flex justify-between text-xs border-t border-[#1a1a1a] pt-2">
              <span className="text-gray-500">Total</span>
              <span className="text-[#d4af37] font-bold">{booking.totalPrice}€</span>
            </div>

            {/* Approval progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">Validations</span>
                <span className={approvalCount >= (booking.groupMin || 1) ? 'text-green-400 font-bold' : 'text-gray-400'}>{approvalCount} / {booking.groupMin || '?'} min</span>
              </div>
              <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            {/* Approve button */}
            {!isApproved && !hasApproved && (
              <button
                onClick={() => onApproveGroupBooking(booking.id)}
                className="w-full py-2 rounded-xl text-xs font-bold bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 transition-colors"
              >
                ✓ Approuver et participer
              </button>
            )}
            {!isApproved && hasApproved && (
              <div className="text-center text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl py-1.5">
                ✓ Tu as validé — en attente des autres
              </div>
            )}

            {/* Post-approval: song selection (not the proposer) */}
            {isApproved && !isProposer && (
              <div className="border-t border-[#1a1a1a] pt-2 space-y-1.5">
                <p className="text-[#d4af37] text-[10px] font-semibold">🎵 Choisis ton son pour la soirée</p>
                {myHasSong ? (
                  <div className="bg-[#d4af37]/10 border border-[#d4af37]/20 rounded-xl px-3 py-2 text-[10px]">
                    <p className="text-white font-semibold">{songSelections[myId].title}</p>
                    {songSelections[myId].artist && <p className="text-gray-500">{songSelections[myId].artist}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => onOpenSongPicker(booking.id)}
                    className="w-full py-2 rounded-xl text-xs font-bold bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/20 transition-colors"
                  >
                    🎵 Choisir mon son
                  </button>
                )}
                {/* Show others' selections */}
                {Object.entries(songSelections).filter(([uid]) => uid !== myId).map(([uid, song]) => {
                  const u = allUsers?.find(x => x.id === uid)
                  return (
                    <div key={uid} className="flex items-center gap-2 text-[10px] text-gray-500">
                      <span className="text-[#d4af37]">♪</span>
                      <span className="text-gray-400">{u?.name || uid} :</span>
                      <span className="text-white">{song.title}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <span className="text-gray-700 text-[9px] px-2">{formatTime(msg.timestamp)}</span>
      </div>
    )
  }

  if (msg.type === 'group_auction_bid') {
    const bid = groupAuctionBids[msg.content]
    if (!bid) return (
      <div className="flex justify-center">
        <span className="text-gray-700 text-[10px] bg-[#111] px-3 py-1 rounded-full border border-[#1a1a1a]">🔨 Enchère de groupe</span>
      </div>
    )
    const currentPrice = getCurrentAuctionPrice(bid.eventId, bid.placeName)
    const isOutbid = bid.bidAmount <= currentPrice
    const approvals = bid.approvals || {}
    const approvalCount = Object.keys(approvals).length
    const totalNeeded = bid.convMemberCount || 2
    const hasApproved = !!approvals[myId]
    const isPlaced = bid.status === 'placed'
    const progressPct = Math.min(100, Math.round((approvalCount / totalNeeded) * 100))

    return (
      <div className="flex flex-col items-start gap-1 max-w-[90%]">
        <span className="text-gray-600 text-[10px] px-2">{msg.senderName}</span>
        <div className={`w-full rounded-2xl border overflow-hidden ${isPlaced ? 'border-green-500/30 bg-green-500/5' : isOutbid ? 'border-red-500/20 bg-red-500/5' : 'border-[#d4af37]/20 bg-[#d4af37]/3'}`}>
          {/* Header */}
          <div className={`px-3 py-2 border-b flex items-center gap-2 ${isPlaced ? 'bg-green-500/10 border-green-500/20' : isOutbid ? 'bg-red-500/10 border-red-500/20' : 'bg-[#d4af37]/10 border-[#d4af37]/20'}`}>
            <span className="text-base">🔨</span>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold ${isPlaced ? 'text-green-300' : isOutbid ? 'text-red-400' : 'text-[#d4af37]'}`}>
                {isPlaced ? 'Enchère placée ✓' : isOutbid ? 'Enchère dépassée ✕' : 'Enchère de groupe'}
              </p>
              <p className="text-gray-400 text-[10px] truncate">{bid.eventName}</p>
            </div>
          </div>

          <div className="p-3 space-y-2.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Place</span>
              <span className="text-white font-semibold">{bid.placeName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Enchère proposée</span>
              <span className="text-[#d4af37] font-bold">{bid.bidAmount}€</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Prix actuel</span>
              <span className={`font-semibold ${isOutbid ? 'text-red-400' : 'text-gray-300'}`}>{Math.max(currentPrice, bid.priceAtProposal || 0)}€</span>
            </div>

            {isOutbid && !isPlaced && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-2.5 py-1.5 text-[10px] text-red-400">
                ✕ Le prix a dépassé ton enchère — cette proposition n'est plus valide.
              </div>
            )}

            {!isPlaced && !isOutbid && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-500">Approbations</span>
                    <span className={approvalCount >= totalNeeded ? 'text-green-400 font-bold' : 'text-gray-400'}>{approvalCount} / {totalNeeded}</span>
                  </div>
                  <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className="h-full bg-[#d4af37] rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
                {!hasApproved ? (
                  <button
                    onClick={() => onApproveGroupAuctionBid(bid.id)}
                    className="w-full py-2 rounded-xl text-xs font-bold bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/20 transition-colors"
                  >
                    🔨 Approuver l'enchère ({Math.round(bid.bidAmount / totalNeeded)}€/pers.)
                  </button>
                ) : (
                  <div className="text-center text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl py-1.5">
                    ✓ Tu as approuvé — en attente des autres
                  </div>
                )}
              </>
            )}

            {isPlaced && (
              <div className="text-center text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl py-1.5">
                ✓ Enchère placée avec succès à {bid.bidAmount}€
              </div>
            )}
          </div>
        </div>
        <span className="text-gray-700 text-[9px] px-2">{formatTime(msg.timestamp)}</span>
      </div>
    )
  }

  if (msg.type === 'purchase_proposal' || msg.type === 'auction_vote') {
    let data = {}
    try { data = JSON.parse(msg.content) } catch {}
    const isPurchase = msg.type === 'purchase_proposal'
    const votes = msg.votes || {}
    const yesVotes = Object.values(votes).filter(v => v === 'yes').length
    const noVotes = Object.values(votes).filter(v => v === 'no').length
    const totalMembers = Object.keys(votes).length + (votes[myId] ? 0 : 1)
    const myVote = votes[myId]
    const approved = yesVotes > noVotes && Object.keys(votes).length > 0

    return (
      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} gap-1`}>
        <span className="text-gray-600 text-[10px] px-2">{msg.senderName}</span>
        <div className={`max-w-[85%] rounded-2xl border p-3 space-y-2 ${
          isPurchase
            ? 'bg-[#d4af37]/5 border-[#d4af37]/20'
            : 'bg-purple-500/5 border-purple-500/20'
        }`}>
          <div className="flex items-center gap-2">
            <span>{isPurchase ? '🛒' : '🔨'}</span>
            <span className={`text-xs font-bold ${isPurchase ? 'text-[#d4af37]' : 'text-purple-400'}`}>
              {isPurchase ? 'Achat groupé' : 'Enchère groupée'}
            </span>
          </div>
          <p className="text-white text-sm font-semibold">{data.description || '—'}</p>
          {data.place && <p className="text-gray-500 text-xs">Place : {data.place}</p>}
          {data.amount && <p className="text-gray-400 text-xs">Montant : <span className="text-white font-semibold">{data.amount} €</span></p>}

          {/* Vote bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>✓ {yesVotes}</span>
              <span>✕ {noVotes}</span>
            </div>
            {Object.keys(votes).length > 0 && (
              <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1a1a1a]">
                <div className="bg-green-500 transition-all" style={{ width: `${(yesVotes / (yesVotes + noVotes || 1)) * 100}%` }} />
                <div className="bg-red-500 transition-all" style={{ width: `${(noVotes / (yesVotes + noVotes || 1)) * 100}%` }} />
              </div>
            )}
          </div>

          {/* Vote buttons */}
          {!myVote ? (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onVote(msg.id, 'yes')}
                className="flex-1 py-1.5 rounded-xl text-xs font-semibold bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20"
              >
                ✓ Oui
              </button>
              <button
                onClick={() => onVote(msg.id, 'no')}
                className="flex-1 py-1.5 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
              >
                ✕ Non
              </button>
            </div>
          ) : (
            <div className={`text-center text-xs py-1 rounded-xl ${
              myVote === 'yes'
                ? 'bg-green-500/10 text-green-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              Ton vote : {myVote === 'yes' ? '✓ Oui' : '✕ Non'}
            </div>
          )}
          {approved && (
            <div className="text-center text-xs text-[#d4af37] font-semibold">
              ✓ Approuvé par le groupe !
            </div>
          )}
        </div>
      </div>
    )
  }

  // Regular text message
  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} gap-0.5`}>
      {!isMe && <span className="text-gray-600 text-[10px] px-2">{msg.senderName}</span>}
      <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
        isMe
          ? 'bg-[#d4af37] text-black font-medium rounded-br-sm'
          : 'bg-[#1a1a1a] text-white rounded-bl-sm'
      }`}>
        {msg.content}
      </div>
      <span className="text-gray-700 text-[10px] px-2">{formatTime(msg.timestamp)}</span>
    </div>
  )
}
