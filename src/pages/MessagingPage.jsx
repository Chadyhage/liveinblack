import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import {
  getUserId, initUsers, getAllUsers, getUserById, getUserByUsername, searchUsers,
  getInitials, formatTime, formatMsgTime, formatDateSeparator, isSameDay,
  getFriends, saveFriend, removeFriend,
  getFriendRequests, sendFriendRequest, acceptFriendRequest, declineFriendRequest, getNewContacts, clearNewContact,
  getConversations, getConversationById, saveConversation,
  createDirectConversation, createGroup, leaveGroup, deleteGroup, updateGroupInfo,
  getMessages, sendMessage, reactToMessage, deleteMessageForSelf, deleteMessageForAll,
  markMessagesRead, markMessagesDelivered, getUnreadCount, voteOnPoll, pinMessage, unpinMessage,
  setTyping, getTypingUsers, setOnline, isOnline,
  seedDemoData, DEMO_USERS,
  getGroupBookings, saveGroupBooking, validateGroupBooking, payGroupBookingShare, addSongToGroupBooking,
  blockUser, unblockUser, isBlocked, getBlockedUsers, reportUser, deleteConversationHistory,
} from '../utils/messaging'
import { deductFunds, getBalance } from '../utils/wallet'

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  teal: '#4ee8c8', pink: '#e05aaa', gold: '#c8a96e',
  violet: '#8444ff', violetEnd: '#ff4da6',
  muted: 'rgba(255,255,255,0.42)', dim: 'rgba(255,255,255,0.22)',
  // Keep old aliases for compat — all pointing to Inter now
  dmMono: "'Inter', system-ui, sans-serif", cormorant: "'Inter', system-ui, sans-serif",
}
const CARD = { background: 'rgba(8,10,20,0.55)', backdropFilter: 'blur(22px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }
const INPUT_S = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: 'rgba(255,255,255,0.9)', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, padding: '10px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' }

const EMOJIS = ['❤️','😂','😮','😢','😡','👍','👎','🔥','🎉','💀','🤣','😍','😭','🙏','💯','✅']

// ─── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ user, size = 38, showOnline }) {
  const colors = [T.gold, '#8b5cf6', T.pink, '#3b82f6', T.teal, '#f59e0b']
  const color = user?.id ? colors[user.id.charCodeAt(user.id.length - 1) % colors.length] : T.gold
  const online = showOnline && user?.id ? isOnline(user.id) : false
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {user?.avatar
        ? <img src={user.avatar} alt={user?.name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
        : <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 700, fontSize: size <= 32 ? 10 : 12, fontFamily: T.dmMono }}>
            {getInitials(user?.name || '?')}
          </div>
      }
      {showOnline && (
        <div style={{
          position: 'absolute', bottom: 1, right: 1,
          width: 9, height: 9, borderRadius: '50%',
          background: online ? '#22c55e' : 'rgba(255,255,255,0.15)',
          border: '1.5px solid #04040b',
        }} />
      )}
    </div>
  )
}

// ─── Group Avatar ───────────────────────────────────────────────────────────────
function GroupAvatar({ conv, size = 38 }) {
  if (conv?.avatar) return <img src={conv.avatar} alt={conv.name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill={T.gold}>
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
      </svg>
    </div>
  )
}

// ─── Poll card renderer ─────────────────────────────────────────────────────────
function PollCard({ msg, myId, convId, onVote }) {
  let poll
  try { poll = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content } catch { return null }
  const totalVotes = poll.options.reduce((s, o) => s + Object.keys(o.votes || {}).length, 0)
  const myVote = poll.options.find(o => o.votes?.[myId])?.id
  return (
    <div style={{ minWidth: 220, maxWidth: 280 }}>
      <p style={{ fontFamily: T.dmMono, fontSize: 11, color: '#fff', margin: '0 0 10px', fontWeight: 600 }}>{poll.question}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {poll.options.map(opt => {
          const votes = Object.keys(opt.votes || {}).length
          const pct = totalVotes ? Math.round(votes / totalVotes * 100) : 0
          const isChosen = myVote === opt.id
          return (
            <button key={opt.id} onClick={() => onVote(msg.id, opt.id)}
              style={{
                width: '100%', position: 'relative', padding: '8px 10px', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                background: isChosen ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isChosen ? 'rgba(78,232,200,0.35)' : 'rgba(255,255,255,0.10)'}`,
                overflow: 'hidden',
              }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: isChosen ? 'rgba(78,232,200,0.10)' : 'rgba(255,255,255,0.05)', transition: 'width 0.4s', borderRadius: 5 }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: T.dmMono, fontSize: 11, color: isChosen ? T.teal : 'rgba(255,255,255,0.75)' }}>{opt.text}</span>
                <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.muted }}>{pct}%</span>
              </div>
            </button>
          )
        })}
      </div>
      <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: '6px 0 0' }}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ─── Story card renderer ───────────────────────────────────────────────────────
function StoryCard({ content }) {
  let story
  try { story = typeof content === 'string' ? JSON.parse(content) : content } catch { return <span style={{ fontFamily: T.dmMono, fontSize: 11, color: T.muted }}>Article</span> }
  return (
    <div style={{ minWidth: 220, maxWidth: 280 }}>
      {story.imageUrl && <img src={story.imageUrl} alt={story.title} style={{ width: '100%', borderRadius: 6, maxHeight: 140, objectFit: 'cover', marginBottom: 8 }} />}
      <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 16, color: '#fff', margin: '0 0 5px' }}>{story.title}</p>
      {story.text && <p style={{ fontFamily: T.dmMono, fontSize: 10, color: T.muted, margin: 0, lineHeight: 1.5 }}>{story.text}</p>}
    </div>
  )
}

// ─── Microphone SVG icon ───────────────────────────────────────────────────────
function MicIcon({ color = '#fff', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3"/>
      <path d="M19 10a7 7 0 0 1-14 0"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="8" y1="22" x2="16" y2="22"/>
    </svg>
  )
}

// ─── Voice bubble with waveform ────────────────────────────────────────────────
const BAR_COUNT = 30
function VoiceBubble({ content, isMe }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bars, setBars] = useState(null) // null = loading, array = ready
  const audioRef = useRef(null)

  // Decode real waveform via Web Audio API
  useEffect(() => {
    if (!content) return
    let cancelled = false
    ;(async () => {
      try {
        // base64 data URL → ArrayBuffer
        const res = await fetch(content)
        const arrayBuf = await res.arrayBuffer()
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const audioBuffer = await ctx.decodeAudioData(arrayBuf)
        ctx.close()
        if (cancelled) return
        // Extract peaks: sample channel 0 into BAR_COUNT buckets
        const channelData = audioBuffer.getChannelData(0)
        const blockSize = Math.floor(channelData.length / BAR_COUNT)
        const peaks = Array.from({ length: BAR_COUNT }, (_, i) => {
          const start = i * blockSize
          let max = 0
          for (let j = 0; j < blockSize; j++) {
            const abs = Math.abs(channelData[start + j] || 0)
            if (abs > max) max = abs
          }
          return max
        })
        const maxPeak = Math.max(...peaks, 0.01)
        setBars(peaks.map(p => Math.max(0.1, p / maxPeak)))
        setDuration(Math.round(audioBuffer.duration))
      } catch {
        // Fallback to deterministic bars if decoding fails
        if (!cancelled) setBars(
          Array.from({ length: BAR_COUNT }, (_, i) => {
            const seed = (content?.charCodeAt(i * 3 % (content?.length || 1)) || 80) + i * 17
            return 0.2 + (seed % 80) / 100
          })
        )
      }
    })()
    return () => { cancelled = true }
  }, [content])

  function handlePlay() {
    if (!audioRef.current) {
      audioRef.current = new Audio(content)
      audioRef.current.onloadedmetadata = () => {
        if (!duration) setDuration(Math.round(audioRef.current.duration))
      }
      audioRef.current.ontimeupdate = () => {
        const d = audioRef.current.duration || 1
        setProgress(audioRef.current.currentTime / d)
      }
      audioRef.current.onended = () => { setPlaying(false); setProgress(0) }
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  const activeBars = bars ?? Array.from({ length: BAR_COUNT }, (_, i) => {
    const seed = (content?.charCodeAt(i * 3 % (content?.length || 1)) || 80) + i * 17
    return 0.2 + (seed % 80) / 100
  })
  const activeColor = isMe ? T.teal : '#fff'
  const dimColor = isMe ? 'rgba(78,232,200,0.25)' : 'rgba(255,255,255,0.18)'
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200, maxWidth: 260 }}>
      <button onClick={handlePlay}
        style={{ width: 32, height: 32, borderRadius: '50%', background: isMe ? 'rgba(78,232,200,0.18)' : 'rgba(255,255,255,0.10)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {playing
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill={activeColor}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill={activeColor}><polygon points="5 3 19 12 5 21 5 3"/></svg>
        }
      </button>
      {/* Real waveform bars */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 28 }}>
        {activeBars.map((h, i) => {
          const isPast = progress > 0 && i / activeBars.length <= progress
          return (
            <div key={i} style={{ width: 2.5, height: `${h * 100}%`, borderRadius: 2, background: isPast ? activeColor : dimColor, transition: 'background 0.1s' }} />
          )
        })}
      </div>
      <span style={{ fontFamily: T.dmMono, fontSize: 8, color: T.dim, flexShrink: 0, minWidth: 28, textAlign: 'right' }}>{duration > 0 ? fmt(duration) : playing ? '…' : ''}</span>
    </div>
  )
}

// ─── Event card (simple preview) ───────────────────────────────────────────────
function EventCard({ content }) {
  let ev
  try { ev = typeof content === 'string' ? JSON.parse(content) : content } catch { return <span style={{ fontFamily: T.dmMono, fontSize: 11, color: T.gold }}>🎟 Événement</span> }
  return (
    <div style={{ minWidth: 200, maxWidth: 260 }}>
      {ev.image
        ? <img src={ev.image} alt={ev.name} style={{ width: '100%', borderRadius: 6, maxHeight: 130, objectFit: 'cover', marginBottom: 8 }} />
        : <div style={{ width: '100%', height: 80, borderRadius: 6, background: 'linear-gradient(135deg, rgba(200,169,110,0.15), rgba(78,232,200,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, fontSize: 28 }}>🎟</div>
      }
      <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 15, color: '#fff', margin: '0 0 3px' }}>{ev.name}</p>
      <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: 0 }}>{ev.date}{ev.price ? ` · ${ev.price}€` : ''}</p>
    </div>
  )
}

// ─── Event poll card (validate/decline group event) ────────────────────────────
function EventPollCard({ msg, myId, convId, onVote }) {
  let poll
  try { poll = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content } catch { return null }
  const ev = poll.event || {}
  const totalVotes = (poll.options || []).reduce((s, o) => s + Object.keys(o.votes || {}).length, 0)
  const myVote = (poll.options || []).find(o => o.votes?.[myId])?.id
  const yesOpt = poll.options?.find(o => o.id === 'yes')
  const noOpt  = poll.options?.find(o => o.id === 'no')
  const yesCount = Object.keys(yesOpt?.votes || {}).length
  const noCount  = Object.keys(noOpt?.votes  || {}).length
  return (
    <div style={{ minWidth: 240, maxWidth: 300 }}>
      {/* Affiche plein format */}
      {ev.image
        ? <img src={ev.image} alt={ev.name} style={{ width: '100%', borderRadius: '8px 8px 0 0', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: '8px 8px 0 0', background: 'linear-gradient(135deg, rgba(200,169,110,0.18), rgba(78,232,200,0.10))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
            🎟
            {ev.name && <span style={{ fontFamily: T.cormorant, fontSize: 18, color: '#fff', marginTop: 8, textAlign: 'center', padding: '0 12px' }}>{ev.name}</span>}
          </div>
      }
      {/* Infos + vote */}
      <div style={{ padding: '10px 12px 12px', background: 'rgba(4,4,14,0.85)', borderRadius: '0 0 8px 8px', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none' }}>
        {ev.image && <p style={{ fontFamily: T.cormorant, fontWeight: 500, fontSize: 15, color: '#fff', margin: '0 0 2px' }}>{ev.name}</p>}
        <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{ev.date}{ev.price ? ` · ${ev.price}€` : ''}</p>
        <p style={{ fontFamily: T.dmMono, fontSize: 10, color: T.muted, margin: '0 0 8px', fontWeight: 600 }}>{poll.question || 'On y va ?'}</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onVote(msg.id, 'yes')}
            style={{ flex: 1, padding: '8px 6px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${myVote === 'yes' ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.10)'}`, background: myVote === 'yes' ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', color: myVote === 'yes' ? '#22c55e' : T.muted, fontFamily: T.dmMono, fontSize: 10 }}>
            ✓ Oui {yesCount > 0 && <span>({yesCount})</span>}
          </button>
          <button onClick={() => onVote(msg.id, 'no')}
            style={{ flex: 1, padding: '8px 6px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${myVote === 'no' ? 'rgba(220,50,50,0.5)' : 'rgba(255,255,255,0.10)'}`, background: myVote === 'no' ? 'rgba(220,50,50,0.12)' : 'rgba(255,255,255,0.04)', color: myVote === 'no' ? 'rgba(220,100,100,0.9)' : T.muted, fontFamily: T.dmMono, fontSize: 10 }}>
            ✕ Non {noCount > 0 && <span>({noCount})</span>}
          </button>
        </div>
        <p style={{ fontFamily: T.dmMono, fontSize: 8, color: T.dim, margin: '6px 0 0' }}>{totalVotes} réponse{totalVotes !== 1 ? 's' : ''}</p>
      </div>
    </div>
  )
}

// ─── Read receipts ──────────────────────────────────────────────────────────────
function ReadReceipt({ msg, myId, conv }) {
  if (!conv || msg.senderId !== myId || msg.deletedForAll) return null
  const others = conv.type === 'direct'
    ? (conv.participants || []).filter(id => id !== myId)
    : (conv.members || []).map(m => m.userId).filter(id => id !== myId)
  const readByOthers  = others.some(id => msg.readBy?.[id])
  const delivToOthers = others.some(id => msg.deliveredTo?.[id])
  if (readByOthers)  return <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.teal }}>✓✓</span>
  if (delivToOthers) return <span style={{ fontFamily: T.dmMono, fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>✓✓</span>
  return <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim }}>✓</span>
}

// ─── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '8px 12px' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: T.muted, animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
      ))}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function MessagingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const myId   = getUserId(user)
  const myName = user?.name || 'Moi'

  // ── Views ──
  const [view, setView]           = useState('list') // list | chat | search | new-group | contacts
  const [chatSubView, setChatSubView] = useState('messages') // messages | settings
  const [activeConvId, setActiveConvId] = useState(null)

  // ── Data ──
  const [conversations, setConversations]   = useState([])
  const [messages, setMessages]             = useState([])
  const [allUsers, setAllUsers]             = useState([])
  const [friends, setFriends]               = useState([])
  const [requests, setRequests]             = useState([])
  const [newContacts, setNewContacts]       = useState(() => getNewContacts())
  const [groupBookings, setGroupBookings]   = useState({})

  // ── Input ──
  const [inputText, setInputText]   = useState('')
  const [replyTo, setReplyTo]       = useState(null)     // { id, senderName, preview }
  const [forwardMsg, setForwardMsg] = useState(null)     // message to forward

  // ── Overlays ──
  const [contextMenu, setContextMenu]       = useState(null) // { msg, x, y }
  const [emojiPicker, setEmojiPicker]       = useState(null) // { msgId }
  const [showPollCreator, setShowPollCreator]     = useState(false)
  const [showStoryCreator, setShowStoryCreator]   = useState(false)
  const [showAttachMenu, setShowAttachMenu]       = useState(false)
  const [showForwardPicker, setShowForwardPicker] = useState(false)
  const [songPickerModal, setSongPickerModal]     = useState(null)
  const [songInput, setSongInput]                 = useState({ title: '', artist: '' })
  const [confirmDialog, setConfirmDialog]         = useState(null)
  const [toast, setToast]                         = useState(null)
  const [photoViewer, setPhotoViewer]             = useState(null) // null | { src }

  // ── New DM search ──
  const [userSearch, setUserSearch]         = useState('')
  const [searchResults, setSearchResults]   = useState([])

  // ── New group ──
  const [newGroupName, setNewGroupName]       = useState('')
  const [newGroupAvatar, setNewGroupAvatar]   = useState(null)
  const [newGroupMembers, setNewGroupMembers] = useState([])
  const [newGroupStep, setNewGroupStep]       = useState(1)
  const [newGroupSearch, setNewGroupSearch]   = useState('')

  // ── Group settings ──
  const [editGroupName, setEditGroupName]     = useState('')
  const [editContribPcts, setEditContribPcts] = useState(null) // { [userId]: pct } while editing

  // ── Poll creator ──
  const [pollQuestion, setPollQuestion]     = useState('')
  const [pollOptions, setPollOptions]       = useState(['', ''])

  // ── Story creator ──
  const [storyTitle, setStoryTitle]         = useState('')
  const [storyText, setStoryText]           = useState('')
  const [storyImage, setStoryImage]         = useState(null)

  // ── Event poll sender ──
  const [showEventPicker, setShowEventPicker] = useState(false)

  // ── Voice recording ──
  const [isRecording, setIsRecording]     = useState(false)
  const [voiceLocked, setVoiceLocked]     = useState(false)
  const [tapMode, setTapMode]             = useState(false)   // true = démarré par tap unique
  const [recDuration, setRecDuration]     = useState(0)
  const mediaRecorderRef  = useRef(null)
  const audioChunksRef    = useRef([])
  const recTimerRef       = useRef(null)
  const holdTimerRef      = useRef(null)
  const voiceBtnRef       = useRef(null)
  const pointerStartYRef  = useRef(0)
  const pressStartTimeRef = useRef(0)
  const isHoldingRef      = useRef(false)
  const tapModeRef        = useRef(false)

  // ── Contacts / block / report ──
  const [contactSearch, setContactSearch]     = useState('')
  const [showReportModal, setShowReportModal] = useState(null) // { userId, userName }
  const [reportReason, setReportReason]       = useState('')
  const [blockedUsers, setBlockedUsers]       = useState([])
  const [prevRequestCount, setPrevRequestCount] = useState(0)
  const prevUnreadRef = useRef(0)

  // ── Typing / online ──
  const [typingUsers, setTypingUsersState] = useState([])
  const typingTimeoutRef = useRef(null)

  // ── Refs ──
  const messagesEndRef  = useRef(null)
  const chatScrollRef   = useRef(null)
  const photoInputRef   = useRef(null)
  const storyImgRef     = useRef(null)
  const groupAvatarRef  = useRef(null)

  // ── Scroll-to-bottom button ──
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  function handleChatScroll() {
    if (!chatScrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 120)
  }
  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollBtn(false)
  }

  // ── Notification sound ──
  const notifSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.setValueAtTime(880, ctx.currentTime)
      o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15)
      g.gain.setValueAtTime(0.25, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      o.start(); o.stop(ctx.currentTime + 0.35)
    } catch {}
  }, [])

  // ── Init ──
  useEffect(() => {
    if (!user) return
    const users = initUsers(user)
    setAllUsers(users || [])
    seedDemoData(myId, myName)
    setOnline(myId)
    setBlockedUsers(getBlockedUsers(myId))
    refresh()
    const initialReqs = getFriendRequests(myId)
    setPrevRequestCount(initialReqs.length)
    const initialConvs = getConversations(myId)
    prevUnreadRef.current = initialConvs.reduce((s, c) => s + (c.unread || 0), 0)
    const interval = setInterval(() => {
      setOnline(myId)
      const latestConvs = getConversations(myId)
      setConversations(latestConvs)
      const newReqs = getFriendRequests(myId)
      setRequests(newReqs)
      setFriends(getFriends(myId))
      // Detect new friend request → play sound + toast
      if (newReqs.length > prevRequestCount) {
        notifSound()
        showToast(`📩 Nouvelle demande de contact de ${newReqs[newReqs.length - 1]?.fromName || 'quelqu\'un'}`)
      }
      setPrevRequestCount(newReqs.length)
      // Detect new unread messages (from others) → play sound
      const totalUnread = latestConvs.reduce((s, c) => s + (c.unread || 0), 0)
      if (totalUnread > prevUnreadRef.current) notifSound()
      prevUnreadRef.current = totalUnread
      if (activeConvId) {
        setMessages(getMessages(activeConvId))
        setTypingUsersState(getTypingUsers(activeConvId, myId))
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [myId, activeConvId, prevRequestCount])

  function refresh() {
    setConversations(getConversations(myId))
    setFriends(getFriends(myId))
    setRequests(getFriendRequests(myId))
    setGroupBookings(getGroupBookings())
    if (activeConvId) setMessages(getMessages(activeConvId))
  }

  // ── Refresh React state when syncOnLogin completes (new device) ──
  useEffect(() => {
    if (!myId) return
    function onSyncComplete() {
      setConversations(getConversations(myId))
      setFriends(getFriends(myId))
      if (activeConvId) setMessages(getMessages(activeConvId))
    }
    window.addEventListener('lib:sync-complete', onSyncComplete)
    return () => window.removeEventListener('lib:sync-complete', onSyncComplete)
  }, [myId, activeConvId])

  // ── Firestore real-time listeners (cross-device sync) ──
  useEffect(() => {
    if (!myId) return
    const unsubs = []
    import('../utils/firestore-sync').then(({
      listenFriendRequests, listenUserSocial,
      listenDirectConversations, listenGroupConversations, mergeById,
    }) => {
      const safeArr = key => { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } }
      const safeObj = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } }
      const mergeConvs = convs => {
        const local = safeArr('lib_conversations')
        const merged = mergeById(local, convs)
        localStorage.setItem('lib_conversations', JSON.stringify(merged))
        setConversations(merged.filter(c =>
          c.type === 'direct' ? c.participants?.includes(myId) : c.members?.some(m => m.userId === myId)
        ).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)))
      }
      // 1. Friend requests — Firestore is source of truth, no merge
      // (merging would re-add accepted/declined requests before syncDelete confirms)
      unsubs.push(listenFriendRequests(myId, reqs => {
        localStorage.setItem('lib_friend_requests', JSON.stringify(reqs))
        setRequests(reqs.filter(r => r.toId === myId))
      }))
      // 2. My friends list
      unsubs.push(listenUserSocial(myId, social => {
        if (!social?.friends) return
        const f = safeObj('lib_friends')
        f[myId] = social.friends
        localStorage.setItem('lib_friends', JSON.stringify(f))
        setFriends(social.friends)
      }))
      // 3. Direct conversations
      unsubs.push(listenDirectConversations(myId, mergeConvs))
      // 4. Group conversations
      unsubs.push(listenGroupConversations(myId, mergeConvs))
    }).catch(() => {})
    return () => unsubs.forEach(u => u?.())
  }, [myId])

  // ── Active conversation: real-time messages ──
  useEffect(() => {
    if (!activeConvId) return
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenConvMessages, mergeById }) => {
      unsub = listenConvMessages(activeConvId, data => {
        if (!data?.items?.length) return
        const allMsgs = (() => { try { return JSON.parse(localStorage.getItem('lib_messages') || '{}') } catch { return {} } })()
        const merged = mergeById(allMsgs[activeConvId] || [], data.items)
        allMsgs[activeConvId] = merged
        localStorage.setItem('lib_messages', JSON.stringify(allMsgs))
        setMessages([...merged])
        markMessagesDelivered(activeConvId, myId)
      })
    }).catch(() => {})
    return () => unsub()
  }, [activeConvId])

  useEffect(() => {
    // Auto-scroll seulement si l'utilisateur est déjà en bas
    if (!showScrollBtn) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // ── Open conversation ──
  function openConv(convId) {
    setActiveConvId(convId)
    setView('chat')
    setChatSubView('messages')
    setInputText('')
    setReplyTo(null)
    setContextMenu(null)
    const msgs = getMessages(convId)
    setMessages(msgs)
    // Si localStorage vide (nouveau device), charger depuis Firestore immédiatement
    // markMessagesRead est appelé APRÈS le chargement pour ne jamais écraser Firestore avec []
    if (!msgs.length) {
      import('../utils/firestore-sync').then(({ loadDoc }) => {
        loadDoc(`conv_messages/${convId}`).then(data => {
          if (data?.items?.length) {
            const all = JSON.parse(localStorage.getItem('lib_messages') || '{}')
            all[convId] = data.items
            localStorage.setItem('lib_messages', JSON.stringify(all))
            setMessages([...data.items])
          }
          markMessagesDelivered(convId, myId)
          markMessagesRead(convId, myId)
        }).catch(() => { markMessagesDelivered(convId, myId); markMessagesRead(convId, myId) })
      }).catch(() => { markMessagesDelivered(convId, myId); markMessagesRead(convId, myId) })
    } else {
      markMessagesDelivered(convId, myId)
      markMessagesRead(convId, myId)
    }
    setGroupBookings(getGroupBookings())
    const conv = getConversationById(convId)
    if (conv?.pinnedMessageId) {
      // will be rendered in pinned bar
    }
  }

  // ── Conversation display helper ──
  function getConvDisplay(conv) {
    if (!conv) return { name: '?', user: null, isGroup: false }
    if (conv.type === 'direct') {
      const otherId = conv.participants?.find(id => id !== myId)
      const other   = getUserById(otherId) || allUsers.find(u => u.id === otherId)
      return { name: other?.name || 'Utilisateur', user: other, isGroup: false, otherId }
    }
    return { name: conv.name, user: null, isGroup: true, memberCount: conv.members?.length || 0 }
  }

  const activeConv  = conversations.find(c => c.id === activeConvId) || getConversationById(activeConvId)
  const amAdmin     = activeConv?.type === 'group' && activeConv?.members?.find(m => m.userId === myId)?.role === 'admin'
  const pinnedMsg   = activeConv?.pinnedMessageId ? messages.find(m => m.id === activeConv.pinnedMessageId) : null

  // ── Send text ──
  function handleSend() {
    const text = inputText.trim()
    if (!text || !activeConvId) return
    const extra = replyTo ? { replyTo } : {}
    sendMessage(activeConvId, myId, myName, 'text', text, extra)
    setInputText('')
    setReplyTo(null)
    setMessages(getMessages(activeConvId))
    setConversations(getConversations(myId))
    setTyping(activeConvId, myId, false)
  }

  // ── Typing indicator ──
  function handleInputChange(e) {
    setInputText(e.target.value)
    if (!activeConvId) return
    setTyping(activeConvId, myId, true)
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => setTyping(activeConvId, myId, false), 2500)
  }

  // ── Compress image to Blob ──
  function compressImage(file, maxSize = 900, quality = 0.78) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = ev => {
        const img = new Image()
        img.onload = () => {
          let { width, height } = img
          if (width > maxSize || height > maxSize) {
            const r = Math.min(maxSize / width, maxSize / height)
            width = Math.round(width * r); height = Math.round(height * r)
          }
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          canvas.getContext('2d').drawImage(img, 0, 0, width, height)
          canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', quality)
        }
        img.src = ev.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  // ── Send photo — uploads to Firebase Storage, falls back to base64 ──
  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file || !activeConvId) return
    e.target.value = ''
    setShowAttachMenu(false)

    const compressed = await compressImage(file)
    const extra = replyTo ? { replyTo } : {}

    try {
      const { storage } = await import('../firebase')
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
      const path = `messages/${activeConvId}/${Date.now()}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`
      const snap = await uploadBytes(ref(storage, path), compressed)
      const url = await getDownloadURL(snap.ref)
      sendMessage(activeConvId, myId, myName, 'image', url, extra)
    } catch {
      // Fallback: send compressed base64 (local only — won't sync cross-device)
      const reader = new FileReader()
      reader.onload = ev => {
        sendMessage(activeConvId, myId, myName, 'image', ev.target.result, extra)
      }
      reader.readAsDataURL(compressed)
    }

    setReplyTo(null)
    setMessages(getMessages(activeConvId))
    setConversations(getConversations(myId))
  }

  // ── Voice recording core ──
  async function startRecordingCore(isTap = false) {
    if (mediaRecorderRef.current?.state === 'recording') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        clearInterval(recTimerRef.current)
        setRecDuration(0)
        setVoiceLocked(false)
        setTapMode(false)
        tapModeRef.current = false
        isHoldingRef.current = false
      }
      mr._shouldSend = true
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setTapMode(isTap)
      tapModeRef.current = isTap
      setRecDuration(0)
      clearInterval(recTimerRef.current)
      recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000)
    } catch {}
  }

  function stopAndSendRecording() {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state !== 'recording') return
    mr.onstop = () => {
      if (mr._shouldSend && audioChunksRef.current.length > 0) {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onload = ev => {
          const extra = replyTo ? { replyTo } : {}
          sendMessage(activeConvId, myId, myName, 'voice', ev.target.result, extra)
          setReplyTo(null)
          setMessages(getMessages(activeConvId))
          setConversations(getConversations(myId))
        }
        reader.readAsDataURL(blob)
      }
      mr.stream?.getTracks().forEach(t => t.stop())
      clearInterval(recTimerRef.current)
      setRecDuration(0)
      setVoiceLocked(false)
      setTapMode(false)
      tapModeRef.current = false
      isHoldingRef.current = false
    }
    mr.stop()
    setIsRecording(false)
  }

  function cancelRecording() {
    const mr = mediaRecorderRef.current
    if (!mr) return
    mr._shouldSend = false
    if (mr.state === 'recording') {
      mr.onstop = () => {
        mr.stream?.getTracks().forEach(t => t.stop())
        clearInterval(recTimerRef.current)
        setRecDuration(0)
        setVoiceLocked(false)
        setTapMode(false)
        tapModeRef.current = false
        isHoldingRef.current = false
      }
      mr.stop()
    }
    setIsRecording(false)
    setVoiceLocked(false)
  }

  // Pointer down: attend 250ms avant de démarrer (hold mode) ou détecte un tap sur pointerUp
  function handleVoicePointerDown(e) {
    e.preventDefault()
    if (tapModeRef.current) return // déjà en mode tap, ignorer
    pressStartTimeRef.current = Date.now()
    pointerStartYRef.current = e.clientY ?? e.touches?.[0]?.clientY ?? 0
    isHoldingRef.current = true
    // Démarre en mode hold après 250ms
    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        startRecordingCore(false)
      }
    }, 250)
  }

  // Pointer move: slide up → verrouille l'enregistrement
  function handleVoicePointerMove(e) {
    if (!isHoldingRef.current || voiceLocked) return
    const currentY = e.clientY ?? e.touches?.[0]?.clientY ?? 0
    if (pointerStartYRef.current - currentY > 50) {
      setVoiceLocked(true)
      isHoldingRef.current = false
    }
  }

  // Pointer up: tap court → toggle, hold → stoppe et envoie
  function handleVoicePointerUp() {
    clearTimeout(holdTimerRef.current)
    const pressDuration = Date.now() - pressStartTimeRef.current
    if (!isHoldingRef.current && !mediaRecorderRef.current) return
    isHoldingRef.current = false

    if (pressDuration < 250) {
      // TAP: toggle
      if (mediaRecorderRef.current?.state === 'recording') {
        // 2e tap = stopper et envoyer
        stopAndSendRecording()
      } else {
        // 1er tap = démarrer
        startRecordingCore(true)
      }
    } else if (!voiceLocked) {
      // HOLD release = stopper et envoyer
      stopAndSendRecording()
    }
    // Si voiceLocked, l'utilisateur utilise les boutons Envoyer/Annuler
  }

  // ── Send poll ──
  function handleSendPoll() {
    if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2 || !activeConvId) return
    const poll = {
      question: pollQuestion.trim(),
      options: pollOptions.filter(o => o.trim()).map((text, i) => ({ id: String(i), text, votes: {} })),
    }
    sendMessage(activeConvId, myId, myName, 'poll', JSON.stringify(poll))
    setMessages(getMessages(activeConvId))
    setConversations(getConversations(myId))
    setPollQuestion(''); setPollOptions(['', '']); setShowPollCreator(false)
  }

  // ── Send story ──
  function handleSendStory() {
    if (!storyTitle.trim() || !activeConvId) return
    const story = { title: storyTitle.trim(), text: storyText.trim(), imageUrl: storyImage }
    const extra = replyTo ? { replyTo } : {}
    sendMessage(activeConvId, myId, myName, 'story', JSON.stringify(story), extra)
    setReplyTo(null)
    setMessages(getMessages(activeConvId))
    setConversations(getConversations(myId))
    setStoryTitle(''); setStoryText(''); setStoryImage(null); setShowStoryCreator(false)
  }

  // ── Send event poll (partager l'info, sondage oui/non) ──
  function handleSendEventPoll(event) {
    if (!activeConvId) return
    const poll = {
      question: 'On y va ?',
      event: { id: event.id, name: event.name, date: event.date, price: event.price, image: event.image || null },
      options: [
        { id: 'yes', text: 'Oui', votes: {} },
        { id: 'no',  text: 'Non', votes: {} },
      ],
    }
    sendMessage(activeConvId, myId, myName, 'event_poll', JSON.stringify(poll))
    setMessages(getMessages(activeConvId))
    setConversations(getConversations(myId))
    setShowEventPicker(false)
    showToast('Événement partagé dans la conversation')
  }

  // ── Send group booking proposal (réservation collective avec part par membre) ──
  function handleSendGroupBooking(event) {
    if (!activeConvId) return
    const conv = activeConv
    const members = conv?.members || []
    const memberCount = Math.max(members.length, 1)
    const evenPct = Math.floor(100 / memberCount)
    const remainder = 100 - evenPct * memberCount
    const bookingId = `grpbk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    // Assign contribution % evenly; first member gets any remainder
    const membersWithPct = members.map((m, i) => ({
      ...m,
      contributionPct: evenPct + (i === 0 ? remainder : 0),
    }))
    const booking = {
      id: bookingId,
      eventId: event.id,
      eventName: event.name,
      eventDate: event.date,
      eventDateISO: null,
      eventStartTime: null,
      eventEndTime: null,
      placeName: event.placeName || '',
      placePrice: event.price || 0,
      groupMin: memberCount,
      groupMax: memberCount,
      totalPrice: (event.price || 0) * memberCount,
      members: membersWithPct,
      validations: {},
      payments: {},
      songSelections: {},
      createdBy: myId,
      createdAt: new Date().toISOString(),
    }
    saveGroupBooking(booking)
    sendMessage(activeConvId, myId, myName, 'group_booking', bookingId)
    setGroupBookings(getGroupBookings())
    setMessages(getMessages(activeConvId))
    setConversations(getConversations(myId))
    setShowEventPicker(false)
    showToast('Proposition de réservation envoyée')
  }

  // ── Context menu actions ──
  function handleReact(emoji) {
    if (!contextMenu && !emojiPicker) return
    const msgId = contextMenu?.msg?.id || emojiPicker?.msgId
    reactToMessage(activeConvId, msgId, myId, emoji)
    setMessages(getMessages(activeConvId))
    setContextMenu(null)
    setEmojiPicker(null)
  }

  function handleReply(msg) {
    const preview = msg.type === 'text' ? msg.content.slice(0, 60) : msg.type === 'image' ? '📷 Photo' : msg.type === 'voice' ? '🎤 Vocal' : msg.type === 'poll' ? '📊 Sondage' : '📎'
    setReplyTo({ id: msg.id, senderName: msg.senderName, preview })
    setContextMenu(null)
  }

  function handleDeleteForSelf(msg) {
    deleteMessageForSelf(activeConvId, msg.id, myId)
    setMessages(getMessages(activeConvId))
    setContextMenu(null)
  }

  function handleDeleteForAll(msg) {
    deleteMessageForAll(activeConvId, msg.id)
    setMessages(getMessages(activeConvId))
    setContextMenu(null)
    showToast('Message supprimé pour tous')
  }

  function handlePin(msg) {
    if (activeConv?.pinnedMessageId === msg.id) {
      unpinMessage(activeConvId)
    } else {
      pinMessage(activeConvId, msg.id)
    }
    refresh()
    setContextMenu(null)
    showToast('Message épinglé')
  }

  function handleForward(msg) {
    setForwardMsg(msg)
    setShowForwardPicker(true)
    setContextMenu(null)
  }

  function handleForwardTo(convId) {
    if (!forwardMsg || !convId) return
    const fwd = getConversationById(convId)
    const fwdName = fwd?.name || getConvDisplay(fwd)?.name || '?'
    const extra = { forwardedFrom: { senderName: forwardMsg.senderName, convName: getConvDisplay(activeConv)?.name || activeConv?.name || '?' } }
    sendMessage(convId, myId, myName, forwardMsg.type, forwardMsg.content, extra)
    setForwardMsg(null); setShowForwardPicker(false)
    showToast(`Transféré vers ${fwdName}`)
  }

  // ── Group booking 2-step ──
  function handleValidateBooking(bookingId) {
    validateGroupBooking(bookingId, myId)
    setGroupBookings(getGroupBookings())
    setMessages(getMessages(activeConvId))
    showToast('Tu as validé la proposition')
  }

  function handlePayBooking(bookingId) {
    const booking = getGroupBookings()[bookingId]
    if (!booking) return
    const conv = activeConv
    const myMember = conv?.members?.find(m => m.userId === myId)
    const memberCount = conv?.members?.length || Math.max(booking.groupMin || 1, 1)
    const myPct = myMember?.contributionPct ?? Math.round(100 / memberCount)
    const myShare = Math.round((booking.totalPrice * myPct / 100) * 100) / 100
    const deducted = deductFunds(myId, myShare, `Réservation groupe — ${booking.eventName}`)
    if (!deducted) { showToast(`Solde insuffisant (${myShare}€ requis)`, 'error'); return }
    payGroupBookingShare(bookingId, myId)
    // Save real booking ticket
    try {
      const prev = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      const code = Math.random().toString(36).slice(2, 8).toUpperCase()
      const b = {
        id: code,
        ticketCode: `LIB-GRP-${code}`,
        eventId: booking.eventId,
        eventName: booking.eventName,
        eventDate: booking.eventDate,
        eventDateISO: booking.eventDateISO,
        eventStartTime: booking.eventStartTime,
        eventEndTime: booking.eventEndTime,
        place: booking.placeName,
        placePrice: booking.placePrice,
        totalPrice: myShare,
        bookedAt: new Date().toISOString(),
        userId: myId,
        userName: myName,
        groupBookingId: bookingId,
      }
      localStorage.setItem('lib_bookings', JSON.stringify([...prev, b]))
    } catch {}
    setGroupBookings(getGroupBookings())
    showToast('Paiement effectué ✓')
  }

  // ── New DM search ──
  useEffect(() => {
    if (!userSearch.trim()) { setSearchResults([]); return }
    const results = searchUsers(userSearch).filter(u => u.id !== myId)
    setSearchResults(results)
  }, [userSearch])

  function startDM(otherId) {
    const other = getUserById(otherId) || allUsers.find(u => u.id === otherId)
    if (!other) return
    const conv = createDirectConversation(myId, myName, otherId, other.name)
    setConversations(getConversations(myId))
    setUserSearch(''); setSearchResults([])
    openConv(conv.id)
  }

  // ── Create group ──
  function handleCreateGroup() {
    if (newGroupStep === 1) {
      if (!newGroupName.trim() || newGroupMembers.length === 0) return
      setNewGroupStep(2)
    } else {
      const allM = [myId, ...newGroupMembers]
      const names = allM.map(id => id === myId ? myName : getUserById(id)?.name || allUsers.find(u => u.id === id)?.name || id)
      const conv = createGroup(newGroupName.trim(), myId, myName, allM, names)
      if (newGroupAvatar) updateGroupInfo(conv.id, { avatar: newGroupAvatar })
      setConversations(getConversations(myId))
      setNewGroupName(''); setNewGroupMembers([]); setNewGroupAvatar(null); setNewGroupStep(1)
      openConv(conv.id)
    }
  }

  // ── Friend actions ──
  function handleSendRequest(userId) { sendFriendRequest(myId, myName, userId); refresh() }
  function handleAccept(reqId) {
    acceptFriendRequest(reqId, myId)
    refresh()
    setAllUsers(getAllUsers() || [])
    setNewContacts(getNewContacts())
  }
  function handleDecline(reqId) {
    declineFriendRequest(reqId)
    setRequests(getFriendRequests(myId))
  }
  function handleRemoveFriend(fid) {
    removeFriend(myId, fid)
    // Find and delete conversation history
    const conv = conversations.find(c => c.type === 'direct' && c.participants?.includes(fid))
    if (conv) deleteConversationHistory(conv.id)
    setFriends(prev => prev.filter(id => id !== fid))
    refresh()
    showToast('Contact supprimé')
  }
  function handleBlockUser(userId, userName) {
    blockUser(myId, userId)
    removeFriend(myId, userId)
    setBlockedUsers(getBlockedUsers(myId))
    setFriends(getFriends(myId))
    showToast(`${userName} bloqué·e`)
  }
  function handleUnblockUser(userId, userName) {
    unblockUser(myId, userId)
    setBlockedUsers(getBlockedUsers(myId))
    showToast(`${userName} débloqué·e`)
  }
  function handleReport(userId, userName) {
    if (!reportReason.trim()) return
    reportUser(myId, myName, userId, userName, reportReason.trim())
    setShowReportModal(null)
    setReportReason('')
    setConfirmDialog({ action: 'block_after_report', label: `Voulez-vous aussi bloquer ${userName} ?`, userId, userName })
  }

  // ── Group management ──
  function handleLeaveGroup() {
    leaveGroup(activeConvId, myId, myName)
    setConversations(getConversations(myId))
    setView('list'); setActiveConvId(null)
    showToast('Vous avez quitté le groupe')
  }
  function handleDeleteGroup() {
    deleteGroup(activeConvId)
    setConversations(getConversations(myId))
    setView('list'); setActiveConvId(null)
    showToast('Groupe supprimé')
  }
  function handleRenameGroup() {
    const newName = editGroupName.trim()
    if (!newName) return
    setConfirmDialog({
      action: 'rename_group',
      label: `Renommer le groupe en "${newName}" ?`,
      onConfirm: () => {
        updateGroupInfo(activeConvId, { name: newName })
        sendMessage(activeConvId, myId, myName, 'system', `${myName} a renommé le groupe en "${newName}"`)
        refresh(); setEditGroupName('')
      },
    })
  }
  function handleSetAdmin(memberId) {
    if (!activeConv) return
    const target = activeConv.members.find(m => m.userId === memberId)
    const isAlreadyAdmin = target?.role === 'admin'
    const label = isAlreadyAdmin
      ? `Retirer le rôle Admin à ${target?.name} ?`
      : `Nommer ${target?.name} administrateur·trice ?`
    setConfirmDialog({
      action: 'set_admin', label, variant: isAlreadyAdmin ? 'danger' : 'safe',
      onConfirm: () => {
        const newRole = isAlreadyAdmin ? 'member' : 'admin'
        saveConversation({ ...activeConv, members: activeConv.members.map(m => m.userId === memberId ? { ...m, role: newRole } : m) })
        const msg = isAlreadyAdmin
          ? `${myName} a retiré le rôle Admin à ${target?.name}`
          : `${myName} a nommé ${target?.name} administrateur`
        sendMessage(activeConvId, myId, myName, 'system', msg)
        refresh()
      }
    })
  }
  function handleRemoveMember(memberId) {
    if (!activeConv) return
    const removed = activeConv.members.find(m => m.userId === memberId)
    setConfirmDialog({
      action: 'remove_member', label: `Retirer ${removed?.name} du groupe ?`,
      onConfirm: () => {
        const remaining = activeConv.members.filter(m => m.userId !== memberId)
        saveConversation({ ...activeConv, members: remaining })
        if (removed) sendMessage(activeConvId, myId, myName, 'system', `${removed.name} a été retiré du groupe`)
        refresh()
      }
    })
  }

  function showToast(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  const pendingRequests = requests.length

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function renderMessageBubble(msg, idx) {
    const isMe = msg.senderId === myId
    const isSystem = msg.type === 'system'
    const isDeleted = msg.deletedForAll
    const isHiddenForMe = !isDeleted && (msg.deletedForSelf || []).includes(myId)
    if (isHiddenForMe) return null

    const prevMsg = idx > 0 ? messages.filter((_, i) => i < idx).reverse().find(m => !m.deletedForSelf?.includes(myId)) : null
    const showDateSep = !prevMsg || !isSameDay(msg.timestamp, prevMsg?.timestamp)
    const showAvatar = !isMe && !isSystem && (!prevMsg || prevMsg.senderId !== msg.senderId || showDateSep)
    const showName = !isMe && !isSystem && activeConv?.type === 'group' && showAvatar

    const reactions = msg.reactions || {}
    const allReactions = Object.entries(reactions).filter(([, users]) => users.length > 0)

    return (
      <div key={msg.id}>
        {/* Date separator */}
        {showDateSep && (
          <div style={{ textAlign: 'center', padding: '12px 0 4px', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(255,255,255,0.05)' }} />
            <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, background: '#04040b', padding: '0 10px', position: 'relative', letterSpacing: '0.08em' }}>
              {formatDateSeparator(msg.timestamp)}
            </span>
          </div>
        )}

        {isSystem ? (
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, background: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: '3px 10px' }}>
              {msg.content}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, marginBottom: 2, padding: '0 2px' }}>
            {/* Avatar (others only) */}
            <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'flex-end' }}>
              {showAvatar && <Avatar user={getUserById(msg.senderId) || { id: msg.senderId, name: msg.senderName }} size={26} showOnline />}
            </div>

            <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 2 }}>
              {/* Sender name */}
              {showName && <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.muted, paddingLeft: 4 }}>{msg.senderName}</span>}

              {/* Forwarded label */}
              {msg.forwardedFrom && (
                <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, paddingLeft: isMe ? 0 : 4 }}>
                  ↗ Transféré de {msg.forwardedFrom.senderName}
                </span>
              )}

              {/* Reply preview */}
              {msg.replyTo && (
                <div style={{
                  background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '4px 8px',
                  borderLeft: `2px solid ${isMe ? T.teal : T.gold}`,
                  maxWidth: 220,
                }}>
                  <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.muted, margin: 0 }}>{msg.replyTo.senderName}</p>
                  <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.replyTo.preview}</p>
                </div>
              )}

              {/* Bubble */}
              <div
                onContextMenu={e => { e.preventDefault(); setContextMenu({ msg, x: e.clientX, y: e.clientY }) }}
                style={{
                  padding: isDeleted ? '7px 12px' : msg.type === 'image' || msg.type === 'poll' || msg.type === 'story' ? '6px' : '9px 13px',
                  borderRadius: isMe ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                  background: isMe
                    ? 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.10))'
                    : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${isMe ? 'rgba(78,232,200,0.25)' : 'rgba(255,255,255,0.08)'}`,
                  maxWidth: '100%',
                  cursor: 'context-menu',
                  position: 'relative',
                }}>
                {isDeleted ? (
                  <span style={{ fontFamily: T.dmMono, fontSize: 10, color: T.dim, fontStyle: 'italic' }}>
                    🚫 Ce message a été supprimé
                  </span>
                ) : msg.type === 'text' ? (
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.88)', margin: 0, wordBreak: 'break-word', lineHeight: 1.5 }}>{msg.content}</p>
                ) : msg.type === 'image' ? (
                  <img src={msg.content} alt="photo"
                    onClick={() => msg.content && msg.content !== '[image]' && setPhotoViewer({ src: msg.content })}
                    style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block', cursor: msg.content && msg.content !== '[image]' ? 'zoom-in' : 'default' }} />
                ) : msg.type === 'voice' ? (
                  <VoiceBubble content={msg.content} isMe={isMe} />
                ) : msg.type === 'event_poll' ? (
                  <EventPollCard msg={msg} myId={myId} convId={activeConvId} onVote={(mid, oid) => { voteOnPoll(activeConvId, mid, oid, myId); setMessages(getMessages(activeConvId)) }} />
                ) : msg.type === 'poll' ? (
                  <PollCard msg={msg} myId={myId} convId={activeConvId} onVote={(mid, oid) => { voteOnPoll(activeConvId, mid, oid, myId); setMessages(getMessages(activeConvId)) }} />
                ) : msg.type === 'story' ? (
                  <StoryCard content={msg.content} />
                ) : msg.type === 'group_booking' ? (
                  <GroupBookingCard bookingId={msg.content} myId={myId} myName={myName} conv={activeConv} onValidate={handleValidateBooking} onPay={handlePayBooking} onSong={bId => { setSongPickerModal(bId); setSongInput({ title: '', artist: '' }) }} groupBookings={groupBookings} />
                ) : msg.type === 'event' ? (
                  <EventCard content={msg.content} />
                ) : (
                  <span style={{ fontFamily: T.dmMono, fontSize: 11, color: T.muted }}>{msg.content}</span>
                )}
              </div>

              {/* Reactions */}
              {allReactions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
                  {allReactions.map(([emoji, users]) => (
                    <button key={emoji} onClick={() => handleReact(emoji)}
                      style={{
                        background: users.includes(myId) ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${users.includes(myId) ? 'rgba(78,232,200,0.30)' : 'rgba(255,255,255,0.10)'}`,
                        borderRadius: 10, padding: '2px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                      <span style={{ fontSize: 11 }}>{emoji}</span>
                      <span style={{ fontFamily: T.dmMono, fontSize: 9, color: users.includes(myId) ? T.teal : T.muted }}>{users.length}</span>
                    </button>
                  ))}
                  <button onClick={() => setEmojiPicker({ msgId: msg.id })}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '2px 6px', cursor: 'pointer', color: T.dim, fontSize: 11 }}>
                    +
                  </button>
                </div>
              )}

              {/* Time + read receipt */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <span style={{ fontFamily: T.dmMono, fontSize: 8, color: T.dim }}>{formatMsgTime(msg.timestamp)}</span>
                {isMe && <ReadReceipt msg={msg} myId={myId} conv={activeConv} />}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEWS
  // ─────────────────────────────────────────────────────────────────────────────

  // ── List view ──
  if (view === 'list') return (
    <Layout>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0' }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h1 style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 26, color: '#fff', margin: 0, letterSpacing: '0.05em' }}>Messages</h1>
            <div style={{ display: 'flex', gap: 6 }}>
              {/* + person button with red dot if pending requests */}
              <button
                onClick={() => { setView('contacts'); setFriends(getFriends(myId)); setRequests(getFriendRequests(myId)); setContactSearch('') }}
                style={{ position: 'relative', background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.25)', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: T.teal }}>
                {/* Person + icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                {pendingRequests > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: '50%', background: '#e05aaa', border: '1.5px solid #04040b' }} />
                )}
              </button>
              {/* + Groupe */}
              <button onClick={() => { setView('new-group'); setNewGroupStep(1); setNewGroupMembers([]); setNewGroupName(''); setNewGroupAvatar(null) }}
                style={{ background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.25)', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', color: T.gold, fontFamily: T.dmMono, fontSize: 10 }}>
                + Groupe
              </button>
            </div>
          </div>
          {/* Search bar for existing contacts */}
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.dim} strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              style={{ ...INPUT_S, paddingLeft: 32 }}
              placeholder="Rechercher une conversation…"
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {conversations.filter(conv => {
            if (!contactSearch.trim()) return true
            const d = getConvDisplay(conv)
            return d.name.toLowerCase().includes(contactSearch.toLowerCase()) || conv.lastMessage?.toLowerCase().includes(contactSearch.toLowerCase())
          }).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: T.dim, fontFamily: T.dmMono, fontSize: 11 }}>
              Aucune conversation. Commence par envoyer un message.
            </div>
          ) : conversations.filter(conv => {
            if (!contactSearch.trim()) return true
            const d = getConvDisplay(conv)
            return d.name.toLowerCase().includes(contactSearch.toLowerCase()) || conv.lastMessage?.toLowerCase().includes(contactSearch.toLowerCase())
          }).map(conv => {
            const d = getConvDisplay(conv)
            const unread = getUnreadCount(conv.id, myId)
            return (
              <button key={conv.id} onClick={() => openConv(conv.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {d.isGroup ? <GroupAvatar conv={conv} size={44} /> : <Avatar user={d.user} size={44} showOnline />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 16, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {unread > 0 && <span style={{ background: T.teal, color: '#000', borderRadius: 10, padding: '1px 6px', fontFamily: T.dmMono, fontSize: 9, fontWeight: 700 }}>{unread}</span>}
                      <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim }}>{formatTime(conv.updatedAt)}</span>
                    </div>
                  </div>
                  <p style={{ fontFamily: T.dmMono, fontSize: 10, color: unread > 0 ? T.muted : T.dim, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.isGroup && conv.type === 'group' ? `${d.memberCount} membres · ` : ''}{conv.lastMessage}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </Layout>
  )

  // ── User search / new DM ──
  if (view === 'search') return (
    <Layout>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 20, padding: 0 }}>←</button>
          <h2 style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 22, color: '#fff', margin: 0 }}>Nouveau message</h2>
        </div>
        <input style={{ ...INPUT_S, marginBottom: 12 }} placeholder="Rechercher par nom ou @nomdecompte" value={userSearch} onChange={e => setUserSearch(e.target.value)} autoFocus />
        {searchResults.length > 0 ? searchResults.map(u => (
          <button key={u.id} onClick={() => startDM(u.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <Avatar user={u} size={40} showOnline />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 16, color: '#fff', margin: 0 }}>{u.name}</p>
              <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: '1px 0 0' }}>@{u.username}</p>
            </div>
            {isOnline(u.id) && <span style={{ fontFamily: T.dmMono, fontSize: 8, color: '#22c55e' }}>En ligne</span>}
          </button>
        )) : userSearch && (
          <p style={{ fontFamily: T.dmMono, fontSize: 11, color: T.dim, textAlign: 'center', padding: '32px 0' }}>Aucun utilisateur trouvé pour "{userSearch}"</p>
        )}
        {!userSearch && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Amis</p>
            {friends.map(fid => {
              const u = getUserById(fid) || allUsers.find(x => x.id === fid)
              if (!u) return null
              return (
                <button key={fid} onClick={() => startDM(fid)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <Avatar user={u} size={38} showOnline />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 16, color: '#fff', margin: 0 }}>{u.name}</p>
                    <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: 0 }}>@{u.username}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )

  // ── New group ──
  if (view === 'new-group') return (
    <Layout>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => newGroupStep === 1 ? setView('list') : setNewGroupStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 20, padding: 0 }}>←</button>
          <h2 style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 22, color: '#fff', margin: 0 }}>
            {newGroupStep === 1 ? 'Nouveau groupe' : 'Confirmer le groupe'}
          </h2>
        </div>

        {newGroupStep === 1 && (<>
          <input style={{ ...INPUT_S, marginBottom: 12 }} placeholder="Nom du groupe" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
          <input style={{ ...INPUT_S, marginBottom: 16 }} placeholder="Rechercher des membres…" value={newGroupSearch} onChange={e => setNewGroupSearch(e.target.value)} />
          {/* Selected members */}
          {newGroupMembers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {newGroupMembers.map(id => {
                const u = getUserById(id) || allUsers.find(x => x.id === id)
                return (
                  <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.25)', borderRadius: 20, padding: '3px 8px 3px 4px' }}>
                    <Avatar user={u} size={18} />
                    <span style={{ fontFamily: T.dmMono, fontSize: 10, color: T.teal }}>{u?.name}</span>
                    <button onClick={() => setNewGroupMembers(p => p.filter(x => x !== id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                  </span>
                )
              })}
            </div>
          )}
          {/* User list */}
          {(newGroupSearch ? searchUsers(newGroupSearch).filter(u => u.id !== myId) : friends.map(id => getUserById(id) || allUsers.find(u => u.id === id)).filter(Boolean)).map(u => {
            if (!u) return null
            const selected = newGroupMembers.includes(u.id)
            return (
              <button key={u.id} onClick={() => setNewGroupMembers(p => selected ? p.filter(x => x !== u.id) : [...p, u.id])}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 8px', background: selected ? 'rgba(78,232,200,0.06)' : 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8, borderBottom: '1px solid rgba(255,255,255,0.04)', marginBottom: 2 }}>
                <Avatar user={u} size={36} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 15, color: '#fff', margin: 0 }}>{u.name}</p>
                  <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: 0 }}>@{u.username}</p>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${selected ? T.teal : 'rgba(255,255,255,0.2)'}`, background: selected ? T.teal : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <span style={{ color: '#000', fontSize: 11, lineHeight: 1 }}>✓</span>}
                </div>
              </button>
            )
          })}
          <button onClick={handleCreateGroup} disabled={!newGroupName.trim() || newGroupMembers.length === 0}
            style={{ marginTop: 20, width: '100%', padding: '12px', borderRadius: 6, cursor: 'pointer', background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))', border: '1px solid rgba(78,232,200,0.35)', color: T.teal, fontFamily: T.dmMono, fontSize: 11, letterSpacing: '0.1em', opacity: (!newGroupName.trim() || newGroupMembers.length === 0) ? 0.4 : 1 }}>
            Continuer →
          </button>
        </>)}

        {newGroupStep === 2 && (<>
          {/* Group photo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div onClick={() => groupAvatarRef.current?.click()} style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {newGroupAvatar ? <img src={newGroupAvatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 30 }}>📷</span>}
            </div>
            <input ref={groupAvatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              const r = new FileReader(); r.onload = ev => setNewGroupAvatar(ev.target.result); r.readAsDataURL(f)
            }} />
            <p style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 22, color: '#fff', margin: 0 }}>{newGroupName}</p>
            <p style={{ fontFamily: T.dmMono, fontSize: 10, color: T.dim, margin: 0 }}>{newGroupMembers.length + 1} membres</p>
          </div>
          <button onClick={handleCreateGroup}
            style={{ width: '100%', padding: '12px', borderRadius: 6, cursor: 'pointer', background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))', border: '1px solid rgba(78,232,200,0.35)', color: T.teal, fontFamily: T.dmMono, fontSize: 11, letterSpacing: '0.1em' }}>
            Créer le groupe
          </button>
        </>)}
      </div>
    </Layout>
  )

  // ── Contacts view ──
  if (view === 'contacts') return (
    <Layout>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 20, padding: 0 }}>←</button>
          <h2 style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 22, color: '#fff', margin: 0, flex: 1 }}>Contacts</h2>
        </div>

        {/* Pending requests */}
        {requests.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.pink, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>🔔 Demandes reçues ({requests.length})</p>
            {requests.map(r => (
              <div key={r.id} style={{ ...CARD, padding: '12px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Avatar user={{ id: r.fromId, name: r.fromName }} size={36} />
                <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 15, color: '#fff', flex: 1, margin: 0 }}>{r.fromName}</p>
                <button onClick={() => handleDecline(r.id)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', color: T.muted, fontFamily: T.dmMono, fontSize: 9 }}>✕</button>
                <button onClick={() => handleAccept(r.id)} style={{ background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.30)', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', color: T.teal, fontFamily: T.dmMono, fontSize: 9 }}>Accepter</button>
              </div>
            ))}
          </div>
        )}

        {/* Search / Add */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Ajouter un contact</p>
          <input style={{ ...INPUT_S, marginBottom: 8 }} placeholder="Nom ou @nomdecompte" value={userSearch} onChange={e => setUserSearch(e.target.value)} autoFocus />
          {searchResults.length > 0 && (() => {
            const sentReqs = (() => { try { return JSON.parse(localStorage.getItem('lib_friend_requests') || '[]') } catch { return [] } })()
            return searchResults.map(u => {
              const isFriend = friends.includes(u.id)
              const isBlockedUser = isBlocked(myId, u.id)
              const hasPendingRequest = sentReqs.some(r => r.fromId === myId && r.toId === u.id)
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <Avatar user={u} size={36} showOnline />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 15, color: '#fff', margin: 0 }}>{u.name}</p>
                    <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: 0 }}>@{u.username}</p>
                  </div>
                  {isBlockedUser ? (
                    <button onClick={() => handleUnblockUser(u.id, u.name)} style={{ background: 'rgba(220,50,50,0.08)', border: '1px solid rgba(220,50,50,0.25)', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', color: 'rgba(220,100,100,0.9)', fontFamily: T.dmMono, fontSize: 9 }}>Débloquer</button>
                  ) : isFriend ? (
                    <span style={{ fontFamily: T.dmMono, fontSize: 9, color: '#22c55e', padding: '5px 10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 4 }}>✓ Ami</span>
                  ) : hasPendingRequest ? (
                    <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.gold, padding: '5px 10px', background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.25)', borderRadius: 4, letterSpacing: '0.05em' }}>⏳ En attente</span>
                  ) : (
                    <button onClick={() => handleSendRequest(u.id)} style={{ background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.35)', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', color: T.teal, fontFamily: T.dmMono, fontSize: 9, fontWeight: 600, letterSpacing: '0.05em' }}>
                      + Ajouter
                    </button>
                  )}
                </div>
              )
            })
          })()}
        </div>

        {/* Friends list */}
        <div>
          <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Mes amis ({friends.length})</p>
          {friends.map(fid => {
            const u = getUserById(fid) || allUsers.find(x => x.id === fid)
            if (!u) return null
            const isNew = newContacts.includes(fid)
            return (
              <div key={fid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                onClick={isNew ? () => { clearNewContact(fid); setNewContacts(getNewContacts()) } : undefined}>
                <Avatar user={u} size={36} showOnline />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 15, color: '#fff', margin: 0 }}>{u.name}</p>
                    {isNew && <span style={{ fontFamily: T.dmMono, fontSize: 8, color: T.teal, background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.3)', borderRadius: 10, padding: '1px 6px', letterSpacing: '0.05em' }}>Nouveau</span>}
                  </div>
                  <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: 0 }}>@{u.username}</p>
                </div>
                <button onClick={() => startDM(fid)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', color: T.muted, fontFamily: T.dmMono, fontSize: 9 }}>💬</button>
                <button onClick={() => setConfirmDialog({ action: 'remove_friend', label: `Supprimer ${u.name} ? L'historique sera effacé.`, onConfirm: () => handleRemoveFriend(fid) })}
                  style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', color: T.dim, fontFamily: T.dmMono, fontSize: 9 }}>✕</button>
                <button onClick={() => { setShowReportModal({ userId: u.id, userName: u.name }) }}
                  style={{ background: 'rgba(220,50,50,0.06)', border: '1px solid rgba(220,50,50,0.15)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', color: 'rgba(220,100,100,0.7)', fontFamily: T.dmMono, fontSize: 9 }}>⚑</button>
                <button onClick={() => setConfirmDialog({ action: 'block', label: `Bloquer ${u.name} ?`, onConfirm: () => handleBlockUser(u.id, u.name) })}
                  style={{ background: 'rgba(220,50,50,0.06)', border: '1px solid rgba(220,50,50,0.15)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', color: 'rgba(220,100,100,0.7)', fontFamily: T.dmMono, fontSize: 9 }}>🚫</button>
              </div>
            )
          })}
        </div>

        {/* Blocked users */}
        {blockedUsers.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Bloqué·es ({blockedUsers.length})</p>
            {blockedUsers.map(bid => {
              const u = getUserById(bid) || allUsers.find(x => x.id === bid)
              return (
                <div key={bid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: 0.6 }}>
                  <Avatar user={u || { id: bid, name: bid }} size={30} />
                  <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 14, color: T.muted, flex: 1, margin: 0 }}>{u?.name || bid}</p>
                  <button onClick={() => handleUnblockUser(bid, u?.name || bid)} style={{ background: 'rgba(78,232,200,0.06)', border: '1px solid rgba(78,232,200,0.2)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: T.teal, fontFamily: T.dmMono, fontSize: 9 }}>Débloquer</button>
                </div>
              )
            })}
          </div>
        )}

        {/* Report modal */}
        {showReportModal && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)' }} onClick={() => setShowReportModal(null)} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 60, background: 'rgba(8,10,20,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 320 }}>
              <p style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 18, color: '#fff', margin: '0 0 6px' }}>Signaler {showReportModal.userName}</p>
              <p style={{ fontFamily: T.dmMono, fontSize: 10, color: T.dim, margin: '0 0 14px' }}>Précise la raison du signalement</p>
              <textarea style={{ ...INPUT_S, resize: 'vertical', minHeight: 80, marginBottom: 14, lineHeight: 1.5 }} placeholder="Comportement inapproprié, spam, harcèlement…" value={reportReason} onChange={e => setReportReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowReportModal(null); setReportReason('') }} style={{ flex: 1, padding: '10px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: T.muted, fontFamily: T.dmMono, fontSize: 10 }}>Annuler</button>
                <button onClick={() => handleReport(showReportModal.userId, showReportModal.userName)} disabled={!reportReason.trim()} style={{ flex: 2, padding: '10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(220,50,50,0.14)', border: '1px solid rgba(220,50,50,0.35)', color: 'rgba(220,100,100,0.9)', fontFamily: T.dmMono, fontSize: 10, opacity: !reportReason.trim() ? 0.4 : 1 }}>Signaler</button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  )

  // ── Chat view ──
  const convDisplay = getConvDisplay(activeConv)

  return (
    <Layout hideNav chatMode>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxWidth: 520, margin: '0 auto', position: 'relative', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(4,4,14,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => { setView('list'); setActiveConvId(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 20, padding: 0, flexShrink: 0 }}>←</button>
          {convDisplay.isGroup ? <GroupAvatar conv={activeConv} size={38} /> : <Avatar user={convDisplay.user} size={38} showOnline />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600, fontSize: 15, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{convDisplay.name}</p>
            <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, color: T.dim, margin: '2px 0 0' }}>
              {convDisplay.isGroup
                ? `${convDisplay.memberCount} membres`
                : isOnline(convDisplay.otherId) ? <span style={{ color: '#22c55e' }}>● En ligne</span> : 'Hors ligne'
              }
            </p>
          </div>
          {chatSubView === 'messages' && (
            <button onClick={() => setChatSubView('settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 18, padding: '4px' }}>⚙</button>
          )}
          {chatSubView === 'settings' && (
            <button onClick={() => setChatSubView('messages')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 16, padding: '4px' }}>✕</button>
          )}
        </div>

        {chatSubView === 'settings' ? (
          // ── Settings panel ──
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {activeConv?.type === 'group' && (<>
              {/* Group photo */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <div onClick={() => groupAvatarRef.current?.click()} style={{ cursor: 'pointer' }}>
                  <GroupAvatar conv={{ ...activeConv, avatar: activeConv?.avatar }} size={70} />
                </div>
                <input ref={groupAvatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader(); r.onload = ev => { updateGroupInfo(activeConvId, { avatar: ev.target.result }); refresh() }; r.readAsDataURL(f)
                }} />
              </div>
              {/* Rename */}
              {amAdmin && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Nom du groupe</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={{ ...INPUT_S }} placeholder={activeConv?.name} value={editGroupName} onChange={e => setEditGroupName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRenameGroup()} />
                    <button onClick={handleRenameGroup} style={{ background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.25)', borderRadius: 6, padding: '0 12px', cursor: 'pointer', color: T.teal, fontFamily: T.dmMono, fontSize: 10 }}>OK</button>
                  </div>
                </div>
              )}
              {/* Members */}
              <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Membres</p>
              {activeConv?.members?.map(m => (
                <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <Avatar user={getUserById(m.userId) || { id: m.userId, name: m.name }} size={34} showOnline />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 14, color: '#fff', margin: 0 }}>{m.name}</p>
                    <p style={{ fontFamily: T.dmMono, fontSize: 9, color: m.role === 'admin' ? T.gold : T.dim, margin: 0 }}>{m.role === 'admin' ? '👑 Admin' : 'Membre'}</p>
                  </div>
                  {amAdmin && m.userId !== myId && (<>
                    <button onClick={() => handleSetAdmin(m.userId)} style={{ background: 'none', border: `1px solid ${m.role === 'admin' ? 'rgba(220,50,50,0.25)' : 'rgba(200,169,110,0.25)'}`, borderRadius: 4, padding: '3px 7px', cursor: 'pointer', color: m.role === 'admin' ? 'rgba(220,100,100,0.8)' : T.gold, fontFamily: T.dmMono, fontSize: 8 }}>
                      {m.role === 'admin' ? '− Admin' : '+ Admin'}
                    </button>
                    <button onClick={() => handleRemoveMember(m.userId)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '3px 7px', cursor: 'pointer', color: T.dim, fontFamily: T.dmMono, fontSize: 8 }}>✕</button>
                  </>)}
                </div>
              ))}
              {/* Contribution percentages — visible to all, editable by admin */}
              <div style={{ marginTop: 20, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Parts de paiement</p>
                  {amAdmin && (!editContribPcts ? (
                    <button onClick={() => {
                      const init = {}
                      const members = activeConv?.members || []
                      members.forEach(m => { init[m.userId] = m.contributionPct ?? Math.round(100 / Math.max(members.length, 1)) })
                      setEditContribPcts(init)
                    }} style={{ background: 'none', border: '1px solid rgba(78,232,200,0.25)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: T.teal, fontFamily: T.dmMono, fontSize: 9 }}>
                      Modifier
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditContribPcts(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: T.muted, fontFamily: T.dmMono, fontSize: 9 }}>Annuler</button>
                      <button onClick={() => {
                        const total = Object.values(editContribPcts).reduce((s, v) => s + (Number(v) || 0), 0)
                        if (Math.abs(total - 100) > 1) { showToast(`Total: ${total}% — doit être 100%`, 'error'); return }
                        const newMembers = (activeConv?.members || []).map(m => ({ ...m, contributionPct: Number(editContribPcts[m.userId]) || 0 }))
                        saveConversation({ ...activeConv, members: newMembers })
                        sendMessage(activeConvId, myId, myName, 'system', `${myName} a mis à jour les parts de paiement`)
                        refresh(); setEditContribPcts(null)
                      }} style={{ background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.25)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: T.teal, fontFamily: T.dmMono, fontSize: 9 }}>Sauvegarder</button>
                    </div>
                  ))}
                </div>
                {amAdmin && editContribPcts ? (
                  <>
                    {(activeConv?.members || []).map(m => (
                      <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ flex: 1, fontFamily: T.dmMono, fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{m.name}{m.userId === myId ? ' (moi)' : ''}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="number" min={0} max={100} value={editContribPcts[m.userId] ?? ''} onChange={e => setEditContribPcts(prev => ({ ...prev, [m.userId]: Number(e.target.value) }))}
                            style={{ width: 52, background: 'rgba(6,8,16,0.8)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontFamily: T.dmMono, fontSize: 11, padding: '4px 6px', textAlign: 'right' }} />
                          <span style={{ fontFamily: T.dmMono, fontSize: 10, color: T.muted }}>%</span>
                        </div>
                      </div>
                    ))}
                    <p style={{ fontFamily: T.dmMono, fontSize: 9, color: (() => { const t = Object.values(editContribPcts).reduce((s, v) => s + (Number(v) || 0), 0); return Math.abs(t - 100) <= 1 ? T.teal : 'rgba(220,100,100,0.8)' })(), margin: '6px 0 0', textAlign: 'right' }}>
                      Total : {Object.values(editContribPcts).reduce((s, v) => s + (Number(v) || 0), 0)}%
                    </p>
                  </>
                ) : (
                  (activeConv?.members || []).map(m => {
                    const pct = m.contributionPct ?? Math.round(100 / Math.max((activeConv?.members?.length || 1), 1))
                    const isMe = m.userId === myId
                    return (
                      <div key={m.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontFamily: T.dmMono, fontSize: 10, color: isMe ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)' }}>
                          {m.name}{isMe ? ' (moi)' : ''}
                        </span>
                        <span style={{ fontFamily: T.dmMono, fontSize: 10, color: isMe ? T.teal : T.gold, fontWeight: isMe ? 600 : 400 }}>{pct}%</span>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Leave / delete */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
                <button onClick={() => setConfirmDialog({ action: 'leave', label: 'Quitter le groupe ?' })}
                  style={{ padding: '10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(220,50,50,0.08)', border: '1px solid rgba(220,50,50,0.25)', color: 'rgba(220,100,100,0.9)', fontFamily: T.dmMono, fontSize: 10 }}>
                  Quitter le groupe
                </button>
                {amAdmin && (
                  <button onClick={() => setConfirmDialog({ action: 'delete', label: 'Supprimer le groupe définitivement ?' })}
                    style={{ padding: '10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.35)', color: 'rgba(220,100,100,0.9)', fontFamily: T.dmMono, fontSize: 10 }}>
                    Supprimer le groupe
                  </button>
                )}
              </div>
            </>)}

            {/* ── Direct conversation settings ── */}
            {activeConv?.type === 'direct' && (() => {
              const otherId = activeConv.participants?.find(id => id !== myId)
              const other = getUserById(otherId) || allUsers.find(u => u.id === otherId) || { id: otherId, name: convDisplay.name }
              const alreadyBlocked = blockedUsers.includes(otherId)
              return (
                <div>
                  {/* Contact card */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                    <Avatar user={other} size={64} showOnline />
                    <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 17, color: '#fff', margin: 0 }}>{other.name}</p>
                    {other.username && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>@{other.username}</p>}
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: isOnline(otherId) ? '#22c55e' : 'rgba(255,255,255,0.25)', margin: 0 }}>
                      {isOnline(otherId) ? '● En ligne' : '○ Hors ligne'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={() => setConfirmDialog({ action: 'clear_history', label: 'Effacer l\'historique de cette conversation ?' })}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter, sans-serif', fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      Effacer l'historique
                    </button>

                    {friends.includes(otherId) && (
                      <button
                        onClick={() => setConfirmDialog({ action: 'remove_friend', label: `Retirer ${other.name} de tes amis ?`, onConfirm: () => { handleRemoveFriend(otherId); setChatSubView('messages') } })}
                        style={{ width: '100%', padding: '11px 14px', borderRadius: 10, cursor: 'pointer', background: 'rgba(220,50,50,0.06)', border: '1px solid rgba(220,50,50,0.18)', color: 'rgba(220,100,100,0.75)', fontFamily: 'Inter, sans-serif', fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                        Retirer des amis
                      </button>
                    )}

                    {alreadyBlocked ? (
                      <button
                        onClick={() => { handleUnblockUser(otherId, other.name); setChatSubView('messages') }}
                        style={{ width: '100%', padding: '11px 14px', borderRadius: 10, cursor: 'pointer', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', color: 'rgba(34,197,94,0.85)', fontFamily: 'Inter, sans-serif', fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></svg>
                        Débloquer {other.name}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDialog({ action: 'block_user', label: `Bloquer ${other.name} ? Vous ne recevrez plus ses messages.`, userId: otherId, userName: other.name })}
                        style={{ width: '100%', padding: '11px 14px', borderRadius: 10, cursor: 'pointer', background: 'rgba(220,50,50,0.08)', border: '1px solid rgba(220,50,50,0.2)', color: 'rgba(220,100,100,0.85)', fontFamily: 'Inter, sans-serif', fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        Bloquer {other.name}
                      </button>
                    )}

                    <button
                      onClick={() => setShowReportModal({ userId: otherId, userName: other.name })}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, cursor: 'pointer', background: 'rgba(220,50,50,0.05)', border: '1px solid rgba(220,50,50,0.15)', color: 'rgba(220,100,100,0.6)', fontFamily: 'Inter, sans-serif', fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      Signaler {other.name}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        ) : (
          <>
            {/* ── Pinned message ── */}
            {pinnedMsg && !pinnedMsg.deletedForAll && (
              <div style={{ background: 'rgba(200,169,110,0.06)', borderBottom: '1px solid rgba(200,169,110,0.15)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12 }}>📌</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: T.dmMono, fontSize: 8, color: T.gold, margin: '0 0 1px', letterSpacing: '0.06em' }}>ÉPINGLÉ</p>
                  <p style={{ fontFamily: T.dmMono, fontSize: 10, color: T.muted, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pinnedMsg.type === 'text' ? pinnedMsg.content.slice(0, 60) : '📎 Pièce jointe'}
                  </p>
                </div>
                {amAdmin && <button onClick={() => unpinMessage(activeConvId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 14, padding: 0 }}>✕</button>}
              </div>
            )}

            {/* ── Messages area ── */}
            <div
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 4px', position: 'relative' }}>
              {messages.map((msg, idx) => renderMessageBubble(msg, idx))}

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: T.muted, animation: `typing-dot 1.2s ${i * 0.2}s ease-in-out infinite` }} />)}
                  </div>
                  <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim }}>
                    {typingUsers.map(id => getUserById(id)?.name || id).join(', ')} écrit…
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Scroll-to-bottom button ── */}
            {showScrollBtn && (
              <button onClick={scrollToBottom}
                style={{ position: 'absolute', bottom: 80, right: 14, zIndex: 25, width: 36, height: 36, borderRadius: '50%', background: 'rgba(8,10,20,0.92)', border: '1px solid rgba(78,232,200,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            )}

            {/* ── Reply preview bar ── */}
            {replyTo && (
              <div style={{ background: 'rgba(78,232,200,0.06)', borderTop: '1px solid rgba(78,232,200,0.15)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.teal, margin: '0 0 1px' }}>Répondre à {replyTo.senderName}</p>
                  <p style={{ fontFamily: T.dmMono, fontSize: 10, color: T.muted, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyTo.preview}</p>
                </div>
                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 14, padding: 0 }}>✕</button>
              </div>
            )}

            {/* ── Input bar ── */}
            <div style={{ background: 'rgba(4,4,14,0.96)', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 10px', display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              {/* Attach button */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowAttachMenu(v => !v)}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: showAttachMenu ? 'rgba(78,232,200,0.15)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 16, flexShrink: 0 }}>
                  +
                </button>
                {showAttachMenu && (
                  <div style={{ position: 'absolute', bottom: 44, left: 0, background: 'rgba(8,10,20,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160, zIndex: 20 }}>
                    {[
                      { label: '📷 Photo', action: () => { photoInputRef.current?.click(); setShowAttachMenu(false) } },
                      { label: '📊 Sondage', action: () => { setShowPollCreator(true); setShowAttachMenu(false) } },
                      { label: '📰 Article', action: () => { setShowStoryCreator(true); setShowAttachMenu(false) } },
                      { label: '🎟 Partager un événement', action: () => { setShowEventPicker(true); setShowAttachMenu(false) } },
                    ].map(item => (
                      <button key={item.label} onClick={item.action}
                        style={{ padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontFamily: T.dmMono, fontSize: 11, textAlign: 'left', borderRadius: 6 }}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />
              </div>

              {/* Text input */}
              <textarea
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Message…"
                rows={1}
                style={{ ...INPUT_S, flex: 1, resize: 'none', maxHeight: 100, lineHeight: 1.5, paddingTop: 8, paddingBottom: 8 }}
              />

              {/* Voice button — tap une fois ou maintenir (glisser vers le haut pour verrouiller) */}
              {isRecording && voiceLocked ? (
                // Mode verrouillé : annuler ou envoyer
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <button onClick={cancelRecording} style={{ background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'rgba(220,100,100,0.9)', fontFamily: T.dmMono, fontSize: 9 }}>✕</button>
                  <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.pink }}>🔴 {recDuration}s</span>
                  <button onClick={stopAndSendRecording} style={{ background: 'rgba(224,90,170,0.18)', border: '1px solid rgba(224,90,170,0.4)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: T.pink, fontFamily: T.dmMono, fontSize: 10 }}>Envoyer</button>
                </div>
              ) : (
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <button
                    ref={voiceBtnRef}
                    onPointerDown={handleVoicePointerDown}
                    onPointerMove={handleVoicePointerMove}
                    onPointerUp={handleVoicePointerUp}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: isRecording ? 'rgba(224,90,170,0.25)' : 'rgba(255,255,255,0.06)', border: `1px solid ${isRecording ? 'rgba(224,90,170,0.45)' : 'rgba(255,255,255,0.10)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isRecording ? T.pink : T.dim, transition: 'all 0.2s', touchAction: 'none' }}>
                    <MicIcon color={isRecording ? T.pink : T.dim} size={17} />
                  </button>
                  {isRecording && !tapMode && !voiceLocked && (
                    <span style={{ position: 'absolute', bottom: 38, right: -20, fontFamily: T.dmMono, fontSize: 8, color: T.dim, whiteSpace: 'nowrap', background: 'rgba(4,4,14,0.9)', padding: '2px 5px', borderRadius: 4 }}>↑ verrouiller</span>
                  )}
                  {isRecording && tapMode && !voiceLocked && (
                    <span style={{ position: 'absolute', bottom: 38, right: -20, fontFamily: T.dmMono, fontSize: 8, color: T.pink, whiteSpace: 'nowrap', background: 'rgba(4,4,14,0.9)', padding: '2px 5px', borderRadius: 4 }}>tap = stop</span>
                  )}
                  {isRecording && <span style={{ position: 'absolute', bottom: -16, fontFamily: T.dmMono, fontSize: 8, color: T.pink }}>{recDuration}s</span>}
                </div>
              )}

              {/* Send button */}
              <button onClick={handleSend} disabled={!inputText.trim()}
                style={{ width: 36, height: 36, borderRadius: '50%', background: inputText.trim() ? 'linear-gradient(135deg, rgba(132,68,255,0.9), rgba(255,77,166,0.85))' : 'rgba(255,255,255,0.06)', border: 'none', cursor: inputText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 16, transition: 'all 0.2s', boxShadow: inputText.trim() ? '0 4px 16px rgba(132,68,255,0.3)' : 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </button>
            </div>
          </>
        )}

        {/* ── Context menu ── */}
        {contextMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setContextMenu(null)} />
            <div style={{ position: 'fixed', zIndex: 50, background: 'rgba(8,10,20,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 6, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', left: Math.min(contextMenu.x, window.innerWidth - 190), top: Math.min(contextMenu.y, window.innerHeight - 300) }}>
              {/* Quick reactions */}
              {!contextMenu.msg.deletedForAll && (
                <div style={{ display: 'flex', gap: 4, padding: '4px 6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                  {EMOJIS.slice(0, 8).map(e => (
                    <button key={e} onClick={() => { reactToMessage(activeConvId, contextMenu.msg.id, myId, e); setMessages(getMessages(activeConvId)); setContextMenu(null) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 2, borderRadius: 4 }}>{e}</button>
                  ))}
                  <button onClick={() => { setEmojiPicker({ msgId: contextMenu.msg.id }); setContextMenu(null) }}
                    style={{ background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 6px', borderRadius: 4, color: T.muted }}>+</button>
                </div>
              )}
              {/* Actions */}
              {[
                !contextMenu.msg.deletedForAll && { label: '↩ Répondre', fn: () => handleReply(contextMenu.msg) },
                !contextMenu.msg.deletedForAll && { label: '↗ Transférer', fn: () => handleForward(contextMenu.msg) },
                !contextMenu.msg.deletedForAll && amAdmin && { label: activeConv?.pinnedMessageId === contextMenu.msg.id ? '📌 Désépingler' : '📌 Épingler', fn: () => handlePin(contextMenu.msg) },
                !contextMenu.msg.deletedForAll && { label: '🗑 Supprimer pour moi', fn: () => handleDeleteForSelf(contextMenu.msg) },
                !contextMenu.msg.deletedForAll && contextMenu.msg.senderId === myId && { label: '🗑 Supprimer pour tous', fn: () => handleDeleteForAll(contextMenu.msg) },
              ].filter(Boolean).map(item => (
                <button key={item.label} onClick={() => { item.fn(); setContextMenu(null) }}
                  style={{ display: 'block', width: '100%', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: item.label.includes('tous') ? 'rgba(220,100,100,0.9)' : 'rgba(255,255,255,0.8)', fontFamily: T.dmMono, fontSize: 11, textAlign: 'left', borderRadius: 6 }}>
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Full emoji picker ── */}
        {emojiPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setEmojiPicker(null)} />
            <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'rgba(8,10,20,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px', display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 300 }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => { reactToMessage(activeConvId, emojiPicker.msgId, myId, e); setMessages(getMessages(activeConvId)); setEmojiPicker(null) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 4, borderRadius: 6 }}>{e}</button>
              ))}
            </div>
          </>
        )}

        {/* ── Poll creator ── */}
        {showPollCreator && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)' }} onClick={() => setShowPollCreator(false)} />
            <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, zIndex: 60, background: 'rgba(4,4,14,0.98)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px 14px 0 0', padding: '20px 20px 36px' }}>
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, margin: '0 auto 16px' }} />
              <h3 style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 20, color: '#fff', margin: '0 0 16px' }}>Créer un sondage</h3>
              <input style={{ ...INPUT_S, marginBottom: 10 }} placeholder="Question du sondage…" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} />
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input style={{ ...INPUT_S }} placeholder={`Option ${i + 1}`} value={opt} onChange={e => setPollOptions(p => p.map((o, j) => j === i ? e.target.value : o))} />
                  {pollOptions.length > 2 && <button onClick={() => setPollOptions(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 16 }}>✕</button>}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button onClick={() => setPollOptions(p => [...p, ''])} style={{ background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, padding: '8px', cursor: 'pointer', color: T.dim, fontFamily: T.dmMono, fontSize: 10, width: '100%', marginBottom: 14 }}>
                  + Ajouter une option
                </button>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowPollCreator(false)} style={{ flex: 1, padding: '11px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: T.muted, fontFamily: T.dmMono, fontSize: 10 }}>Annuler</button>
                <button onClick={handleSendPoll} disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                  style={{ flex: 2, padding: '11px', borderRadius: 6, cursor: 'pointer', background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))', border: '1px solid rgba(78,232,200,0.35)', color: T.teal, fontFamily: T.dmMono, fontSize: 10 }}>
                  Envoyer le sondage
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Story creator ── */}
        {showStoryCreator && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)' }} onClick={() => setShowStoryCreator(false)} />
            <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, zIndex: 60, background: 'rgba(4,4,14,0.98)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px 14px 0 0', padding: '20px 20px 36px' }}>
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, margin: '0 auto 16px' }} />
              <h3 style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 20, color: '#fff', margin: '0 0 16px' }}>Partager un article</h3>
              {storyImage && <img src={storyImage} alt="" style={{ width: '100%', borderRadius: 8, maxHeight: 160, objectFit: 'cover', marginBottom: 10 }} />}
              <button onClick={() => storyImgRef.current?.click()} style={{ background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, padding: '8px', cursor: 'pointer', color: T.dim, fontFamily: T.dmMono, fontSize: 10, width: '100%', marginBottom: 10 }}>
                {storyImage ? '🖼 Changer l\'image' : '📷 Ajouter une image (optionnel)'}
              </button>
              <input ref={storyImgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setStoryImage(ev.target.result); r.readAsDataURL(f) }} />
              <input style={{ ...INPUT_S, marginBottom: 8 }} placeholder="Titre de l'article" value={storyTitle} onChange={e => setStoryTitle(e.target.value)} />
              <textarea style={{ ...INPUT_S, resize: 'vertical', minHeight: 60, marginBottom: 14, lineHeight: 1.5 }} placeholder="Contenu (optionnel)" value={storyText} onChange={e => setStoryText(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowStoryCreator(false)} style={{ flex: 1, padding: '11px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: T.muted, fontFamily: T.dmMono, fontSize: 10 }}>Annuler</button>
                <button onClick={handleSendStory} disabled={!storyTitle.trim()}
                  style={{ flex: 2, padding: '11px', borderRadius: 6, cursor: 'pointer', background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))', border: '1px solid rgba(200,169,110,0.35)', color: T.gold, fontFamily: T.dmMono, fontSize: 10, opacity: !storyTitle.trim() ? 0.4 : 1 }}>
                  Partager l&apos;article
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Event picker modal ── */}
        {showEventPicker && (
          <EventPickerModal onSelectPoll={handleSendEventPoll} onSelectBooking={handleSendGroupBooking} onClose={() => setShowEventPicker(false)} />
        )}

        {/* ── Forward picker ── */}
        {showForwardPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)' }} onClick={() => setShowForwardPicker(false)} />
            <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, zIndex: 60, background: 'rgba(4,4,14,0.98)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px 14px 0 0', padding: '20px 20px 36px', maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, margin: '0 auto 16px' }} />
              <h3 style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 20, color: '#fff', margin: '0 0 12px' }}>Transférer vers…</h3>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {conversations.filter(c => c.id !== activeConvId).map(c => {
                  const d = getConvDisplay(c)
                  return (
                    <button key={c.id} onClick={() => handleForwardTo(c.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {d.isGroup ? <GroupAvatar conv={c} size={36} /> : <Avatar user={d.user} size={36} />}
                      <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 15, color: '#fff', margin: 0 }}>{d.name}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Song picker modal (group booking) ── */}
        {songPickerModal && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)' }} onClick={() => setSongPickerModal(null)} />
            <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, zIndex: 60, background: 'rgba(4,4,14,0.98)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px 14px 0 0', padding: '20px 20px 36px' }}>
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, margin: '0 auto 16px' }} />
              <h3 style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 20, color: '#fff', margin: '0 0 16px' }}>🎵 Ma sélection musicale</h3>
              <input style={{ ...INPUT_S, marginBottom: 8 }} placeholder="Titre du morceau" value={songInput.title} onChange={e => setSongInput(s => ({ ...s, title: e.target.value }))} />
              <input style={{ ...INPUT_S, marginBottom: 14 }} placeholder="Artiste" value={songInput.artist} onChange={e => setSongInput(s => ({ ...s, artist: e.target.value }))} />
              <button onClick={() => { if (!songInput.title.trim()) return; addSongToGroupBooking(songPickerModal, myId, { title: songInput.title.trim(), artist: songInput.artist.trim() }); setGroupBookings(getGroupBookings()); setSongPickerModal(null); setSongInput({ title: '', artist: '' }) }}
                style={{ width: '100%', padding: '12px', borderRadius: 6, cursor: 'pointer', background: 'linear-gradient(135deg, rgba(224,90,170,0.20), rgba(224,90,170,0.06))', border: '1px solid rgba(224,90,170,0.35)', color: T.pink, fontFamily: T.dmMono, fontSize: 10 }}>
                Envoyer ma sélection
              </button>
            </div>
          </>
        )}

        {/* ── Confirm dialog ── */}
        {confirmDialog && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)' }} onClick={() => setConfirmDialog(null)} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 60, background: 'rgba(8,10,20,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 24, textAlign: 'center', maxWidth: 300, width: '90%' }}>
              <p style={{ fontFamily: T.cormorant, fontWeight: 300, fontSize: 18, color: '#fff', margin: '0 0 20px' }}>{confirmDialog.label}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmDialog(null)} style={{ flex: 1, padding: '10px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: T.muted, fontFamily: T.dmMono, fontSize: 10 }}>Annuler</button>
                <button onClick={() => {
                  if (confirmDialog.action === 'leave') handleLeaveGroup()
                  if (confirmDialog.action === 'delete') handleDeleteGroup()
                  if (confirmDialog.onConfirm) confirmDialog.onConfirm()
                  if (confirmDialog.action === 'block_after_report') handleBlockUser(confirmDialog.userId, confirmDialog.userName)
                  if (confirmDialog.action === 'block_user') { handleBlockUser(confirmDialog.userId, confirmDialog.userName); setChatSubView('messages'); setShowReportModal({ userId: confirmDialog.userId, userName: confirmDialog.userName }) }
                  if (confirmDialog.action === 'clear_history') { deleteConversationHistory(activeConvId); setMessages([]); showToast('Historique effacé') }
                  setConfirmDialog(null)
                }}
                  style={{ flex: 1, padding: '10px', borderRadius: 6, cursor: 'pointer',
                    background: confirmDialog.variant === 'safe' ? 'rgba(78,232,200,0.12)' : 'rgba(220,50,50,0.14)',
                    border: `1px solid ${confirmDialog.variant === 'safe' ? 'rgba(78,232,200,0.40)' : 'rgba(220,50,50,0.40)'}`,
                    color: confirmDialog.variant === 'safe' ? T.teal : 'rgba(220,100,100,0.9)',
                    fontFamily: T.dmMono, fontSize: 10 }}>
                  Confirmer
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 70, padding: '9px 18px', borderRadius: 6, fontFamily: T.dmMono, fontSize: 10, backdropFilter: 'blur(16px)', ...(toast.type === 'error' ? { background: 'rgba(220,50,50,0.16)', border: '1px solid rgba(220,50,50,0.35)', color: 'rgba(220,100,100,0.95)' } : { background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.35)', color: T.teal }) }}>
            {toast.msg}
          </div>
        )}

        <style>{`
          @keyframes typing-dot {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-4px); opacity: 1; }
          }
        `}</style>
      </div>

      {/* ── Photo viewer (fullscreen) ── */}
      {photoViewer && (
        <div onClick={() => setPhotoViewer(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={photoViewer.src} alt="photo"
            style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
          <button onClick={() => setPhotoViewer(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: '36px', textAlign: 'center' }}>×</button>
          <a href={photoViewer.src} download="photo.jpg"
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', letterSpacing: '0.15em' }}>
            ↓ TÉLÉCHARGER
          </a>
        </div>
      )}
    </Layout>
  )
}

// ─── Event Picker Modal ───────────────────────────────────────────────────────
function EventPickerModal({ onSelectPoll, onSelectBooking, onClose }) {
  const [search, setSearch] = useState('')
  const dmMono = "'DM Mono', monospace"
  const cormorant = "'Cormorant Garamond', serif"

  // Load events from localStorage bookings or use demo events
  const events = useMemo(() => {
    try {
      const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      const seen = new Set()
      const unique = bookings
        .filter(b => b.eventId && !seen.has(b.eventId) && seen.add(b.eventId))
        .map(b => ({ id: b.eventId, name: b.eventName, date: b.eventDate, price: b.placePrice, placeName: b.place || '', image: null }))
      if (unique.length > 0) return unique
    } catch {}
    // Demo fallback
    return [
      { id: 'd1', name: 'NEON NOIR', date: 'SAM 20 AVR 2026', price: 25, placeName: 'Club Obsidian', image: null },
      { id: 'd2', name: 'UNDERGROUND TECHNO', date: 'VEN 26 AVR 2026', price: 15, placeName: 'Le Bunker', image: null },
      { id: 'd3', name: 'LIB SUMMER FEST', date: 'SAM 14 JUN 2026', price: 50, placeName: 'Parc des Expos', image: null },
    ]
  }, [])

  const filtered = search.trim() ? events.filter(e => e.name.toLowerCase().includes(search.toLowerCase())) : events

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)' }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, zIndex: 60, background: 'rgba(4,4,14,0.98)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px 14px 0 0', padding: '20px 20px 36px', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, margin: '0 auto 16px' }} />
        <h3 style={{ fontFamily: cormorant, fontWeight: 300, fontSize: 20, color: '#fff', margin: '0 0 4px' }}>Envoyer un événement</h3>
        <p style={{ fontFamily: dmMono, fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Partager l'info ou proposer une réservation de groupe</p>
        <input style={{ background: 'rgba(6,8,16,0.7)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6, color: 'rgba(255,255,255,0.9)', fontFamily: dmMono, fontSize: 12, padding: '9px 12px', outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: 12 }} placeholder="Rechercher un événement…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.length === 0 && <p style={{ fontFamily: dmMono, fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '24px 0' }}>Aucun événement trouvé</p>}
          {filtered.map(ev => (
            <div key={ev.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
              {/* Event header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
                <div style={{ width: 44, height: 44, borderRadius: 6, background: 'linear-gradient(135deg, rgba(200,169,110,0.18), rgba(78,232,200,0.10))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {ev.image ? <img src={ev.image} alt={ev.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} /> : '🎟'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: cormorant, fontWeight: 400, fontSize: 15, color: '#fff', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name}</p>
                  <p style={{ fontFamily: dmMono, fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: 0 }}>{ev.date}{ev.price ? ` · ${ev.price}€/pers.` : ''}</p>
                </div>
              </div>
              {/* Action buttons */}
              <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => onSelectPoll(ev)}
                  style={{ flex: 1, padding: '9px 8px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', fontFamily: dmMono, fontSize: 10, color: 'rgba(78,232,200,0.85)', letterSpacing: '0.04em' }}>
                  📢 Partager l'info
                </button>
                <button onClick={() => onSelectBooking(ev)}
                  style={{ flex: 1, padding: '9px 8px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: dmMono, fontSize: 10, color: 'rgba(200,169,110,0.85)', letterSpacing: '0.04em' }}>
                  🎟 Réserver en groupe
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── Group Booking Card ────────────────────────────────────────────────────────
function GroupBookingCard({ bookingId, myId, myName, conv, onValidate, onPay, onSong, groupBookings }) {
  const booking = groupBookings[bookingId]
  if (!booking) return <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Réservation introuvable</span>

  const members    = conv?.members || []
  const total      = members.length
  const validations = booking.validations || {}
  const payments    = booking.payments   || {}
  const validCount  = Object.keys(validations).length
  const payCount    = Object.keys(payments).length
  const hasValidated = validations[myId]
  const hasPaid      = payments[myId]
  const allValidated = total > 0 && validCount >= total
  const myMember     = members.find(m => m.userId === myId)
  const myPct        = myMember?.contributionPct ?? Math.round(100 / Math.max(total, 1))
  const myShare      = Math.round((booking.totalPrice * myPct / 100) * 100) / 100

  return (
    <div style={{ minWidth: 230, maxWidth: 290 }}>
      {/* Event info */}
      <div style={{ marginBottom: 10 }}>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(200,169,110,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 3px' }}>Réservation de groupe</p>
        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 16, color: '#fff', margin: '0 0 2px' }}>{booking.eventName}</p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
          {booking.placeName} · {booking.groupMin}–{booking.groupMax > 0 ? booking.groupMax : '∞'} pers.
        </p>
      </div>

      {/* Progress */}
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Étape 1 — Validation</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: allValidated ? '#22c55e' : '#c8a96e' }}>{validCount}/{total}</span>
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', borderRadius: 99, width: `${total ? validCount / total * 100 : 0}%`, background: allValidated ? '#22c55e' : '#c8a96e', transition: 'width 0.4s' }} />
        </div>
        {allValidated && (<>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Étape 2 — Paiements</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: payCount >= total ? '#22c55e' : '#4ee8c8' }}>{payCount}/{total}</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, width: `${total ? payCount / total * 100 : 0}%`, background: '#4ee8c8', transition: 'width 0.4s' }} />
          </div>
        </>)}
      </div>

      {/* CTA */}
      {!hasValidated && (
        <button onClick={() => onValidate(bookingId)}
          style={{ width: '100%', padding: '9px', borderRadius: 5, cursor: 'pointer', background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.30)', color: '#c8a96e', fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          ✓ Je valide la sortie
        </button>
      )}
      {hasValidated && !hasPaid && allValidated && (
        <button onClick={() => onPay(bookingId)}
          style={{ width: '100%', padding: '9px', borderRadius: 5, cursor: 'pointer', background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))', border: '1px solid rgba(78,232,200,0.35)', color: '#4ee8c8', fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          💳 Payer ma part ({myShare}€)
        </button>
      )}
      {hasValidated && !hasPaid && !allValidated && (
        <div style={{ padding: '8px', background: 'rgba(200,169,110,0.05)', border: '1px solid rgba(200,169,110,0.15)', borderRadius: 5, marginBottom: 6 }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(200,169,110,0.6)', margin: 0, textAlign: 'center' }}>
            ⏳ En attente des validations ({validCount}/{total})
          </p>
        </div>
      )}
      {hasPaid && (
        <div style={{ padding: '8px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.20)', borderRadius: 5, marginBottom: 6 }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#22c55e', margin: 0, textAlign: 'center' }}>✓ Tu as payé ta part ({myShare}€)</p>
        </div>
      )}

      {/* Song selection */}
      {(hasValidated || hasPaid) && (
        <button onClick={() => onSong(bookingId)}
          style={{ width: '100%', padding: '7px', borderRadius: 5, cursor: 'pointer', background: 'transparent', border: '1px dashed rgba(224,90,170,0.25)', color: 'rgba(224,90,170,0.7)', fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          🎵 {booking.songSelections?.[myId] ? `${booking.songSelections[myId].title} — ${booking.songSelections[myId].artist}` : 'Choisir ma musique'}
        </button>
      )}

      {/* Price */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Ta part ({myPct}%)</span>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 16, color: '#c8a96e' }}>{myShare}€</span>
      </div>
    </div>
  )
}
