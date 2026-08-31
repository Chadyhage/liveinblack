'use client'

import NextImage from 'next/image'
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { ArrowDown, Check, CheckCheck, CornerUpRight, Hourglass, Pause, Play, Star } from 'lucide-react'
import { Button, ImmersiveDialog } from '@/app/components/ui'
import ThreadHeader from './ThreadHeader'
import { avatarColorFor, conversationLabel, formatTime } from './messagingUtils'
import type { ConversationMember, ConversationView, MessageType, MessageView, PresenceMap } from './types'

export function messageTypeLabel(type: MessageType): string {
  if (type === 'image') return 'Photo'
  if (type === 'voice') return 'Message vocal'
  if (type === 'poll' || type === 'event_poll') return 'Sondage'
  if (type === 'story') return 'Article'
  if (type === 'event') return 'Événement'
  if (type === 'catalog_item') return 'Offre prestataire'
  return ''
}

function systemMessageLabel(content: string | null, currentUserId: string): string {
  if (!content || !content.startsWith('SYS::')) return content || ''
  try {
    const data = JSON.parse(content.slice(5)) as { kind: 'block' | 'unblock'; by: string; byName: string; target: string; targetName: string }
    const iActed = data.by === currentUserId
    if (data.kind === 'block') return iActed ? `Tu as bloqué ${data.targetName}.` : `${data.byName} t'a bloqué.`
    return iActed ? `Tu as débloqué ${data.targetName}.` : `${data.byName} t'a débloqué.`
  } catch {
    return content
  }
}

export function Avatar({
  userId,
  name,
  size = 38,
  src,
  online,
  showOnline,
}: {
  userId: string
  name: string
  size?: number
  src?: string | null
  online?: boolean
  showOnline?: boolean
}) {
  const resolvedSrc = src || placeholderPhotoUrl(`message-avatar-${userId || name}`, size * 2, size * 2)
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: avatarColorFor(userId),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#04040b',
          fontWeight: 700,
          fontSize: size <= 32 ? 10 : 13,
        }}
      >
        <NextImage src={resolvedSrc} alt={name} width={size} height={size} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
      </div>
      {showOnline ? (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: online ? '#F53D8D' : 'rgba(255,255,255,0.2)',
            border: '2px solid var(--obsidian)',
          }}
        />
      ) : null}
    </div>
  )
}

export function GroupAvatar({ conv, size = 38 }: { conv: { avatar: string | null; name: string | null }; size?: number }) {
  if (conv.avatar) {
    return <NextImage src={conv.avatar} alt={conv.name ?? 'Groupe'} width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--primary-a14)',
        border: '1px solid var(--primary-a32)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="var(--gold)">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    </div>
  )
}

export function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-faint)', animation: `lib-bounce 1.2s ${i * 0.2}s infinite` }} />
      ))}
    </div>
  )
}

export function ThreadHeaderSection({
  conversation,
  currentUserId,
  presence,
  isDesktop,
  onBack,
  onOpenSearch,
  onOpenGroupSettings,
  onOpenContactPanel,
}: {
  conversation: ConversationView
  currentUserId: string
  presence: PresenceMap
  isDesktop: boolean
  onBack: () => void
  onOpenSearch: () => void
  onOpenGroupSettings: () => void
  onOpenContactPanel: () => void
}) {
  const label = conversationLabel(conversation, currentUserId)
  const other = conversation.type === 'direct' ? conversation.members.find((member) => member.userId !== currentUserId) : null
  const otherOnline = other ? presence[other.userId]?.online : false

  return (
    <ThreadHeader
      label={label}
      subtitle={conversation.type === 'group' ? `${conversation.members.length} membres` : otherOnline ? 'En ligne' : 'Hors ligne'}
      isDesktop={isDesktop}
      onBack={onBack}
      onPrimaryClick={conversation.type === 'group' ? onOpenGroupSettings : onOpenContactPanel}
      onOpenSearch={onOpenSearch}
      avatar={conversation.type === 'group' ? <GroupAvatar conv={conversation} size={36} /> : <Avatar userId={other?.userId ?? ''} name={label} size={36} src={other?.avatarUrl} />}
    />
  )
}

export function MessageRow({
  message,
  isMine,
  currentUserId,
  showAvatar,
  showSenderName,
  members,
  highlighted,
  onlineForAvatar,
  replyPreview,
  onReplyClick,
  onOpenContextMenu,
  onReact,
  onOpenFullPicker,
  onVote,
  onReply,
}: {
  message: MessageView
  isMine: boolean
  currentUserId: string
  showAvatar: boolean
  showSenderName: boolean
  members: ConversationMember[]
  highlighted: boolean
  onlineForAvatar?: boolean
  replyPreview: MessageView | null
  onReplyClick: (id: string) => void
  onOpenContextMenu: (x: number, y: number) => void
  onReact: (messageId: string, emoji: string) => void
  onOpenFullPicker: () => void
  onVote: (messageId: string, optionId: string) => void
  onReply: (message: MessageView) => void
}) {
  const touchStartX = useRef(0)
  const [swipeX, setSwipeX] = useState(0)

  if (message.type === 'system') {
    return (
      <div style={{ textAlign: 'center', padding: '4px 0' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 20, padding: '4px 12px' }}>
          {systemMessageLabel(message.content, currentUserId)}
        </span>
      </div>
    )
  }

  const reactionEntries = Object.entries(message.reactions).filter(([, users]) => users.length > 0)

  function onTouchStart(event: TouchEvent) {
    touchStartX.current = event.touches[0].clientX
  }

  function onTouchMove(event: TouchEvent) {
    const dx = event.touches[0].clientX - touchStartX.current
    if (dx > 0) setSwipeX(Math.min(dx, 70))
  }

  function onTouchEnd() {
    if (swipeX >= 60) onReply(message)
    setSwipeX(0)
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, marginBottom: 6, touchAction: 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div style={{ width: 26, flexShrink: 0 }}>{showAvatar ? <Avatar userId={message.senderId} name={message.senderName} size={26} src={members.find((member) => member.userId === message.senderId)?.avatarUrl} online={onlineForAvatar} showOnline /> : null}</div>
      <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2, transform: `translateX(${swipeX}px)` }}>
        {showSenderName ? <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', paddingLeft: 4 }}>{message.senderName}</span> : null}
        {message.forwardedFrom ? (
          <span style={{ fontSize: 10.5, color: 'var(--text-faint)', paddingLeft: isMine ? 0 : 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <CornerUpRight size={11} /> Transféré de {message.forwardedFrom.senderName}
          </span>
        ) : null}
        {replyPreview ? (
          <div
            onClick={() => onReplyClick(replyPreview.id)}
            style={{
              background: 'var(--surface)',
              borderRadius: 8,
              padding: '5px 9px',
              borderLeft: '3px solid var(--violet)',
              maxWidth: 220,
              cursor: 'pointer',
            }}
          >
            <p style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>{replyPreview.senderName}</p>
            <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyPreview.deletedForAll ? 'Message supprimé' : replyPreview.content || messageTypeLabel(replyPreview.type)}
            </p>
          </div>
        ) : null}
        <div
          onContextMenu={(event) => {
            event.preventDefault()
            onOpenContextMenu(event.clientX, event.clientY)
          }}
          style={{
            padding: message.deletedForAll ? '8px 14px' : ['image', 'poll', 'event_poll', 'story', 'event', 'catalog_item'].includes(message.type) ? 6 : '9px 14px',
            borderRadius: isMine ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
            background: isMine ? 'var(--primary-a16)' : 'var(--surface)',
            border: `1px solid ${isMine ? 'var(--primary-a32)' : 'var(--border)'}`,
            maxWidth: '100%',
            cursor: 'context-menu',
            boxShadow: highlighted ? '0 0 0 2px rgba(255,255,255,0.85)' : 'none',
            transition: 'box-shadow 0.3s',
          }}
        >
          <MessageContent message={message} members={members} onVote={onVote} currentUserId={currentUserId} />
        </div>

        {reactionEntries.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
            {reactionEntries.map(([emoji, users]) => {
              const reactedByMe = users.includes(currentUserId)
              return (
                <Button
                  key={emoji}
                  variant="secondary"
                  onClick={() => onReact(message.id, emoji)}
                  style={{
                    background: reactedByMe ? 'var(--primary-a14)' : 'var(--surface-2)',
                    border: `1px solid ${reactedByMe ? 'var(--primary-a32)' : 'var(--border)'}`,
                    borderRadius: 10,
                    padding: '2px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 11,
                    fontWeight: 400,
                    color: reactedByMe ? 'var(--teal)' : 'var(--text)',
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontSize: 9, color: reactedByMe ? 'var(--teal)' : 'var(--text-faint)' }}>{users.length}</span>
                </Button>
              )
            })}
            <Button variant="ghost" onClick={onOpenFullPicker} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '2px 6px', color: 'var(--text-faint)', fontSize: 11 }}>
              +
            </Button>
          </div>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {message.starredByMe ? <span style={{ fontSize: 10, color: 'var(--gold)', display: 'inline-flex', alignItems: 'center' }}><Star size={10} /></span> : null}
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{formatTime(message.createdAt)}</span>
          {isMine && message.readStatus ? (
            <span style={{ fontSize: 9, color: message.readStatus === 'read' ? 'var(--teal)' : 'var(--text-faint)', display: 'inline-flex', alignItems: 'center' }}>
              {message.readStatus === 'read' ? <CheckCheck size={12} /> : <Check size={12} />}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function MessageContent({
  message,
  members,
  onVote,
  currentUserId,
}: {
  message: MessageView
  members: ConversationMember[]
  onVote: (messageId: string, optionId: string) => void
  currentUserId: string
}) {
  if (message.deletedForAll) return <span style={{ fontSize: 12.5, color: 'var(--text-faint)', fontStyle: 'italic' }}>Message supprimé</span>

  if (message.type === 'text') {
    return (
      <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
        <MentionText content={message.content ?? ''} members={members} />
        {message.editedAt ? <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 5, fontStyle: 'italic' }}>(modifié)</span> : null}
      </p>
    )
  }
  if (message.type === 'image') return <ImageBubble content={message.content} createdAt={message.createdAt} />
  if (message.type === 'voice') return <VoiceBubble content={message.content} />
  if (message.type === 'poll' || message.type === 'event_poll') return <PollCard message={message} onVote={onVote} currentUserId={currentUserId} />
  if (message.type === 'story') return <StoryCard content={message.content} />
  if (message.type === 'event') return <EventCard content={message.content} />
  if (message.type === 'catalog_item') return <CatalogItemCard content={message.content} />
  return <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{message.content}</span>
}

function MentionText({ content, members }: { content: string; members: ConversationMember[] }) {
  if (members.length === 0 || !content.includes('@')) return <>{content}</>
  const names = members.map((member) => member.name).filter(Boolean)
  if (names.length === 0) return <>{content}</>
  const pattern = new RegExp(`(@(?:${names.map((name) => name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|')}))`, 'g')
  const parts = content.split(pattern)

  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('@') && names.includes(part.slice(1)) ? (
          <span key={index} style={{ color: 'var(--teal)', fontWeight: 700 }}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}

function usePhotoExpiry(createdAt: string): { isExpired: boolean; hoursLeft: number } {
  const [state, setState] = useState(() => ({ isExpired: false, hoursLeft: 24 }))

  useEffect(() => {
    function compute() {
      const expiresAt = new Date(createdAt).getTime() + 24 * 3600 * 1000
      const now = Date.now()
      setState({ isExpired: now > expiresAt, hoursLeft: Math.ceil((expiresAt - now) / 3600000) })
    }

    compute()
    const id = setInterval(compute, 60_000)
    return () => clearInterval(id)
  }, [createdAt])

  return state
}

function ImageBubble({ content, createdAt }: { content: string | null; createdAt: string }) {
  const [zoomed, setZoomed] = useState(false)
  const { isExpired, hoursLeft } = usePhotoExpiry(createdAt)

  if (!content) return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Photo</span>

  if (isExpired) {
    return (
      <div style={{ width: 180, height: 90, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <span style={{ fontSize: 18, display: 'inline-flex', alignItems: 'center' }}><Hourglass size={18} /></span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Photo expirée</span>
      </div>
    )
  }

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={content} alt="Photo" onClick={() => setZoomed(true)} style={{ maxWidth: 220, maxHeight: 220, borderRadius: 10, display: 'block', cursor: 'zoom-in' }} />
        {hoursLeft <= 23 ? (
          <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 600, color: '#fff' }}>
            {hoursLeft} h
          </span>
        ) : null}
        <a
          href={content}
          download="photo.jpg"
          onClick={(event) => event.stopPropagation()}
          style={{ position: 'absolute', bottom: 5, right: 5, background: 'rgba(0,0,0,0.55)', borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textDecoration: 'none' }}
        >
          <ArrowDown size={14} />
        </a>
      </div>
      {zoomed ? (
        <ImmersiveDialog title="Aperçu de la photo" onClose={() => setZoomed(false)} zIndex={600} media>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={content} alt="Photo en plein écran" style={{ maxWidth: '100%', maxHeight: 'calc(100dvh - 40px)', objectFit: 'contain', borderRadius: 12 }} />
        </ImmersiveDialog>
      ) : null}
    </>
  )
}

const VOICE_BARS = 26

function VoiceBubble({ content }: { content: string | null }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bars, setBars] = useState<number[] | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!content) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(content)
        const buf = await res.arrayBuffer()
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new AudioCtx()
        const audioBuffer = await ctx.decodeAudioData(buf)
        ctx.close()
        if (cancelled) return
        const data = audioBuffer.getChannelData(0)
        const blockSize = Math.floor(data.length / VOICE_BARS) || 1
        const peaks = Array.from({ length: VOICE_BARS }, (_, index) => {
          let max = 0
          for (let offset = 0; offset < blockSize; offset++) max = Math.max(max, Math.abs(data[index * blockSize + offset] || 0))
          return max
        })
        const maxPeak = Math.max(...peaks, 0.01)
        setBars(peaks.map((peak) => Math.max(0.15, peak / maxPeak)))
        setDuration(Math.round(audioBuffer.duration))
      } catch {
        if (!cancelled) {
          setBars(Array.from({ length: VOICE_BARS }, (_, index) => 0.2 + ((content.charCodeAt(index % content.length) + index * 17) % 80) / 100))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [content])

  function handlePlay() {
    if (!content) return
    if (!audioRef.current) {
      const audio = new Audio(content)
      audio.ontimeupdate = () => setProgress(audio.currentTime / (audio.duration || 1))
      audio.onended = () => {
        setPlaying(false)
        setProgress(0)
      }
      audioRef.current = audio
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  if (!content) return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Message vocal</span>

  const activeBars = bars ?? Array.from({ length: VOICE_BARS }, () => 0.3)
  const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190, maxWidth: 240 }}>
      <Button variant="ghost" onClick={handlePlay} style={{ width: 44, height: 44, minHeight: 44, minWidth: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', padding: 0, flexShrink: 0, color: '#fff' }}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </Button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 24 }}>
        {activeBars.map((height, index) => (
          <div
            key={index}
            style={{
              width: 2.5,
              height: `${height * 100}%`,
              borderRadius: 2,
              background: progress > 0 && index / activeBars.length <= progress ? '#fff' : 'rgba(255,255,255,0.3)',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', minWidth: 26, textAlign: 'right', flexShrink: 0 }}>{duration > 0 ? fmt(duration) : ''}</span>
    </div>
  )
}

function PollCard({ message, onVote, currentUserId }: { message: MessageView; onVote: (messageId: string, optionId: string) => void; currentUserId: string }) {
  const poll = message.poll
  if (!poll) return <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sondage indisponible.</span>

  const totalVotes = poll.options.reduce((sum, option) => sum + option.voterIds.length, 0)

  return (
    <div style={{ minWidth: 220, maxWidth: 280 }}>
      {poll.event ? <p style={{ fontSize: 11, color: 'var(--gold)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{poll.event.name}</p> : null}
      <p style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>{poll.question}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {poll.options.map((option) => {
          const pct = totalVotes ? Math.round((option.voterIds.length / totalVotes) * 100) : 0
          const votedByMe = option.voterIds.includes(currentUserId)
          return (
            <Button
              key={option.id}
              variant="secondary"
              onClick={() => onVote(message.id, option.id)}
              aria-label={`Voter pour ${option.text}`}
              aria-pressed={votedByMe}
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 6,
                padding: '8px 10px',
                borderRadius: 8,
                border: votedByMe ? '1px solid var(--teal)' : '1px solid var(--border-strong)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text)',
                fontSize: 12.5,
                fontWeight: 400,
                textAlign: 'left',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'var(--primary-a20)' }} />
              <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
                {votedByMe ? <span style={{ color: 'var(--teal)', display: 'inline-flex', alignItems: 'center' }}><Check size={12} /></span> : null}
                {option.text}
              </span>
              <span style={{ position: 'relative', color: 'var(--teal)', fontWeight: 700 }}>{option.voterIds.length}</span>
            </Button>
          )
        })}
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '6px 0 0' }}>
        {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

function StoryCard({ content }: { content: string | null }) {
  let story: { title?: string; text?: string; imageUrl?: string } = {}
  try {
    story = content ? JSON.parse(content) : {}
  } catch {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Article</span>
  }

  return (
    <div style={{ minWidth: 200, maxWidth: 260 }}>
      {story.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={story.imageUrl} alt={story.title} style={{ width: '100%', borderRadius: 6, maxHeight: 130, objectFit: 'cover', marginBottom: 8 }} />
      ) : null}
      <p style={{ fontSize: 15, color: 'var(--text)', margin: '0 0 4px', fontWeight: 500 }}>{story.title}</p>
      {story.text ? <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{story.text}</p> : null}
    </div>
  )
}

function EventCard({ content }: { content: string | null }) {
  let event: { id?: string; name?: string; date?: string; price?: number; image?: string } = {}
  try {
    event = content ? JSON.parse(content) : {}
  } catch {
    return <span style={{ fontSize: 12, color: 'var(--gold)' }}>Événement</span>
  }

  const clickable = Boolean(event.id)
  const priceLabel = event.price == null ? null : Number(event.price) <= 0 ? 'Gratuit' : `dès ${event.price}€`

  return (
    <a
      href={clickable ? `/events/${event.id}` : undefined}
      style={{ display: 'block', width: 240, borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)', textDecoration: 'none', cursor: clickable ? 'pointer' : 'default' }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
        {event.id ? (
          <NextImage src={event.image || placeholderPhotoUrl(event.id, 480, 270)} alt={event.name ?? ''} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 240px" />
        ) : event.image ? (
          <NextImage src={event.image} alt={event.name ?? ''} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 240px" />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.06)' }} />
        )}
        {priceLabel ? (
          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 700, color: 'var(--gold)', background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: 6 }}>
            {priceLabel}
          </span>
        ) : null}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 3px', fontWeight: 600 }}>{event.name || 'Événement'}</p>
        <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: 0, textTransform: 'uppercase' }}>{event.date || ''}</p>
      </div>
    </a>
  )
}

function CatalogItemCard({ content }: { content: string | null }) {
  let item: { providerId?: string; name?: string; category?: string; image?: string } = {}
  try {
    item = content ? JSON.parse(content) : {}
  } catch {
    return <span style={{ fontSize: 11, color: 'var(--gold)' }}>Offre prestataire</span>
  }

  const clickable = Boolean(item.providerId)

  return (
    <a
      href={clickable ? `/providers/${encodeURIComponent(item.providerId!)}` : undefined}
      style={{ display: 'block', width: 240, borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)', textDecoration: 'none', cursor: clickable ? 'pointer' : 'default' }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
        {item.providerId ? (
          <NextImage src={item.image || placeholderPhotoUrl(item.providerId, 480, 270)} alt={item.name ?? ''} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 240px" />
        ) : item.image ? (
          <NextImage src={item.image} alt={item.name ?? ''} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 240px" />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.06)' }} />
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 3px', fontWeight: 600 }}>{item.name || 'Offre'}</p>
        {item.category ? <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: 0, textTransform: 'uppercase' }}>{item.category}</p> : null}
      </div>
    </a>
  )
}
