import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import EmptyState from '../components/EmptyState'
import { MessagingSearchBar, MessagingQuickActions } from '../components/MessagingActions'
import {
  getUserId, initUsers, getAllUsers, getUserById, getUserByUsername, searchUsers,
  getInitials, formatTime, formatMsgTime, formatDateSeparator, isSameDay,
  getFriends, saveFriend, removeFriend,
  getFriendRequests, sendFriendRequest, acceptFriendRequest, declineFriendRequest, getNewContacts, clearNewContact,
  getConversations, getConversationById, saveConversation,
  createDirectConversation, createGroup, leaveGroup, deleteGroup, updateGroupInfo,
  getMessages, sendMessage, reactToMessage, deleteMessageForSelf, deleteMessageForAll,
  markMessagesRead, markMessagesDelivered, markPhotoViewed, setLastRead, getLastRead,
  getUnreadCount, voteOnPoll, pinMessage, unpinMessage,
  setTyping, getTypingUsers, setOnline, isOnline,
  seedDemoData, DEMO_USERS,
  getGroupBookings, saveGroupBooking, validateGroupBooking, payGroupBookingShare, addSongToGroupBooking, withdrawFromGroupBooking,
  blockUser, unblockUser, isBlocked, getBlockedUsers, reportUser, deleteConversationHistory, deleteConversationCompletely,
  editMessage, isConvMuted, toggleMuteConv,
  toggleStarMessage, isMessageStarred, getStarredMessages,
  getMyPrivacy, userShowsPhoto,
} from '../utils/messaging'
import { startStripeCheckout } from '../utils/stripe'
import { playNotifSound } from '../utils/notifSound'
import { upsertMessageNotification } from '../utils/notifications'

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
      {user?.avatar && userShowsPhoto(user)
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
  const [playing, setPlaying]   = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bars, setBars]         = useState(null) // null = loading, array = ready
  const audioRef = useRef(null)

  // Reset audio object whenever content changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setPlaying(false)
    setProgress(0)
  }, [content])

  // Decode waveform via Web Audio API (works for both data: and https: URLs)
  useEffect(() => {
    if (!content) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(content)
        const arrayBuf = await res.arrayBuffer()
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const audioBuffer = await ctx.decodeAudioData(arrayBuf)
        ctx.close()
        if (cancelled) return
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
        // Fallback: deterministic bars based on content hash
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
    if (!content) return
    if (!audioRef.current) {
      const a = new Audio()
      a.src = content
      a.onloadedmetadata = () => {
        if (!duration) setDuration(Math.round(a.duration))
      }
      a.ontimeupdate = () => {
        const d = a.duration || 1
        setProgress(a.currentTime / d)
      }
      a.onended = () => { setPlaying(false); setProgress(0) }
      a.onerror = () => { setPlaying(false) }
      audioRef.current = a
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      const p = audioRef.current.play()
      if (p && typeof p.then === 'function') {
        p.then(() => setPlaying(true)).catch(() => setPlaying(false))
      } else {
        setPlaying(true)
      }
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
  const navigate = useNavigate()
  let ev
  try { ev = typeof content === 'string' ? JSON.parse(content) : content } catch { return <span style={{ fontFamily: T.dmMono, fontSize: 11, color: T.gold }}>🎟 Événement</span> }
  const clickable = ev.id != null && ev.id !== ''
  const go = (e) => { e.stopPropagation(); if (clickable) navigate(`/evenements/${ev.id}`) }
  const priceLabel = ev.price == null ? null : (Number(ev.price) <= 0 ? 'Gratuit' : `dès ${ev.price}€`)
  return (
    <div onClick={go} style={{
      width: 252, borderRadius: 12, overflow: 'hidden',
      cursor: clickable ? 'pointer' : 'default',
      background: 'rgba(4,4,14,0.55)',
      border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: '0 8px 28px rgba(0,0,0,0.30)',
    }}>
      {/* Affiche / placeholder */}
      <div style={{ position: 'relative' }}>
        {ev.image
          ? <img src={ev.image} alt={ev.name} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg, rgba(200,169,110,0.20), rgba(78,232,200,0.10))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z"/><line x1="13" y1="7" x2="13" y2="17" strokeDasharray="2 2"/>
              </svg>
            </div>
        }
        {/* Gradient overlay bas pour lisibilité */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,4,14,0.65), transparent 55%)' }} />
        {/* Eyebrow */}
        <span style={{ position: 'absolute', top: 8, left: 8, fontFamily: T.dmMono, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#fff', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: '3px 7px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)' }}>Événement</span>
        {/* Badge prix */}
        {priceLabel && (
          <span style={{ position: 'absolute', top: 8, right: 8, fontFamily: T.dmMono, fontSize: 9, letterSpacing: '0.08em', color: T.gold, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(200,169,110,0.35)' }}>{priceLabel}</span>
        )}
      </div>
      {/* Infos + CTA */}
      <div style={{ padding: '11px 13px 13px' }}>
        <p style={{ fontFamily: T.cormorant, fontWeight: 500, fontSize: 16, color: '#fff', margin: '0 0 3px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name || 'Événement'}</p>
        <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: '0 0 11px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{ev.date || ''}</p>
        {clickable && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 7, background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.32)' }}>
            <span style={{ fontFamily: T.dmMono, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.gold }}>Voir l'événement →</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Catalog item card (offre prestataire partagée) ────────────────────────────
// Pendant de EventCard : rendu d'un message type 'catalog_item'. Clic → page
// publique du prestataire (pas de page détail par offre).
function CatalogItemCard({ content }) {
  const navigate = useNavigate()
  let it
  try { it = typeof content === 'string' ? JSON.parse(content) : content } catch { return <span style={{ fontFamily: T.dmMono, fontSize: 11, color: T.gold }}>🏷 Offre prestataire</span> }
  const clickable = it.providerId != null && it.providerId !== ''
  const go = (e) => { e.stopPropagation(); if (clickable) navigate(`/prestataires/${encodeURIComponent(it.providerId)}`) }
  const priceLabel = it.price != null && Number(it.price) > 0
    ? `${Number(it.price).toLocaleString('fr-FR')}€${it.unit ? ` / ${it.unit}` : ''}`
    : 'Sur demande'
  return (
    <div onClick={go} style={{ width: 252, borderRadius: 12, overflow: 'hidden', cursor: clickable ? 'pointer' : 'default', background: 'rgba(4,4,14,0.55)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 8px 28px rgba(0,0,0,0.30)' }}>
      <div style={{ position: 'relative' }}>
        {it.image
          ? <img src={it.image} alt={it.name} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg, rgba(200,169,110,0.20), rgba(78,232,200,0.10))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 12 22l-9-9V4a1 1 0 0 1 1-1h9z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
            </div>}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,4,14,0.65), transparent 55%)' }} />
        <span style={{ position: 'absolute', top: 8, left: 8, fontFamily: T.dmMono, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#fff', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: '3px 7px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)' }}>Offre{it.providerName ? ` · ${it.providerName}` : ''}</span>
        <span style={{ position: 'absolute', top: 8, right: 8, fontFamily: T.dmMono, fontSize: 9, letterSpacing: '0.08em', color: T.gold, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(200,169,110,0.35)' }}>{priceLabel}</span>
      </div>
      <div style={{ padding: '11px 13px 13px' }}>
        <p style={{ fontFamily: T.cormorant, fontWeight: 500, fontSize: 16, color: '#fff', margin: '0 0 3px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name || 'Offre'}</p>
        {it.category && <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: '0 0 11px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{it.category}</p>}
        {clickable && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 7, background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.32)' }}>
            <span style={{ fontFamily: T.dmMono, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.gold }}>Voir le prestataire →</span>
          </div>
        )}
      </div>
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
  // Réciprocité : si J'AI désactivé les accusés de lecture, je ne peux pas voir
  // si les autres ont lu mes messages (et je n'en diffuse pas non plus — voir
  // le gate sur markMessagesRead). On n'affiche alors jamais le « lu ».
  const canSeeRead = getMyPrivacy().readReceipts
  const readByOthers  = canSeeRead && others.some(id => msg.readBy?.[id])
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

// ─── Swipe to Reply ────────────────────────────────────────────────────────────
function SwipeableMessage({ onReply, children }) {
  const [swipeX, setSwipeX] = useState(0)
  const startXRef = useRef(0)
  const activeRef = useRef(false)
  const firedRef = useRef(false)
  const THRESHOLD = 62

  function onTouchStart(e) {
    startXRef.current = e.touches[0].clientX
    activeRef.current = true
    firedRef.current = false
  }
  function onTouchMove(e) {
    if (!activeRef.current) return
    const dx = e.touches[0].clientX - startXRef.current
    if (dx < 0) return
    const clamped = Math.min(dx, THRESHOLD + 12)
    setSwipeX(clamped)
    if (clamped >= THRESHOLD && !firedRef.current) {
      firedRef.current = true
      try { navigator.vibrate?.(18) } catch {}
    }
  }
  function onTouchEnd() {
    activeRef.current = false
    if (firedRef.current) onReply()
    setSwipeX(0)
  }

  const progress = Math.min(1, swipeX / THRESHOLD)
  const isSnapping = swipeX === 0

  return (
    <div style={{ position: 'relative', touchAction: 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}>
      {/* Reply arrow */}
      <div style={{
        position: 'absolute', left: 6, top: '50%',
        transform: `translateY(-50%) scale(${0.3 + 0.7 * progress})`,
        opacity: progress,
        transition: isSnapping ? 'all 0.22s ease' : 'none',
        color: T.teal, fontSize: 17, pointerEvents: 'none', zIndex: 1,
      }}>↩</div>
      <div style={{
        transform: `translateX(${swipeX}px)`,
        transition: isSnapping ? 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
      }}>
        {children}
      </div>
    </div>
  )
}

// ─── Image bubble (URL / Firestore photoId / 24h expiration) ─────────────────
function ImageBubble({ msg, myId, setPhotoViewer }) {
  const [imgSrc, setImgSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const content = msg.content
  const isMe = msg.senderId === myId
  const isUrl = content && (content.startsWith('http') || content.startsWith('data:'))
  const isPhotoId = content && content.startsWith('ph_')
  const isMissing = !content || content === '[image]'

  // 24h expiration
  const expiresAt = new Date(msg.timestamp).getTime() + 24 * 3600 * 1000
  const isExpired = Date.now() > expiresAt
  const hoursLeft = Math.ceil((expiresAt - Date.now()) / 3600000)

  useEffect(() => {
    if (isUrl) { setImgSrc(content); return }
    if (isPhotoId) {
      const cache = (() => { try { return JSON.parse(localStorage.getItem('lib_photo_cache') || '{}') } catch { return {} } })()
      if (cache[content]?.data) { setImgSrc(cache[content].data); return }
      setLoading(true)
      import('../utils/firestore-sync').then(({ loadDoc }) => loadDoc(`conv_photos/${content}`))
        .then(data => {
          if (data?.data) {
            setImgSrc(data.data)
            const c = (() => { try { return JSON.parse(localStorage.getItem('lib_photo_cache') || '{}') } catch { return {} } })()
            c[content] = { data: data.data }
            localStorage.setItem('lib_photo_cache', JSON.stringify(c))
          }
        }).catch(() => {}).finally(() => setLoading(false))
    }
  }, [content])

  if (isMissing) return <span style={{ fontFamily: T.dmMono, fontSize: 10, color: T.dim }}>📷 Photo</span>

  if (isExpired) return (
    <div style={{ width: 180, height: 90, borderRadius: 8, background: 'rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
      <span style={{ fontSize: 18 }}>⏱</span>
      <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim }}>Photo expirée</span>
    </div>
  )

  if (loading && !imgSrc) return (
    <div style={{ width: 180, height: 100, borderRadius: 8, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim }}>Chargement…</span>
    </div>
  )

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img src={imgSrc} alt="photo"
        onClick={() => imgSrc && setPhotoViewer({ src: imgSrc })}
        style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block', cursor: imgSrc ? 'zoom-in' : 'default' }} />
      {/* Expiry badge */}
      {hoursLeft <= 23 && (
        <span style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 5px', fontFamily: T.dmMono, fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>
          ⏱ {hoursLeft}h
        </span>
      )}
      {/* Download button — recipient only */}
      {!isMe && imgSrc && (
        <a href={imgSrc} download="photo.jpg" onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 5, right: 5, background: 'rgba(0,0,0,0.55)', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#fff', fontSize: 14 }}>
          ↓
        </a>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function MessagingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const myId   = getUserId(user)
  const myName     = user?.name || 'Moi'
  const myUsername = user?.username || getUserById(myId)?.username || null

  // ── Views ──
  const [view, setView]           = useState('list') // list | chat | search | new-group | contacts
  const [chatSubView, setChatSubView] = useState('messages') // messages | settings
  const [activeConvId, setActiveConvId] = useState(null)
  const [showMsgSearch, setShowMsgSearch] = useState(false) // barre de recherche dans la conversation
  const [msgSearch, setMsgSearch] = useState('')

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
  const [editingMsg, setEditingMsg] = useState(null)     // { id } — édition d'un message texte
  const [muteTick, setMuteTick]     = useState(0)        // force le re-render au toggle mute
  const [highlightedMsgId, setHighlightedMsgId] = useState(null) // message glow on reply-preview click
  const [forwardMsg, setForwardMsg] = useState(null)     // message to forward

  // ── Overlays ──
  const [contextMenu, setContextMenu]       = useState(null) // { msg, x, y }
  const [emojiPicker, setEmojiPicker]       = useState(null) // { msgId }
  const [showPollCreator, setShowPollCreator]     = useState(false)
  const [showStoryCreator, setShowStoryCreator]   = useState(false)
  const [showAttachMenu, setShowAttachMenu]       = useState(false)
  const [showCamera, setShowCamera]               = useState(false) // capture webcam (desktop)
  const [showForwardPicker, setShowForwardPicker] = useState(false)
  const [songPickerModal, setSongPickerModal]     = useState(null)
  const [songInput, setSongInput]                 = useState({ title: '', artist: '' })
  const [confirmDialog, setConfirmDialog]         = useState(null)
  const [toast, setToast]                         = useState(null)
  const [photoViewer, setPhotoViewer]             = useState(null) // null | { src }
  const [photoPreview, setPhotoPreview]           = useState(null) // null | { dataUrl, blob, viewOnce }
  const [listPhoto, setListPhoto]                 = useState(null) // photo capturée depuis la liste → choix du destinataire
  const listCameraRef                             = useRef(null)
  // Split-view PC (façon WhatsApp) : liste à gauche + conversation à droite.
  const [isDesktop, setIsDesktop]                 = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)')?.matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const on = e => setIsDesktop(e.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

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
  const [editGroupName, setEditGroupName]         = useState('')
  const [editContribPcts, setEditContribPcts]     = useState(null) // { [userId]: pct } while editing
  const [showAddMember, setShowAddMember]         = useState(false)
  const [addMemberSearch, setAddMemberSearch]     = useState('')

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
  const messagesEndRef      = useRef(null)
  const chatScrollRef       = useRef(null)
  const photoInputRef       = useRef(null)
  const cameraInputRef      = useRef(null)
  const activeConvIdRef     = useRef(null)
  const lastConvUpdatedRef  = useRef({}) // { [convId]: updatedAt ISO } — détecte les nouveaux messages
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
    // Scroller le CONTENEUR du chat, pas la fenêtre : scrollIntoView remontait
    // toute la page (nav + footer visibles) à chaque nouveau message.
    const el = chatScrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setShowScrollBtn(false)
  }

  // ── Notification sound (util partagé, robuste — un seul AudioContext) ──
  const notifSound = playNotifSound

  // ── Mirror activeConvId into ref (safe to use inside closures) ──
  useEffect(() => { activeConvIdRef.current = activeConvId }, [activeConvId])

  // ── Request push notification permission once ──
  useEffect(() => {
    if (!user) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      // Wait a moment so it doesn't feel intrusive
      const t = setTimeout(() => Notification.requestPermission().catch(() => {}), 3500)
      return () => clearTimeout(t)
    }
  }, [!!user])

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
    const interval = setInterval(() => {
      setOnline(myId)
      const latestConvs = getConversations(myId)
      setConversations(latestConvs)
      const newReqs = getFriendRequests(myId)
      setRequests(newReqs)
      setFriends(getFriends(myId))
      if (newReqs.length > prevRequestCount) {
        notifSound()
        const latestReq = newReqs[newReqs.length - 1]
        const senderLabel = latestReq?.fromUsername ? `@${latestReq.fromUsername}` : (latestReq?.fromName || 'quelqu\'un')
        showToast(`📩 Nouvelle demande de contact de ${senderLabel}`)
      }
      setPrevRequestCount(newReqs.length)
      if (activeConvIdRef.current) {
        setMessages(getMessages(activeConvIdRef.current))
        setTypingUsersState(getTypingUsers(activeConvIdRef.current, myId))
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [myId, prevRequestCount])

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
      // ── Helper: browser notification ──
      function triggerPushNotif(title, body) {
        try {
          if (typeof Notification === 'undefined') return
          if (Notification.permission !== 'granted') return
          const n = new Notification(title, {
            body,
            icon: '/logo192.png',
            badge: '/logo192.png',
            tag: 'liveinblack-msg', // regroupe les notifs
            silent: true,           // pas de son (désactivé produit)
          })
          n.onclick = () => { window.focus(); n.close() }
        } catch {}
      }

      const mergeConvs = convs => {
        const local = safeArr('lib_conversations')
        const merged = mergeById(local, convs)
        localStorage.setItem('lib_conversations', JSON.stringify(merged))

        // ── Detect new messages → notification ──
        convs.forEach(incoming => {
          const prev = lastConvUpdatedRef.current[incoming.id]
          const isNewer = !prev || incoming.updatedAt > prev
          const notMyMessage = incoming.lastSenderId && incoming.lastSenderId !== myId
          const isActive = incoming.id === activeConvIdRef.current && document.visibilityState === 'visible'
          if (isNewer && incoming.lastMessage && !isActive) {
            const lastRead = getLastRead(incoming.id)
            const hasUnread = !lastRead || incoming.updatedAt > lastRead
            if (hasUnread) {
              // Sender name
              const senderName = incoming.type === 'group'
                ? incoming.name || 'Groupe'
                : incoming.names
                  ? (Object.entries(incoming.names).find(([id]) => id !== myId)?.[1] || 'Message')
                  : 'Message'
              triggerPushNotif(senderName, incoming.lastMessage)
              notifSound()
              // Alimente aussi la cloche de notifications (1 entrée par conversation)
              upsertMessageNotification(myId, incoming.id, senderName, incoming.lastMessage)
            }
          }
          // Always update our "last seen" tracker
          if (!prev || incoming.updatedAt > prev) {
            lastConvUpdatedRef.current[incoming.id] = incoming.updatedAt
          }
        })

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

  // ── Presence listener — active direct conversation partner ──
  useEffect(() => {
    if (!activeConvId || !myId) return
    // Get the other person's ID from the active conv
    const conv = conversations.find(c => c.id === activeConvId)
      || (() => { try { return JSON.parse(localStorage.getItem('lib_conversations') || '{}')[myId]?.find(c => c.id === activeConvId) } catch { return null } })()
    if (!conv || conv.type !== 'direct') return
    const otherId = conv.participants?.find(id => id !== myId)
    if (!otherId) return

    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenUserPresence }) => {
      unsub = listenUserPresence(otherId, ({ lastSeen }) => {
        if (!lastSeen) return
        try {
          const all = JSON.parse(localStorage.getItem('lib_online') || '{}')
          all[otherId] = lastSeen
          localStorage.setItem('lib_online', JSON.stringify(all))
        } catch {}
      })
    }).catch(() => {})
    return () => unsub()
  }, [activeConvId, myId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Auto-scroll seulement si l'utilisateur est déjà en bas — et uniquement
    // dans le conteneur du chat (jamais la fenêtre, sinon la page entière saute).
    if (!showScrollBtn) {
      const el = chatScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
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
          setLastRead(convId, myId)
        }).catch(() => { markMessagesDelivered(convId, myId); markMessagesRead(convId, myId); setLastRead(convId, myId) })
      }).catch(() => { markMessagesDelivered(convId, myId); markMessagesRead(convId, myId); setLastRead(convId, myId) })
    } else {
      markMessagesDelivered(convId, myId)
      markMessagesRead(convId, myId)
    }
    setLastRead(convId, myId)
    setGroupBookings(getGroupBookings())
    // Sync group bookings referenced in this conversation from Firestore
    // so members on other devices can validate/pay without re-creating the booking
    import('../utils/firestore-sync').then(({ loadCollection }) => {
      loadCollection('group_bookings').then(firestoreBookings => {
        if (!firestoreBookings.length) return
        const local = getGroupBookings()
        let changed = false
        firestoreBookings.forEach(fb => {
          if (fb.id && (!local[fb.id] || JSON.stringify(local[fb.id]) !== JSON.stringify(fb))) {
            local[fb.id] = fb
            changed = true
          }
        })
        if (changed) {
          localStorage.setItem('lib_group_bookings', JSON.stringify(local))
          setGroupBookings({ ...local })
        }
      }).catch(() => {})
    }).catch(() => {})
    const conv = getConversationById(convId)
    if (conv?.pinnedMessageId) {
      // will be rendered in pinned bar
    }
  }

  // Une page prestataire peut créer une conversation puis demander à la
  // messagerie de l'ouvrir immédiatement, sans obliger l'utilisateur à la
  // retrouver manuellement dans la liste.
  useEffect(() => {
    const requestedConversationId = location.state?.conversationId
    if (!requestedConversationId || !myId) return
    openConv(requestedConversationId)
    navigate('/messagerie', { replace: true, state: null })
  }, [location.state?.conversationId, myId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Conversation display helper ──
  function getConvDisplay(conv) {
    if (!conv) return { name: '?', user: null, isGroup: false }
    if (conv.type === 'direct') {
      const otherId = conv.participants?.find(id => id !== myId)
      const other   = getUserById(otherId) || allUsers.find(u => u.id === otherId)
      // Compte supprimé : soit pierre tombale (role/status 'deleted'), soit
      // contact d'une conversation existante devenu introuvable une fois les
      // utilisateurs chargés (supprimé et purgé). On garde le nom en cache mais
      // on signale visuellement que le compte n'existe plus.
      const isDeleted = !!other && (other.status === 'deleted' || other.role === 'deleted')
      const isGone = (!other && allUsers.length > 0 && !!otherId)
      return {
        name: isDeleted ? 'Compte supprimé' : (other?.name || conv.names?.[otherId] || 'Utilisateur'),
        user: other, isGroup: false, otherId,
        deleted: isDeleted || isGone,
      }
    }
    return { name: conv.name, user: null, isGroup: true, memberCount: conv.members?.length || 0 }
  }

  const activeConv  = conversations.find(c => c.id === activeConvId) || getConversationById(activeConvId)
  const amAdmin     = activeConv?.type === 'group' && activeConv?.members?.find(m => m.userId === myId)?.role === 'admin'
  const pinnedMsg   = activeConv?.pinnedMessageId ? messages.find(m => m.id === activeConv.pinnedMessageId) : null

  // Téléphone de l'interlocuteur (conv directe) — fetché à la demande depuis Firestore
  // (users/{uid} + providers/{uid}, lisibles par tout connecté). Confidentialité :
  //  · numéro PERSO (users.phone) affiché SEULEMENT si l'autre l'a autorisé (privacy.showPhone) ;
  //  · numéro PRO = users.proPhone (UN numéro par compte, partagé organisateur/
  //    prestataire) → contact business, affiché s'il existe. Fallback historique :
  //    providers.phone (anciens comptes pas encore migrés).
  const directOtherId = activeConv?.type === 'direct' ? activeConv.participants?.find(id => id !== myId) : null
  const [contactPhones, setContactPhones] = useState(null) // { perso, pro } | null
  useEffect(() => {
    if (!directOtherId) { setContactPhones(null); return }
    let cancelled = false
    setContactPhones(null)
    Promise.all([import('../firebase'), import('firebase/firestore')]).then(async ([{ db }, { doc, getDoc }]) => {
      let perso = null, pro = null
      try {
        const s = await getDoc(doc(db, 'users', String(directOtherId)))
        if (s.exists()) {
          const d = s.data()
          if (d.privacy?.showPhone === true && d.phone) perso = d.phone
          if (d.proPhone) pro = d.proPhone
        }
      } catch {}
      if (!pro) {
        try { const s = await getDoc(doc(db, 'providers', String(directOtherId))); if (s.exists() && s.data().phone) pro = s.data().phone } catch {}
      }
      if (!cancelled) setContactPhones({ perso, pro })
    }).catch(() => { if (!cancelled) setContactPhones({ perso: null, pro: null }) })
    return () => { cancelled = true }
  }, [directOtherId])

  // ── Send text ──
  function handleSend() {
    const text = inputText.trim()
    if (!text || !activeConvId) return
    // Mode édition : on modifie le message existant au lieu d'en envoyer un nouveau
    if (editingMsg) {
      editMessage(activeConvId, editingMsg.id, myId, text)
      setEditingMsg(null)
      setInputText('')
      setMessages(getMessages(activeConvId))
      setConversations(getConversations(myId))
      setTyping(activeConvId, myId, false)
      return
    }
    const extra = replyTo ? { replyTo } : {}
    sendMessage(activeConvId, myId, myName, 'text', text, extra)
    // Notifier les membres mentionnés (@Nom) en groupe
    const mentioned = findMentionedMembers(text)
    if (mentioned.length) {
      const convName = activeConv?.name || 'un groupe'
      import('../utils/notifications').then(({ createNotification }) => {
        mentioned.forEach(m => createNotification(m.userId, 'mention', `${myName} t'a mentionné`, `${convName} : ${text.slice(0, 80)}`, { convId: activeConvId }))
      }).catch(() => {})
    }
    setInputText('')
    setReplyTo(null)
    setMessages(getMessages(activeConvId))
    setConversations(getConversations(myId))
    setTyping(activeConvId, myId, false)
  }

  function handleEditStart(msg) {
    setReplyTo(null)
    setEditingMsg({ id: msg.id })
    setInputText(msg.content || '')
  }
  function handleEditCancel() {
    setEditingMsg(null)
    setInputText('')
  }

  // ── @mentions (groupes) ──
  // Détecte un token « @… » en fin de saisie pour proposer les membres.
  const mentionCtx = (() => {
    if (activeConv?.type !== 'group') return null
    const m = inputText.match(/(?:^|\s)@([^\s@]*)$/)
    return m ? { query: m[1].toLowerCase() } : null
  })()
  const mentionMatches = mentionCtx
    ? (activeConv?.members || []).filter(mm => mm.userId !== myId && (mm.name || '').toLowerCase().includes(mentionCtx.query)).slice(0, 5)
    : []
  function applyMention(member) {
    setInputText(prev => prev.replace(/((?:^|\s)@)[^\s@]*$/, `$1${member.name} `))
  }
  // Repère les membres mentionnés dans un texte (pour notifier)
  function findMentionedMembers(text) {
    const members = activeConv?.members || []
    return members.filter(m => m.userId !== myId && m.name && text.includes(`@${m.name}`))
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

  // ── Select photo → show preview modal first ──
  function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file || !activeConvId) return
    // Read original immediately for preview (no async chain that can silently fail on mobile)
    const reader = new FileReader()
    reader.onload = ev => {
      setPhotoPreview({ dataUrl: ev.target.result, file })
      setShowAttachMenu(false)
    }
    reader.onerror = () => setShowAttachMenu(false)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Send photo from preview (Storage → conv_photos Firestore doc fallback) ──
  async function handleSendPhoto() {
    if (!photoPreview) return
    const photo = photoPreview
    setPhotoPreview(null)
    const extra = replyTo ? { replyTo } : {}
    setReplyTo(null)
    await sendPhotoTo(activeConvId, photo, extra)
  }

  // Envoi d'une photo vers UNE conversation précise (réutilisé par le parcours
  // « appareil photo » depuis la liste des conversations).
  async function sendPhotoTo(convId, photo, extra = {}) {
    if (!photo || !convId) return
    const { dataUrl, file } = photo
    let blob = file
    try { blob = await compressImage(file) } catch {}
    let sent = false
    try {
      const { storage } = await import('../firebase')
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
      const path = `messages/${myId}/${convId}/${Date.now()}.jpg`
      const snap = await uploadBytes(ref(storage, path), blob)
      const url = await getDownloadURL(snap.ref)
      sendMessage(convId, myId, myName, 'image', url, extra)
      sent = true
    } catch {}
    if (!sent) {
      const photoId = 'ph_' + Date.now()
      const cache = (() => { try { return JSON.parse(localStorage.getItem('lib_photo_cache') || '{}') } catch { return {} } })()
      cache[photoId] = { data: dataUrl }
      localStorage.setItem('lib_photo_cache', JSON.stringify(cache))
      import('../utils/firestore-sync').then(({ syncDocOverwrite }) => {
        syncDocOverwrite(`conv_photos/${photoId}`, { data: dataUrl, convId, senderId: myId, timestamp: new Date().toISOString() })
      }).catch(() => {})
      sendMessage(convId, myId, myName, 'image', photoId, extra)
    }
    if (convId === activeConvId) setMessages(getMessages(convId))
    setConversations(getConversations(myId))
  }

  // ── Voice recording core ──
  async function startRecordingCore(isTap = false) {
    if (mediaRecorderRef.current?.state === 'recording') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Choisir le bon format selon le navigateur (webm sur Chrome, mp4 sur Safari/iOS)
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || ''
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
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
    mr.onstop = async () => {
      if (mr._shouldSend && audioChunksRef.current.length > 0) {
        // Utiliser le vrai mimeType du recorder (webm sur Chrome, mp4 sur Safari)
        const actualMime = mr.mimeType || 'audio/webm'
        const ext = actualMime.includes('mp4') ? 'mp4' : actualMime.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(audioChunksRef.current, { type: actualMime })
        const extra = replyTo ? { replyTo } : {}
        try {
          const { storage } = await import('../firebase')
          const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
          // Chemin uid-scopé : messages/{uid}/{convId}/... (cf. règle Storage)
          const path = `messages/${myId}/${activeConvId}/${Date.now()}_voice.${ext}`
          const snap = await uploadBytes(ref(storage, path), blob)
          const url = await getDownloadURL(snap.ref)
          sendMessage(activeConvId, myId, myName, 'voice', url, extra)
        } catch {
          // Fallback base64 (local only)
          const reader = new FileReader()
          reader.onload = ev => {
            sendMessage(activeConvId, myId, myName, 'voice', ev.target.result, extra)
          }
          reader.readAsDataURL(blob)
        }
        setReplyTo(null)
        setMessages(getMessages(activeConvId))
        setConversations(getConversations(myId))
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
      withdrawnMembers: [],
      createdBy: myId,
      createdAt: new Date().toISOString(),
      // Deadline pour compléter la résa de groupe (urgence). 72h par défaut.
      deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
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
    showToast(`Message transféré à ${fwdName}`)
  }

  // ── Group booking 2-step ──
  function handleValidateBooking(bookingId) {
    validateGroupBooking(bookingId, myId)
    setGroupBookings(getGroupBookings())
    setMessages(getMessages(activeConvId))
    showToast('Tu as validé la proposition')
  }

  async function handlePayBooking(bookingId) {
    const booking = getGroupBookings()[bookingId]
    if (!booking) return
    const conv = activeConv
    // Part = partage égal entre membres ACTIFS (cohérent avec la carte et le
    // ré-équilibrage au retrait).
    const withdrawnSet = new Set(booking.withdrawnMembers || [])
    const activeCount = (conv?.members || []).filter(m => !withdrawnSet.has(m.userId)).length || Math.max(booking.groupMin || 1, 1)
    const myShare = Math.round((booking.totalPrice / Math.max(activeCount, 1)) * 100) / 100

    // Construire un pending booking — la page /paiement-reussi le finalisera
    const arr = new Uint32Array(2)
    crypto.getRandomValues(arr)
    const pendingId = `${arr[0].toString(36)}${arr[1].toString(36)}`.slice(0, 16).toUpperCase()
    const pending = {
      bookingId: pendingId,
      eventId: booking.eventId,
      eventName: booking.eventName,
      eventDate: booking.eventDate,
      eventDateISO: booking.eventDateISO,
      eventStartTime: booking.eventStartTime,
      eventEndTime: booking.eventEndTime,
      placeType: booking.placeName,
      qty: 1,
      unitPriceEUR: myShare,
      preorderItems: [],
      perTicketOrders: [{ items: {}, shows: {} }],
      activeMenu: [],
      userId: myId,
      userName: myName,
      userEmail: user?.email || null,
      // Flag spécifique réservation de groupe — utilisé par /paiement-reussi
      groupBookingId: bookingId,
      isGroupShare: true,
      createdAt: new Date().toISOString(),
    }
    try { localStorage.setItem(`lib_pending_booking_${pendingId}`, JSON.stringify(pending)) } catch {}

    showToast('Redirection vers Stripe…')
    const result = await startStripeCheckout({
      eventId: booking.eventId,
      eventName: `${booking.eventName} (part de groupe)`,
      placeType: booking.placeName,
      qty: 1,
      unitPriceEUR: myShare,
      preorderItems: [],
      userId: myId,
      userEmail: user?.email,
      bookingId: pendingId,
      // Propagés jusqu'au webhook : si le payeur ferme l'onglet avant le retour
      // sur /paiement-reussi, le webhook marque quand même sa part payée.
      groupBookingId: bookingId,
      isGroupShare: true,
    })
    if (!result.ok) {
      showToast('Erreur Stripe — réessaye dans un instant', 'error')
      try { localStorage.removeItem(`lib_pending_booking_${pendingId}`) } catch {}
    }
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
  function handleSendRequest(userId) { sendFriendRequest(myId, myName, userId, myUsername); refresh() }
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
    // Retrait d'ami → on supprime VRAIMENT la conversation (pas un simple effacement).
    const conv = conversations.find(c => c.type === 'direct' && c.participants?.includes(fid))
    if (conv) deleteConversationCompletely(conv.id)
    setFriends(prev => prev.filter(id => id !== fid))
    refresh()
    showToast('Contact supprimé')
  }
  function handleBlockUser(userId, userName) {
    // Blocage RÉEL : on garde la conversation et l'ami, mais on n'échange plus.
    // Une notice système est inscrite et l'envoi est verrouillé tant que bloqué ;
    // les messages reçus de cette personne sont filtrés à l'affichage.
    blockUser(myId, userId)
    const conv = conversations.find(c => c.type === 'direct' && c.participants?.includes(userId))
    if (conv) sendMessage(conv.id, 'system', 'Système', 'system', `SYS::${JSON.stringify({ kind: 'block', by: myId, byName: myName, target: userId, targetName: userName })}`)
    setBlockedUsers(getBlockedUsers(myId))
    if (conv) { setConversations(getConversations(myId)); setMessages(getMessages(conv.id)) }
    showToast(`${userName} bloqué·e`)
  }
  function handleUnblockUser(userId, userName) {
    unblockUser(myId, userId)
    setBlockedUsers(getBlockedUsers(myId))
    showToast(`${userName} débloqué·e`)
  }
  // Texte d'un message système selon le spectateur : un blocage doit se lire
  // « Tu as bloqué X » pour l'auteur, mais « X t'a bloqué » pour la personne bloquée.
  function sysContent(content) {
    if (typeof content === 'string' && content.startsWith('SYS::')) {
      try {
        const d = JSON.parse(content.slice(5))
        if (d.kind === 'block') {
          if (myId === d.by) return `Tu as bloqué ${d.targetName}. Tu ne recevras plus ses messages.`
          if (myId === d.target) return `${d.byName} t'a bloqué. Tu ne peux plus lui envoyer de messages.`
          return 'Un participant a été bloqué.'
        }
        if (d.kind === 'unblock') {
          if (myId === d.by) return 'Tu as débloqué ce contact.'
          if (myId === d.target) return `${d.byName} t'a débloqué. Vous pouvez de nouveau échanger.`
          return ''
        }
      } catch { /* fallback texte brut */ }
    }
    return content
  }
  function handleReport(userId, userName) {
    if (!reportReason.trim()) return
    reportUser(myId, myName, userId, userName, reportReason.trim())
    setShowReportModal(null)
    setReportReason('')
    setConfirmDialog({ action: 'block_after_report', label: `Bloquer aussi ${userName} ?`, userId, userName })
  }

  // ── Group management ──
  function handleLeaveGroup() {
    leaveGroup(activeConvId, myId, myName)
    setConversations(getConversations(myId))
    setView('list'); setActiveConvId(null)
    showToast('Tu as quitté le groupe')
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
  function handleAddMember(userId) {
    if (!activeConv) return
    const u = getUserById(userId) || allUsers.find(x => x.id === userId)
    if (!u) return
    if (activeConv.members?.some(m => m.userId === userId)) return
    const newMembers = [
      ...(activeConv.members || []),
      { userId, name: u.name, role: 'member', contributionPct: Math.round(100 / ((activeConv.members?.length || 0) + 1)) }
    ]
    // Rebalance contributions equally
    const equalPct = Math.floor(100 / newMembers.length)
    const remainder = 100 - equalPct * newMembers.length
    const balanced = newMembers.map((m, i) => ({ ...m, contributionPct: equalPct + (i === 0 ? remainder : 0) }))
    saveConversation({ ...activeConv, members: balanced, participantIds: balanced.map(m => m.userId) })
    sendMessage(activeConvId, myId, myName, 'system', `${myName} a ajouté ${u.name}`)
    refresh()
    setShowAddMember(false)
    setAddMemberSearch('')
    showToast(`${u.name} ajouté·e au groupe`)
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
      <div key={msg.id} data-msg-id={msg.id}>
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
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: T.dim, background: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: '4px 12px' }}>
              {sysContent(msg.content)}
            </span>
          </div>
        ) : (
          <SwipeableMessage onReply={() => handleReply(msg)}>
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

              {/* Reply preview — click to scroll to original */}
              {msg.replyTo && (
                <div
                  onClick={() => {
                    const el = document.querySelector(`[data-msg-id="${msg.replyTo.id}"]`)
                    if (!el) return
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    setHighlightedMsgId(msg.replyTo.id)
                    setTimeout(() => setHighlightedMsgId(null), 2000)
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '4px 8px',
                    borderLeft: `2px solid ${isMe ? T.teal : T.gold}`,
                    maxWidth: 220, cursor: 'pointer',
                  }}>
                  <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.muted, margin: 0 }}>{msg.replyTo.senderName}</p>
                  <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.replyTo.preview}</p>
                </div>
              )}

              {/* Bubble */}
              <div
                onContextMenu={e => { e.preventDefault(); setContextMenu({ msg, x: e.clientX, y: e.clientY }) }}
                style={{
                  padding: isDeleted ? '8px 14px' : msg.type === 'image' || msg.type === 'poll' || msg.type === 'story' ? '6px' : '10px 14px',
                  borderRadius: isMe ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
                  background: isMe
                    ? 'linear-gradient(135deg, rgba(78,232,200,0.26), rgba(78,232,200,0.13))'
                    : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${isMe ? 'rgba(78,232,200,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  maxWidth: '100%',
                  cursor: 'context-menu',
                  position: 'relative',
                  transition: 'box-shadow 0.3s',
                  boxShadow: highlightedMsgId === msg.id
                    ? '0 0 0 2px rgba(255,255,255,0.75), 0 0 18px rgba(255,255,255,0.25)'
                    : 'none',
                }}>
                {isDeleted ? (
                  <span style={{ fontFamily: T.dmMono, fontSize: 10, color: T.dim, fontStyle: 'italic' }}>
                    🚫 Ce message a été supprimé
                  </span>
                ) : msg.type === 'text' ? (
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: isMe ? '#eafff9' : 'rgba(255,255,255,0.92)', margin: 0, wordBreak: 'break-word', lineHeight: 1.45 }}>
                    <MentionText content={msg.content} members={activeConv?.members} />
                    {msg.editedAt && <span style={{ fontSize: 8.5, color: T.dim, marginLeft: 5, fontStyle: 'italic' }}>(modifié)</span>}
                  </p>
                ) : msg.type === 'image' ? (
                  <ImageBubble msg={msg} myId={myId} setPhotoViewer={setPhotoViewer} />
                ) : msg.type === 'voice' ? (
                  <VoiceBubble content={msg.content} isMe={isMe} />
                ) : msg.type === 'event_poll' ? (
                  <EventPollCard msg={msg} myId={myId} convId={activeConvId} onVote={(mid, oid) => { voteOnPoll(activeConvId, mid, oid, myId); setMessages(getMessages(activeConvId)) }} />
                ) : msg.type === 'poll' ? (
                  <PollCard msg={msg} myId={myId} convId={activeConvId} onVote={(mid, oid) => { voteOnPoll(activeConvId, mid, oid, myId); setMessages(getMessages(activeConvId)) }} />
                ) : msg.type === 'story' ? (
                  <StoryCard content={msg.content} />
                ) : msg.type === 'group_booking' ? (
                  <GroupBookingCard bookingId={msg.content} myId={myId} myName={myName} conv={activeConv} onValidate={handleValidateBooking} onPay={handlePayBooking} onSong={bId => { setSongPickerModal(bId); setSongInput({ title: '', artist: '' }) }} onNudge={(names) => { sendMessage(activeConvId, myId, myName, 'text', `⏳ ${names} — on vous attend pour la sortie, validez/payez votre part 👀`); setMessages(getMessages(activeConvId)); showToast('Relance envoyée') }} onWithdraw={(bId) => { withdrawFromGroupBooking(bId, myId); setGroupBookings(getGroupBookings()); sendMessage(activeConvId, myId, myName, 'text', `${myName} s'est retiré de la sortie — les parts ont été ré-équilibrées.`); setMessages(getMessages(activeConvId)); showToast('Tu t\'es retiré du groupe') }} groupBookings={groupBookings} />
                ) : msg.type === 'event' ? (
                  <EventCard content={msg.content} />
                ) : msg.type === 'catalog_item' ? (
                  <CatalogItemCard content={msg.content} />
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

              {/* Time + read receipt + étoile important */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                {isMessageStarred(myId, activeConvId, msg.id) && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="#e0c690" stroke="#e0c690" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>
                )}
                <span style={{ fontFamily: T.dmMono, fontSize: 8, color: T.dim }}>{formatMsgTime(msg.timestamp)}</span>
                {isMe && <ReadReceipt msg={msg} myId={myId} conv={activeConv} />}
              </div>
            </div>
          </div>
          </SwipeableMessage>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEWS
  // ─────────────────────────────────────────────────────────────────────────────

  // ── List view ──
  function renderListPane() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: isDesktop ? '100%' : 'auto', minHeight: 0 }}>
        {/* Header — recherche + actions */}
        <div style={{ padding: '14px 16px 10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MessagingSearchBar value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
            </div>
            {/* Appareil photo → capture puis choix du destinataire */}
            <button onClick={() => listCameraRef.current?.click()} aria-label="Appareil photo" className="lib-press"
              style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 18, background: 'rgba(78,232,200,0.1)', border: '1px solid rgba(78,232,200,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ee8c8' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
            <input ref={listCameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setListPhoto({ dataUrl: ev.target.result, file: f }); r.readAsDataURL(f); e.target.value = '' }} />
          </div>
          {/* Quick actions — compactes, côte à côte */}
          <div style={{ marginTop: 8 }}>
            <MessagingQuickActions
              friendBadge={pendingRequests}
              onAddFriend={() => { setView('contacts'); setFriends(getFriends(myId)); setRequests(getFriendRequests(myId)); setContactSearch('') }}
              onCreateGroup={() => { setView('new-group'); setNewGroupStep(1); setNewGroupMembers([]); setNewGroupName(''); setNewGroupAvatar(null) }}
            />
          </div>
          {/* Accès : messages importants + confidentialité (bloqués / signalés) */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setView('starred')} className="lib-press"
              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 14, background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.2)', cursor: 'pointer', color: '#e0c690', fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#e0c690" stroke="#e0c690" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>
              Importants
            </button>
            <button onClick={() => { setView('blocked'); setBlockedUsers(getBlockedUsers(myId)) }} className="lib-press"
              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Bloqués & signalés
            </button>
          </div>
        </div>

        {/* Conversation list (scrollable sur desktop) */}
        <div style={{ flex: isDesktop ? '1 1 0' : 'none', minHeight: 0, overflowY: isDesktop ? 'auto' : 'visible' }}>
        {(() => {
          const filtered = conversations.filter(conv => {
            if (!contactSearch.trim()) return true
            const d = getConvDisplay(conv)
            return d.name.toLowerCase().includes(contactSearch.toLowerCase()) || conv.lastMessage?.toLowerCase().includes(contactSearch.toLowerCase())
          })
          if (filtered.length === 0) return (
            <div style={{ padding: '0 16px' }}>
              <EmptyState
                icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(78,232,200,0.7)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>}
                title="Aucune conversation"
                subtitle="Ajoute un contact et commence à discuter"
              />
            </div>
          )
          return (
            <div style={{ padding: '6px 12px 0' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', margin: '6px 4px 8px' }}>
                Conversations
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.map(conv => {
                  const d = getConvDisplay(conv)
                  const unread = getUnreadCount(conv.id, myId)
                  const muted = isConvMuted(myId, conv.id)
                  return (
                    <button key={conv.id} onClick={() => openConv(conv.id)}
                      className="group transition-all duration-200 hover:bg-white/[0.04]"
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 16, background: unread > 0 ? 'rgba(217,70,239,0.05)' : 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left' }}>
                      {d.isGroup ? <GroupAvatar conv={conv} size={46} /> : <Avatar user={d.user} size={46} showOnline />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14.5, color: d.deleted ? 'rgba(255,255,255,0.4)' : '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</p>
                            {muted && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.dim} strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {unread > 0 && (muted
                              ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.dim }} />
                              : <span style={{ background: '#d946ef', color: '#fff', borderRadius: 10, minWidth: 18, textAlign: 'center', padding: '1px 6px', fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 800 }}>{unread}</span>)}
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: T.dim }}>{formatTime(conv.updatedAt)}</span>
                          </div>
                        </div>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: d.deleted ? 'rgba(255,255,255,0.3)' : (unread > 0 ? 'rgba(255,255,255,0.6)' : T.dim), fontStyle: d.deleted ? 'italic' : 'normal', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.deleted ? 'Compte supprimé' : `${d.isGroup && conv.type === 'group' ? `${d.memberCount} membres · ` : ''}${conv.lastMessage}`}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })()}
        </div>

      {/* ── Appareil photo : choix du destinataire (bottom sheet) ── */}
      {listPhoto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} onClick={() => setListPhoto(null)} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 520, background: 'rgba(8,10,20,0.98)', borderTop: '1px solid rgba(255,255,255,0.1)', borderRadius: '18px 18px 0 0', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 18px 12px' }}>
              <img src={listPhoto.dataUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 16, color: '#fff', margin: 0 }}>Envoyer la photo à…</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>Choisis une conversation</p>
              </div>
              <button onClick={() => setListPhoto(null)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 20 }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '4px 10px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {conversations.length === 0 ? (
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: T.dim, textAlign: 'center', padding: '24px 0' }}>Aucune conversation.</p>
              ) : conversations.map(conv => {
                const d = getConvDisplay(conv)
                return (
                  <button key={conv.id} onClick={async () => { const photo = listPhoto; setListPhoto(null); await sendPhotoTo(conv.id, photo); openConv(conv.id) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left' }}>
                    {d.isGroup ? <GroupAvatar conv={conv} size={42} /> : <Avatar user={d.user} size={42} />}
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
      </div>
    )
  }

  if (view === 'list') {
    if (isDesktop) return renderDesktopSplit(renderChatPlaceholder())
    return (
      <Layout>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {renderListPane()}
        </div>
      </Layout>
    )
  }

  // ── User search / new DM ──
  // ── Vue : messages importants (étoilés) ──
  if (view === 'starred') {
    const items = getStarredMessages(myId).map(k => {
      const idx = k.indexOf(':'); const convId = k.slice(0, idx); const msgId = k.slice(idx + 1)
      const conv = conversations.find(c => c.id === convId) || getConversationById(convId)
      const msg = getMessages(convId).find(m => String(m.id) === String(msgId))
      if (!conv || !msg || msg.deletedForAll) return null
      return { convId, msg, name: getConvDisplay(conv).name }
    }).filter(Boolean).sort((a, b) => new Date(b.msg.timestamp) - new Date(a.msg.timestamp))
    return (
      <Layout>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 16px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 20, padding: 0 }}>←</button>
            <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: '-0.4px', color: '#fff', margin: 0 }}>Messages importants</h2>
          </div>
          {items.length === 0 ? (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: T.dim, textAlign: 'center', padding: '48px 16px', lineHeight: 1.6 }}>Aucun message important.<br />Maintiens un message (ou clic droit) → « Marquer important ».</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(({ convId, msg, name }) => (
                <button key={convId + msg.id} onClick={() => openConv(convId)} className="lib-press"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', textAlign: 'left' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#e0c690" stroke="#e0c690" strokeWidth="1" style={{ flexShrink: 0, marginTop: 2 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: T.dim, flexShrink: 0 }}>{formatMsgTime(msg.timestamp)}</span>
                    </div>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.6)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.type === 'text' ? msg.content : `📎 ${msg.type}`}</p>
                  </div>
                  <span onClick={(e) => { e.stopPropagation(); toggleStarMessage(myId, convId, msg.id); setMessages(getMessages(activeConvId || convId)); setView('list'); setTimeout(() => setView('starred'), 0) }}
                    style={{ flexShrink: 0, color: T.dim, fontSize: 16, padding: 2 }} title="Retirer">✕</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Layout>
    )
  }

  // ── Vue : bloqués & signalés ──
  if (view === 'blocked') {
    const blocked = getBlockedUsers(myId)
    let myReports = []
    try { myReports = JSON.parse(localStorage.getItem('lib_reports') || '[]').filter(r => r.fromId === myId) } catch {}
    return (
      <Layout>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 16px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 20, padding: 0 }}>←</button>
            <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: '-0.4px', color: '#fff', margin: 0 }}>Bloqués & signalés</h2>
          </div>

          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 10px' }}>Comptes bloqués</p>
          {blocked.length === 0 ? (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: T.dim, margin: '0 0 24px' }}>Aucun compte bloqué.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {blocked.map(bid => {
                const u = getUserById(bid) || allUsers.find(x => x.id === bid) || { id: bid, name: bid }
                return (
                  <div key={bid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <Avatar user={u} size={38} />
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                    <button onClick={() => { handleUnblockUser(bid, u.name); setBlockedUsers(getBlockedUsers(myId)) }} className="lib-press"
                      style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 999, background: 'rgba(78,232,200,0.1)', border: '1px solid rgba(78,232,200,0.28)', color: '#4ee8c8', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Débloquer</button>
                  </div>
                )
              })}
            </div>
          )}

          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 10px' }}>Signalements envoyés</p>
          {myReports.length === 0 ? (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: T.dim, margin: 0 }}>Aucun signalement envoyé.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myReports.slice().reverse().map(r => (
                <div key={r.id} style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(224,90,170,0.05)', border: '1px solid rgba(224,90,170,0.18)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13.5, color: '#fff' }}>{r.targetName}</span>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: T.dim, flexShrink: 0 }}>{r.reportedAt ? new Date(r.reportedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''}</span>
                  </div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0', lineHeight: 1.5 }}>{r.reason}</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 10.5, color: r.handled ? '#22c55e' : '#e0a060', margin: '6px 0 0', fontWeight: 600 }}>{r.handled ? '✓ Traité par l\'équipe' : 'En cours de traitement'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Layout>
    )
  }

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
          <p style={{ fontFamily: T.dmMono, fontSize: 11, color: T.dim, textAlign: 'center', padding: '32px 0' }}>Personne ne correspond à "{userSearch}"</p>
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
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 15, color: '#fff', margin: 0 }}>{r.fromName}</p>
                  {r.fromUsername && <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.muted, margin: 0, letterSpacing: '0.05em' }}>@{r.fromUsername}</p>}
                </div>
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

  // ── Panneau Conversation (réutilisé : plein écran mobile / colonne droite desktop) ──
  function renderChatPane() {
    const convDisplay = getConvDisplay(activeConv)
    // Blocage : l'autre participant d'une conv directe est-il bloqué ?
    const directOtherId = activeConv?.type === 'direct' ? activeConv.participants?.find(id => id !== myId) : null
    const otherBlocked = !!(directOtherId && isBlocked(myId, directOtherId))
    const convDeleted = !!convDisplay.deleted
    return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: isDesktop ? '100%' : '100dvh', maxWidth: isDesktop ? 'none' : 520, width: '100%', margin: isDesktop ? 0 : '0 auto', position: 'relative', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(4,4,14,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {!isDesktop && <button onClick={() => { setView('list'); setActiveConvId(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 20, padding: 0, flexShrink: 0 }}>←</button>}
          {convDisplay.isGroup ? <GroupAvatar conv={activeConv} size={38} /> : <Avatar user={convDisplay.user} size={38} showOnline />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600, fontSize: 15, color: convDisplay.deleted ? 'rgba(255,255,255,0.45)' : '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{convDisplay.name}</p>
            <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, color: convDisplay.deleted ? 'rgba(255,255,255,0.3)' : T.dim, margin: '2px 0 0' }}>
              {convDisplay.isGroup
                ? `${convDisplay.memberCount} membres`
                : convDisplay.deleted
                  ? 'Compte supprimé — ce compte n\'existe plus'
                  : isOnline(convDisplay.otherId) ? <span style={{ color: '#22c55e' }}>● En ligne</span> : 'Hors ligne'
              }
            </p>
          </div>
          {chatSubView === 'messages' && (
            <button onClick={() => { setShowMsgSearch(v => !v); setMsgSearch('') }} aria-label="Rechercher" style={{ background: 'none', border: 'none', cursor: 'pointer', color: showMsgSearch ? T.teal : T.dim, padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
          )}
          {chatSubView === 'messages' && (
            <button onClick={() => setChatSubView('settings')} aria-label="Paramètres" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          )}
          {chatSubView === 'settings' && (
            <button onClick={() => setChatSubView('messages')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 16, padding: '4px' }}>✕</button>
          )}
        </div>

        {chatSubView === 'settings' ? (
          // ── Settings panel ──
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {/* Notifications (mute) — vaut pour groupe ET conversation directe */}
            {activeConvId && (() => {
              const convMuted = isConvMuted(myId, activeConvId)
              void muteTick // dépendance pour re-render
              return (
                <button
                  onClick={() => { toggleMuteConv(myId, activeConvId); setMuteTick(t => t + 1); setConversations(getConversations(myId)); showToast(isConvMuted(myId, activeConvId) ? 'Conversation en sourdine' : 'Notifications réactivées') }}
                  style={{ width: '100%', marginBottom: 16, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: convMuted ? 'rgba(200,169,110,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${convMuted ? 'rgba(200,169,110,0.25)' : 'rgba(255,255,255,0.08)'}`, color: convMuted ? T.gold : 'rgba(255,255,255,0.8)', fontFamily: 'Inter, sans-serif', fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {convMuted
                      ? <><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></>
                      : <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}
                  </svg>
                  {convMuted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
                </button>
              )
            })()}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Membres ({activeConv?.members?.length || 0})</p>
                {amAdmin && (
                  <button onClick={() => { setShowAddMember(v => !v); setAddMemberSearch('') }}
                    style={{ background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.25)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', color: T.teal, fontFamily: T.dmMono, fontSize: 9 }}>
                    + Ajouter
                  </button>
                )}
              </div>
              {/* Add member search */}
              {showAddMember && amAdmin && (
                <div style={{ marginBottom: 12, background: 'rgba(78,232,200,0.04)', border: '1px solid rgba(78,232,200,0.15)', borderRadius: 8, padding: '10px' }}>
                  <input style={{ ...INPUT_S, marginBottom: 8, fontSize: 12 }} placeholder="Rechercher un ami…" value={addMemberSearch} onChange={e => setAddMemberSearch(e.target.value)} autoFocus />
                  {(addMemberSearch.trim() ? searchUsers(addMemberSearch).filter(u => u.id !== myId) : friends.map(id => getUserById(id) || allUsers.find(u => u.id === id)).filter(Boolean))
                    .filter(u => u && !activeConv?.members?.some(m => m.userId === u.id))
                    .slice(0, 6)
                    .map(u => (
                      <button key={u.id} onClick={() => handleAddMember(u.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 4px', background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <Avatar user={u} size={28} />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <p style={{ fontFamily: T.cormorant, fontWeight: 400, fontSize: 14, color: '#fff', margin: 0 }}>{u.name}</p>
                          <p style={{ fontFamily: T.dmMono, fontSize: 9, color: T.dim, margin: 0 }}>@{u.username}</p>
                        </div>
                        <span style={{ fontFamily: T.dmMono, fontSize: 9, color: T.teal }}>+ Ajouter</span>
                      </button>
                    ))}
                  {(addMemberSearch.trim() ? searchUsers(addMemberSearch) : friends.map(id => getUserById(id) || allUsers.find(u => u.id === id)).filter(Boolean))
                    .filter(u => u && !activeConv?.members?.some(m => m.userId === u.id)).length === 0 && (
                    <p style={{ fontFamily: T.dmMono, fontSize: 10, color: T.dim, textAlign: 'center', margin: '8px 0 0' }}>Tous tes amis sont déjà dans ce groupe</p>
                  )}
                </div>
              )}
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

                    {/* Numéros — Pro (business) toujours visible s'il existe ; Perso seulement si autorisé */}
                    {contactPhones && (contactPhones.pro || contactPhones.perso) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, width: '100%', maxWidth: 280 }}>
                        {[['Pro', contactPhones.pro, '#c8a96e'], ['Perso', contactPhones.perso, '#4ee8c8']].filter(([, n]) => n).map(([label, number, color]) => (
                          <a key={label} href={`tel:${String(number).replace(/[^\d+]/g, '')}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, textDecoration: 'none', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                              <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>{label}</span>
                              <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#fff' }}>{number}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
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
                        onClick={() => setConfirmDialog({ action: 'block_user', label: `Bloquer ${other.name} ? Tu ne recevras plus ses messages.`, userId: otherId, userName: other.name })}
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

            {/* ── Barre de recherche dans la conversation ── */}
            {showMsgSearch && (() => {
              const q = msgSearch.trim().toLowerCase()
              const matchCount = q ? messages.filter(m => !m.deletedForAll && m.type === 'text' && (m.content || '').toLowerCase().includes(q)).length : 0
              return (
                <div style={{ background: 'rgba(4,4,14,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.dim} strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    autoFocus
                    value={msgSearch}
                    onChange={e => setMsgSearch(e.target.value)}
                    placeholder="Rechercher dans la conversation…"
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13 }}
                  />
                  {q && <span style={{ fontFamily: T.dmMono, fontSize: 10, color: matchCount ? T.teal : T.dim, flexShrink: 0 }}>{matchCount} résultat{matchCount > 1 ? 's' : ''}</span>}
                  <button onClick={() => { setShowMsgSearch(false); setMsgSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 15, padding: 0, flexShrink: 0 }}>✕</button>
                </div>
              )
            })()}

            {/* ── Messages area ── */}
            <div
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 4px', position: 'relative' }}>
              {(() => {
                const q = msgSearch.trim().toLowerCase()
                // Blocage RÉEL : on masque les messages reçus d'un contact bloqué
                // (on garde les nôtres et les messages système).
                const blockedSet = new Set(getBlockedUsers(myId))
                const base = messages.filter(m => m.type === 'system' || m.senderId === myId || !blockedSet.has(m.senderId))
                // En mode recherche active : ne montrer que les messages texte qui matchent
                const shown = (showMsgSearch && q)
                  ? base.filter(m => !m.deletedForAll && m.type === 'text' && (m.content || '').toLowerCase().includes(q))
                  : base
                if (showMsgSearch && q && shown.length === 0) {
                  return <p style={{ fontFamily: T.dmMono, fontSize: 11, color: T.dim, textAlign: 'center', padding: '24px 0' }}>Aucun message trouvé</p>
                }
                return shown.map((msg, idx) => renderMessageBubble(msg, idx))
              })()}

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

            {/* ── @mention autocomplete ── */}
            {mentionMatches.length > 0 && (
              <div style={{ background: 'rgba(8,10,20,0.97)', borderTop: '1px solid rgba(78,232,200,0.15)', maxHeight: 160, overflowY: 'auto' }}>
                {mentionMatches.map(m => (
                  <button key={m.userId} onClick={() => applyMention(m)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(78,232,200,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.dmMono, fontSize: 11, color: T.teal, flexShrink: 0 }}>{(m.name || '?').charAt(0).toUpperCase()}</span>
                    <span style={{ fontFamily: T.dmMono, fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{m.name}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: T.dmMono, fontSize: 9, color: T.teal }}>@</span>
                  </button>
                ))}
              </div>
            )}

            {/* ── Notice de blocage (remplace la barre d'envoi) ── */}
            {otherBlocked && (
              <div style={{ background: 'rgba(220,50,50,0.06)', borderTop: '1px solid rgba(220,50,50,0.18)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,160,160,0.92)', lineHeight: 1.4 }}>Tu as bloqué ce contact — vous ne pouvez plus échanger.</span>
                <button onClick={() => { unblockUser(myId, directOtherId); setBlockedUsers(getBlockedUsers(myId)); sendMessage(activeConvId, 'system', 'Système', 'system', `SYS::${JSON.stringify({ kind: 'unblock', by: myId, byName: myName, target: directOtherId })}`); setMessages(getMessages(activeConvId)); showToast('Débloqué·e') }}
                  className="lib-press" style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 999, background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.3)', color: '#4ee8c8', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Débloquer</button>
              </div>
            )}

            {/* ── Notice compte supprimé (remplace la barre d'envoi) ── */}
            {!otherBlocked && convDeleted && (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', textAlign: 'center' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>Ce compte a été supprimé — tu ne peux plus lui envoyer de message.</span>
              </div>
            )}

            {!otherBlocked && !convDeleted && (<>
            {/* ── Edit bar ── */}
            {editingMsg && (
              <div style={{ background: 'rgba(200,169,110,0.07)', borderTop: '1px solid rgba(200,169,110,0.18)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12 }}>✏️</span>
                <p style={{ flex: 1, fontFamily: T.dmMono, fontSize: 10, color: T.gold, margin: 0 }}>Modifier le message</p>
                <button onClick={handleEditCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, fontSize: 14, padding: 0 }}>✕</button>
              </div>
            )}

            {/* ── Reply preview bar ── */}
            {replyTo && !editingMsg && (
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
                <button onClick={() => setShowAttachMenu(v => !v)} aria-label="Ajouter"
                  style={{ width: 38, height: 38, borderRadius: '50%', background: showAttachMenu ? 'rgba(78,232,200,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showAttachMenu ? 'rgba(78,232,200,0.4)' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={showAttachMenu ? '#4ee8c8' : 'rgba(255,255,255,0.6)'} strokeWidth="2.4" strokeLinecap="round" style={{ transform: showAttachMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.25s cubic-bezier(0.22,0.9,0.3,1)' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                {showAttachMenu && (
                  <div style={{ position: 'absolute', bottom: 48, left: 0, background: 'rgba(10,12,22,0.98)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 214, zIndex: 20, boxShadow: '0 16px 40px -8px rgba(0,0,0,0.7)' }}>
                    {[
                      { label: 'Appareil photo', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>, action: () => { setShowAttachMenu(false); const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; if (!coarse && navigator.mediaDevices?.getUserMedia) setShowCamera(true); else cameraInputRef.current?.click() } },
                      { label: 'Photo', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>, action: () => { photoInputRef.current?.click(); setShowAttachMenu(false) } },
                      { label: 'Sondage', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, action: () => { setShowPollCreator(true); setShowAttachMenu(false) } },
                      { label: 'Partager un événement', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/></svg>, action: () => { setShowEventPicker(true); setShowAttachMenu(false) } },
                    ].map(item => (
                      <button key={item.label} onClick={item.action}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.92)', fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: 600, textAlign: 'left', borderRadius: 11, width: '100%', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <span style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
              </div>

              {/* Text input */}
              <textarea
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Message…"
                rows={1}
                style={{ ...INPUT_S, flex: 1, resize: 'none', maxHeight: 100, lineHeight: 1.5, borderRadius: 22, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'Inter, sans-serif', fontSize: 14, padding: '10px 16px' }}
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
                    style={{ width: 38, height: 38, borderRadius: '50%', background: isRecording ? 'rgba(224,90,170,0.25)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isRecording ? 'rgba(224,90,170,0.5)' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isRecording ? T.pink : 'rgba(255,255,255,0.6)', transition: 'all 0.2s', touchAction: 'none', boxShadow: isRecording ? '0 0 16px rgba(224,90,170,0.4)' : 'none' }}>
                    <MicIcon color={isRecording ? T.pink : 'rgba(255,255,255,0.6)'} size={17} />
                  </button>
                  {isRecording && !tapMode && !voiceLocked && (
                    <span style={{ position: 'absolute', bottom: 38, right: -20, fontFamily: T.dmMono, fontSize: 8, color: T.dim, whiteSpace: 'nowrap', background: 'rgba(4,4,14,0.9)', padding: '2px 5px', borderRadius: 4 }}>↑ verrouiller</span>
                  )}
                  {isRecording && tapMode && !voiceLocked && (
                    <span style={{ position: 'absolute', bottom: 38, right: -20, fontFamily: T.dmMono, fontSize: 8, color: T.pink, whiteSpace: 'nowrap', background: 'rgba(4,4,14,0.9)', padding: '2px 5px', borderRadius: 4 }}>appuie = stop</span>
                  )}
                  {isRecording && <span style={{ position: 'absolute', bottom: -16, fontFamily: T.dmMono, fontSize: 8, color: T.pink }}>{recDuration}s</span>}
                </div>
              )}

              {/* Send button */}
              <button onClick={handleSend} disabled={!inputText.trim()}
                style={{ width: 38, height: 38, borderRadius: '50%', background: inputText.trim() ? 'linear-gradient(135deg, #8b5cf6, #e05aaa)' : 'rgba(255,255,255,0.05)', border: inputText.trim() ? 'none' : '1px solid rgba(255,255,255,0.12)', cursor: inputText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: inputText.trim() ? '#fff' : 'rgba(255,255,255,0.3)', transition: 'all 0.2s', boxShadow: inputText.trim() ? '0 6px 18px -4px rgba(139,92,246,0.6)' : 'none', transform: inputText.trim() ? 'scale(1)' : 'scale(0.96)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </button>
            </div>
            </>)}
          </>
        )}

        {/* ── Capture webcam (desktop) ── */}
        {showCamera && (
          <CameraCapture
            onClose={() => setShowCamera(false)}
            onCapture={(file, dataUrl) => { setShowCamera(false); setPhotoPreview({ dataUrl, file }) }}
            onFallback={() => { setShowCamera(false); showToast('Caméra indisponible — choisis une photo'); cameraInputRef.current?.click() }}
          />
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
                !contextMenu.msg.deletedForAll && contextMenu.msg.senderId === myId && contextMenu.msg.type === 'text' && { label: '✏️ Éditer', fn: () => handleEditStart(contextMenu.msg) },
                !contextMenu.msg.deletedForAll && { label: isMessageStarred(myId, activeConvId, contextMenu.msg.id) ? '★ Retirer des importants' : '☆ Marquer important', fn: () => { toggleStarMessage(myId, activeConvId, contextMenu.msg.id); setMessages(getMessages(activeConvId)) } },
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
                  if (confirmDialog.action === 'block_user') { handleBlockUser(confirmDialog.userId, confirmDialog.userName); setChatSubView('messages') }
                  if (confirmDialog.action === 'clear_history') { deleteConversationHistory(activeConvId); setMessages([]); showToast('Historique effacé') }
                  setConfirmDialog(null)
                }}
                  style={{ flex: 1, padding: '10px', borderRadius: 6, cursor: 'pointer',
                    background: confirmDialog.variant === 'safe' ? 'rgba(78,232,200,0.12)' : 'rgba(220,50,50,0.14)',
                    border: `1px solid ${confirmDialog.variant === 'safe' ? 'rgba(78,232,200,0.40)' : 'rgba(220,50,50,0.40)'}`,
                    color: confirmDialog.variant === 'safe' ? T.teal : 'rgba(220,100,100,0.9)',
                    fontFamily: T.dmMono, fontSize: 10 }}>
                  Valider
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

      {/* ── Photo preview before send ── */}
      {photoPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(0,0,0,0.94)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <img src={photoPreview.dataUrl} alt="preview"
            style={{ maxWidth: '88vw', maxHeight: '65vh', borderRadius: 10, objectFit: 'contain' }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>⏱ EXPIRE DANS 24H — LE DESTINATAIRE PEUT LA TÉLÉCHARGER</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setPhotoPreview(null)}
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
              Annuler
            </button>
            <button onClick={handleSendPhoto}
              style={{ background: 'rgba(78,232,200,0.15)', border: '1px solid rgba(78,232,200,0.4)', borderRadius: 8, padding: '10px 28px', cursor: 'pointer', color: T.teal, fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.05em' }}>
              Envoyer
            </button>
          </div>
        </div>
      )}

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
    </>
    )
  }

  // ── Placeholder colonne droite (desktop, aucune conv sélectionnée) ──
  function renderChatPlaceholder() {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 18, color: '#fff', margin: 0 }}>Tes messages</p>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0, maxWidth: 280, lineHeight: 1.5 }}>Sélectionne une conversation à gauche pour commencer à discuter.</p>
      </div>
    )
  }

  // ── Rendu desktop : split-view façon WhatsApp (liste à gauche + conv à droite) ──
  function renderDesktopSplit(rightNode) {
    return (
      <Layout>
        <div style={{ display: 'flex', height: 'calc(100dvh - 120px)', maxWidth: 1180, margin: '8px auto 0', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(8,10,20,0.4)' }}>
          <aside style={{ width: 360, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {renderListPane()}
          </aside>
          <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {rightNode}
          </section>
        </div>
      </Layout>
    )
  }

  // Desktop : conversation ouverte → split avec la conv à droite.
  if (isDesktop) return renderDesktopSplit(renderChatPane())
  // Mobile : conversation plein écran.
  return (
    <Layout hideNav chatMode>
      {renderChatPane()}
    </Layout>
  )
}

// ─── Event Picker Modal ───────────────────────────────────────────────────────
function EventPickerModal({ onSelectPoll, onSelectBooking, onClose }) {
  const [search, setSearch] = useState('')
  const dmMono = "'DM Mono', monospace"
  const cormorant = "Inter, sans-serif"

  // Load events from all available sources
  const events = useMemo(() => {
    const seen = new Set()
    const result = []
    const add = (id, name, date, price, placeName, image) => {
      if (!id || seen.has(String(id))) return
      seen.add(String(id))
      result.push({ id, name, date, price, placeName: placeName || '', image: image || null })
    }
    try {
      // Billets achetés
      const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      bookings.forEach(b => add(b.eventId, b.eventName, b.eventDate, b.placePrice, b.place, b.eventImage))
    } catch {}
    // Note: user events are stored in lib_created_events (already handled below)
    try {
      // Événements créés — clé lib_created_events (organisateur via MesEvenementsPage)
      const createdEvents = JSON.parse(localStorage.getItem('lib_created_events') || '[]')
      createdEvents.forEach(ev => {
        const firstPlace = ev.places?.[0]
        const price = firstPlace?.price ?? ev.price
        add(ev.id, ev.name || ev.title, ev.date, price, ev.location || ev.place, ev.image || ev.imageUrl)
      })
    } catch {}
    return result
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
          {filtered.length === 0 && (
            <p style={{ fontFamily: dmMono, fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '32px 0', lineHeight: 1.8 }}>
              {events.length === 0 ? "Aucun événement disponible.\nAchète un billet ou crée un événement pour pouvoir le partager ici." : "Aucun événement correspondant."}
            </p>
          )}
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
// Rend un texte en surlignant les @mentions correspondant aux membres du groupe.
function MentionText({ content, members }) {
  const text = content || ''
  const names = (members || []).map(m => m.name).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!names.length || !text.includes('@')) return <>{text}</>
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rx = new RegExp(`@(?:${names.map(esc).join('|')})`, 'g')
  const out = []
  let last = 0, m, k = 0
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<span key={k++} style={{ color: '#4ee8c8', fontWeight: 600 }}>{m[0]}</span>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

function GroupBookingCard({ bookingId, myId, myName, conv, onValidate, onPay, onSong, onNudge, onWithdraw, groupBookings }) {
  // Self-healing cross-device : si la résa n'est pas encore en local (le membre
  // a reçu le message mais pas encore le doc), on la récupère depuis Firestore
  // et on la persiste, pour que la carte s'affiche et que valider/payer marchent.
  const [fetched, setFetched] = useState(null)
  const booking = groupBookings[bookingId] || fetched
  useEffect(() => {
    if (groupBookings[bookingId]) return
    let cancelled = false
    import('../utils/firestore-sync').then(({ loadDoc }) => loadDoc(`group_bookings/${bookingId}`)).then(doc => {
      if (cancelled || !doc) return
      try {
        const all = JSON.parse(localStorage.getItem('lib_group_bookings') || '{}')
        all[bookingId] = doc
        localStorage.setItem('lib_group_bookings', JSON.stringify(all))
      } catch {}
      setFetched(doc)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [bookingId, groupBookings])
  // Tick temps réel pour le compte à rebours (rafraîchit toutes les 30s)
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    if (!booking?.deadline) return
    const id = setInterval(() => setNowTick(Date.now()), 30000)
    return () => clearInterval(id)
  }, [booking?.deadline])
  if (!booking) return <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Chargement de la réservation…</span>

  const withdrawn  = new Set(booking.withdrawnMembers || [])
  const allMembers = conv?.members || []
  const members    = allMembers.filter(m => !withdrawn.has(m.userId)) // membres actifs
  const total      = members.length
  const validations = booking.validations || {}
  const payments    = booking.payments   || {}
  const validCount  = members.filter(m => validations[m.userId]).length
  const payCount    = members.filter(m => payments[m.userId]).length
  const hasValidated = validations[myId]
  const hasPaid      = payments[myId]
  const iAmWithdrawn = withdrawn.has(myId)
  const allValidated = total > 0 && validCount >= total
  const allPaid      = total > 0 && payCount >= total
  // Part = partage ÉGAL entre les membres ACTIFS (hors retirés). Se ré-équilibre
  // automatiquement quand quelqu'un se retire/rejoint, sans dépendre d'un
  // contributionPct figé (qui divergeait entre conv.members et booking.members).
  const myShare      = Math.round((booking.totalPrice / Math.max(total, 1)) * 100) / 100

  // Compte à rebours
  const deadlineTs = booking.deadline ? new Date(booking.deadline).getTime() : null
  const msLeft     = deadlineTs ? deadlineTs - nowTick : null
  const expired    = msLeft != null && msLeft <= 0 && !allPaid
  const countdown  = (() => {
    if (msLeft == null || msLeft <= 0) return null
    const h = Math.floor(msLeft / 3600000)
    const d = Math.floor(h / 24)
    if (d >= 1) return `${d}j ${h % 24}h`
    if (h >= 1) return `${h}h ${Math.floor((msLeft % 3600000) / 60000)}min`
    return `${Math.max(1, Math.floor(msLeft / 60000))}min`
  })()
  const urgent = msLeft != null && msLeft > 0 && msLeft < 12 * 3600000 // < 12h

  // Statut par membre (qui a payé / validé / traîne / retiré) — visibilité
  // critique pour savoir qui bloque le groupe. payé > validé > en attente.
  const memberStatus = (m) => withdrawn.has(m.userId) ? 'withdrawn' : payments[m.userId] ? 'paid' : validations[m.userId] ? 'validated' : 'pending'
  const STATUS_META = {
    paid:      { label: 'Payé',       color: '#22c55e', dot: '#22c55e' },
    validated: { label: 'Validé',     color: '#4ee8c8', dot: '#4ee8c8' },
    pending:   { label: 'En attente', color: 'rgba(255,255,255,0.32)', dot: 'rgba(255,255,255,0.22)' },
    withdrawn: { label: 'Retiré',     color: 'rgba(220,110,110,0.7)', dot: 'rgba(220,110,110,0.5)' },
  }
  // Membres en retard (à relancer) = membres actifs n'ayant pas payé (hors moi)
  const laggards = members.filter(m => m.userId !== myId && memberStatus(m) !== 'paid')

  const F = "'Inter', system-ui, sans-serif"
  const accent = urgent ? '#e05aaa' : '#c8a96e'
  return (
    <div style={{
      width: 300, maxWidth: '100%', borderRadius: 20, overflow: 'hidden',
      background: '#0b0d16',
      border: '1px solid rgba(255,255,255,0.07)',
      boxShadow: '0 22px 55px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02) inset',
    }}>
      {/* ── HERO : affiche + nom en gros ── */}
      <div style={{ position: 'relative', height: 138 }}>
        {booking.eventImage
          ? <img src={booking.eventImage} alt={booking.eventName} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #2a2440 0%, #11202a 55%, #1a1320 100%)' }} />
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0b0d16 4%, rgba(11,13,22,0.35) 50%, rgba(11,13,22,0.55) 100%)' }} />

        {/* Eyebrow */}
        <span style={{ position: 'absolute', top: 11, left: 12, fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(8px)', padding: '4px 9px', borderRadius: 6 }}>
          Sortie de groupe
        </span>
        {/* Countdown */}
        {countdown && !allPaid && (
          <span style={{ position: 'absolute', top: 11, right: 12, fontFamily: F, fontSize: 11, fontWeight: 800, letterSpacing: '0.02em', color: '#0b0d16', background: accent, padding: '4px 10px', borderRadius: 6, boxShadow: `0 4px 14px ${accent}66` }}>
            {countdown}
          </span>
        )}
        {/* Titre */}
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
          <p style={{ fontFamily: F, fontWeight: 800, fontSize: 23, lineHeight: 1.04, letterSpacing: '-0.01em', color: '#fff', margin: 0, textShadow: '0 2px 12px rgba(0,0,0,0.6)', textTransform: 'uppercase' }}>
            {booking.eventName}
          </p>
          <p style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.62)', margin: '4px 0 0' }}>
            {booking.placeName} · {booking.groupMin}–{booking.groupMax > 0 ? booking.groupMax : '∞'} pers.
          </p>
        </div>
      </div>

      {/* ── CORPS ── */}
      <div style={{ padding: '14px 14px 15px' }}>

        {/* Ta part — gros chiffre */}
        {!iAmWithdrawn && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 13 }}>
            <div>
              <p style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', margin: '0 0 1px' }}>Ta part</p>
              <p style={{ fontFamily: F, fontSize: 10, color: 'rgba(255,255,255,0.42)', margin: 0 }}>{total} pers. · {Math.round(100 / Math.max(total, 1))}% chacun</p>
            </div>
            <span style={{ fontFamily: F, fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: '-0.02em', color: hasPaid ? '#22c55e' : '#c8a96e' }}>{myShare}€</span>
          </div>
        )}
        {expired && (
          <div style={{ background: 'rgba(220,50,50,0.10)', border: '1px solid rgba(220,50,50,0.28)', borderRadius: 10, padding: '8px 10px', marginBottom: 12, textAlign: 'center' }}>
            <span style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: 'rgba(230,120,120,0.95)' }}>Délai dépassé — relance ou annule</span>
          </div>
        )}

        {/* Étapes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 13 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontFamily: F, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>1 · Validation</span>
              <span style={{ fontFamily: F, fontSize: 11, fontWeight: 800, color: allValidated ? '#22c55e' : '#c8a96e' }}>{validCount}/{total}</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${total ? validCount / total * 100 : 0}%`, background: allValidated ? '#22c55e' : 'linear-gradient(90deg,#c8a96e,#e0c690)', boxShadow: allValidated ? 'none' : '0 0 10px rgba(200,169,110,0.5)', transition: 'width 0.5s' }} />
            </div>
          </div>
          {allValidated && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontFamily: F, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>2 · Paiements</span>
                <span style={{ fontFamily: F, fontSize: 11, fontWeight: 800, color: allPaid ? '#22c55e' : '#4ee8c8' }}>{payCount}/{total}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${total ? payCount / total * 100 : 0}%`, background: allPaid ? '#22c55e' : 'linear-gradient(90deg,#4ee8c8,#7af0d8)', boxShadow: '0 0 10px rgba(78,232,200,0.5)', transition: 'width 0.5s' }} />
              </div>
            </div>
          )}
        </div>

        {/* Célébration */}
        {allPaid && (
          <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 12, padding: '10px', marginBottom: 13, textAlign: 'center' }}>
            <p style={{ fontFamily: F, fontSize: 12, fontWeight: 800, color: '#22c55e', margin: 0 }}>Groupe complet · tout le monde a payé</p>
          </div>
        )}

        {/* Roster */}
        <div style={{ marginBottom: 13 }}>
          <p style={{ fontFamily: F, fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 8px' }}>Qui est prêt</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {allMembers.map(m => {
              const st = memberStatus(m)
              const meta = STATUS_META[st]
              const isOut = st === 'withdrawn'
              const initial = (m.name || m.userId || '?').charAt(0).toUpperCase()
              return (
                <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 9, opacity: isOut ? 0.45 : 1 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{initial}</div>
                    <div style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: '50%', background: meta.dot, border: '2px solid #0b0d16' }} />
                  </div>
                  <span style={{ flex: 1, fontFamily: F, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isOut ? 'line-through' : 'none' }}>
                    {m.userId === myId ? 'Toi' : (m.name || 'Membre')}
                  </span>
                  <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, color: meta.color, flexShrink: 0 }}>{meta.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* CTA principal */}
        {!hasValidated && (
          <button onClick={() => onValidate(bookingId)}
            style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', border: 'none',
              background: iAmWithdrawn ? 'linear-gradient(135deg,#4ee8c8,#39c9ab)' : 'linear-gradient(135deg,#d8b878,#c8a96e)',
              color: '#0b0d16', fontFamily: F, fontSize: 12, fontWeight: 800, letterSpacing: '0.02em', marginBottom: 8,
              boxShadow: iAmWithdrawn ? '0 8px 22px rgba(78,232,200,0.28)' : '0 8px 22px rgba(200,169,110,0.28)' }}>
            {iAmWithdrawn ? 'Rejoindre le groupe' : 'Je valide la sortie'}
          </button>
        )}
        {hasValidated && !hasPaid && allValidated && (
          <button onClick={() => onPay(bookingId)}
            style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', border: 'none',
              background: 'linear-gradient(135deg,#4ee8c8,#39c9ab)', color: '#0b0d16',
              fontFamily: F, fontSize: 12, fontWeight: 800, letterSpacing: '0.02em', marginBottom: 8,
              boxShadow: '0 8px 22px rgba(78,232,200,0.30)' }}>
            Payer ma part · {myShare}€
          </button>
        )}
        {hasValidated && !hasPaid && !allValidated && (
          <div style={{ padding: '11px', background: 'rgba(200,169,110,0.07)', border: '1px solid rgba(200,169,110,0.18)', borderRadius: 12, marginBottom: 8 }}>
            <p style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: 'rgba(200,169,110,0.85)', margin: 0, textAlign: 'center' }}>
              En attente des validations · {validCount}/{total}
            </p>
          </div>
        )}
        {hasPaid && !allPaid && (
          <div style={{ padding: '11px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 12, marginBottom: 8 }}>
            <p style={{ fontFamily: F, fontSize: 11, fontWeight: 700, color: '#22c55e', margin: 0, textAlign: 'center' }}>Tu as payé ta part · {myShare}€</p>
          </div>
        )}

        {/* Actions secondaires */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(hasValidated || hasPaid) && (
            <button onClick={() => onSong(bookingId)}
              style={{ width: '100%', padding: '10px', borderRadius: 10, cursor: 'pointer', background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.28)', color: '#e05aaa', fontFamily: F, fontSize: 11, fontWeight: 600 }}>
              {booking.songSelections?.[myId] ? `♪ ${booking.songSelections[myId].title} — ${booking.songSelections[myId].artist}` : '♪ Choisir ma musique'}
            </button>
          )}
          {!allPaid && laggards.length > 0 && (hasValidated || hasPaid) && onNudge && (
            <button onClick={() => onNudge(laggards.map(m => m.name || 'membre').join(', '))}
              style={{ width: '100%', padding: '9px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)', fontFamily: F, fontSize: 11, fontWeight: 600 }}>
              Relancer les retardataires ({laggards.length})
            </button>
          )}
          {!hasPaid && !iAmWithdrawn && total > 1 && onWithdraw && (
            <button onClick={() => onWithdraw(bookingId)}
              style={{ width: '100%', padding: '8px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.32)', fontFamily: F, fontSize: 10, fontWeight: 600 }}>
              Me retirer du groupe
            </button>
          )}
          {iAmWithdrawn && (
            <p style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: 'rgba(230,120,120,0.75)', margin: '2px 0 0', textAlign: 'center' }}>Tu t'es retiré de cette sortie</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Capture webcam (desktop) ─────────────────────────────────────────────────
// Ouvre un flux caméra via getUserMedia et permet de capturer une photo. Sur
// ordinateur, l'input file `capture` était ignoré et ouvrait l'explorateur de
// fichiers — ici on obtient une vraie prise de vue. En cas d'échec (pas de
// caméra / permission refusée), on retombe sur le sélecteur de fichiers.
function CameraCapture({ onClose, onCapture, onFallback }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}) }
        setReady(true)
      })
      .catch(() => { if (!cancelled) onFallback?.() })
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function snap() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    canvas.toBlob(blob => {
      const file = new File([blob || new Blob()], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
      onCapture?.(file, dataUrl)
    }, 'image/jpeg', 0.9)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 17, color: '#fff' }}>Prendre une photo</span>
          <button onClick={onClose} aria-label="Fermer" style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 4', borderRadius: 18, overflow: 'hidden', background: '#0b0d14', border: '1px solid rgba(255,255,255,0.12)' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          {!ready && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Activation de la caméra…</div>}
        </div>
        <button onClick={snap} disabled={!ready} className="lib-press"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 14, borderRadius: 14, background: ready ? 'linear-gradient(135deg,#8b5cf6,#e05aaa)' : 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 15, cursor: ready ? 'pointer' : 'default' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Capturer
        </button>
      </div>
    </div>
  )
}
