'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

// ─────────────────────────── types (miroir des DTO JSON) ────────────────────
// Copies volontaires des formes renvoyées par les routes HTTP (pas des
// imports directs de lib/server/*, qui restent un détail serveur) — même
// convention que CommanderClient.tsx / ScannerClient.tsx (phase 4).

interface ConversationMember {
  userId: string
  name: string
  role: 'admin' | 'member'
  muteUntilAt?: string | null
}

interface ConversationView {
  id: string
  type: 'direct' | 'group'
  participantIds: string[]
  members: ConversationMember[]
  name: string | null
  avatar: string | null
  mutedUserIds: string[]
  lastMessage: string
  lastMessageAt: string | null
  lastSenderId: string | null
  pinnedMessageId: string | null
  createdAt: string
  unreadCount: number
  pinned: boolean
  mutedForMe: boolean
  myGroupMute: { untilAt: string | null } | null
}

interface PollOption {
  id: string
  text: string
  voterIds: string[]
}

interface MessagePoll {
  pollType: 'poll' | 'event_poll'
  question: string
  options: PollOption[]
  event: { id: string; name: string; date: string; price: number; currency: string; image: string | null } | null
}

type MessageType = 'text' | 'image' | 'voice' | 'poll' | 'event_poll' | 'story' | 'event' | 'catalog_item' | 'system'

interface MessageView {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  type: MessageType
  content: string | null
  poll: MessagePoll | null
  reactions: Record<string, string[]>
  readBy: Record<string, string>
  deletedForAll: boolean
  pinned: boolean
  replyToMessageId: string | null
  createdAt: string
  editedAt: string | null
  starredByMe: boolean
  forwardedFrom: { senderName: string; convName: string } | null
  readStatus: 'sent' | 'read' | null
}

interface FriendRequestView {
  id: string
  fromId: string
  fromName: string
  toId: string
  status: string
  createdAt: string
  respondedAt: string | null
}

interface SentFriendRequestView extends FriendRequestView {
  toName: string
}

interface FriendView {
  userId: string
  name: string
  email: string
}

interface BlockedUserView {
  userId: string
  name: string
  email: string
}

interface MyReportView {
  id: string
  targetId: string
  targetName: string
  reason: string
  createdAt: string
}

interface TypingUserView {
  userId: string
  name: string
}

type PresenceMap = Record<string, { online: boolean; lastSeenAt: string | null }>

export interface MessagesClientProps {
  currentUserId: string
  initialConversations: ConversationView[]
  initialReceived: FriendRequestView[]
  initialSent: SentFriendRequestView[]
  initialFriends: FriendView[]
  initialBlocked: BlockedUserView[]
  initialReports: MyReportView[]
  initialStarred: MessageView[]
}

// ─────────────────────────────────── constantes ──────────────────────────────

const EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥', '🎉', '💀', '🤣', '😍', '😭', '🙏', '💯', '✅']
const QUICK_REACT = EMOJIS.slice(0, 8)

const GROUP_MUTE_DURATIONS: { id: string; label: string; ms: number | null }[] = [
  { id: '15m', label: '15 min', ms: 15 * 60 * 1000 },
  { id: '1h', label: '1 heure', ms: 60 * 60 * 1000 },
  { id: '8h', label: '8 heures', ms: 8 * 60 * 60 * 1000 },
  { id: '24h', label: '24 heures', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 jours', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: 'forever', label: "Jusqu'à réactivation", ms: null },
]

const AVATAR_COLORS = ['#c8a96e', '#8b5cf6', '#e05aaa', '#3b82f6', '#4ee8c8', '#f59e0b']

const ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi.',
  user_not_found: 'Aucun compte trouvé avec cet email.',
  cannot_message_self: 'Tu ne peux pas te contacter toi-même.',
  cannot_block_self: 'Tu ne peux pas te bloquer toi-même.',
  cannot_report_self: 'Tu ne peux pas te signaler toi-même.',
  cannot_friend_self: 'Tu ne peux pas être ton propre ami.',
  blocked: 'Impossible — un blocage existe entre vos deux comptes.',
  empty_message: 'Le message est vide.',
  message_too_long: 'Message trop long.',
  muted: 'Tu es en sourdine dans ce groupe.',
  conversation_not_found: 'Conversation introuvable.',
  message_not_found: 'Message introuvable.',
  group_name_required: 'Le nom du groupe est requis.',
  not_enough_members: 'Ajoute au moins un autre membre.',
  admin_only: "Réservé à l'administrateur du groupe.",
  not_a_member: "Cette personne n'est pas membre du groupe.",
  already_a_member: 'Cette personne est déjà membre du groupe.',
  too_many_members: 'Le groupe a atteint sa taille maximale.',
  cannot_remove_self: 'Utilise "Quitter le groupe" pour te retirer toi-même.',
  only_admin: "Nomme un autre administrateur avant de te retirer ce rôle.",
  target_is_admin: 'Impossible de mettre en sourdine un autre administrateur.',
  not_message_owner: "Tu ne peux modifier ou supprimer que tes propres messages.",
  invalid_type: 'Action impossible sur ce type de message.',
  message_deleted: 'Ce message a été supprimé.',
  forward_failed: "Le transfert n'a abouti dans aucune conversation.",
  already_friends: 'Vous êtes déjà amis.',
  request_already_pending: 'Une demande est déjà en attente.',
  request_not_pending: 'Cette demande a déjà été traitée.',
  request_not_found: 'Demande introuvable.',
  not_friends: "Vous n'êtes pas amis.",
  invalid_options: 'Options de sondage invalides (2 à 6, non vides, sans doublon).',
  question_required: 'La question du sondage est requise.',
  reason_required: 'Un motif est requis.',
  file_too_large: 'Fichier trop volumineux.',
  upload_failed: "L'envoi du fichier a échoué.",
}

function errorMessageFor(code: string | undefined): string {
  if (!code) return 'Une erreur est survenue.'
  return ERROR_MESSAGES[code] ?? 'Une erreur est survenue.'
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) return { ok: false, error: data?.error ?? 'unknown_error' }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const NEW_FRIEND_IDS_STORAGE_KEY = 'liveinblack:newFriendIds'

function persistNewFriendIds(ids: Set<string>): void {
  try {
    window.localStorage.setItem(NEW_FRIEND_IDS_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // localStorage indisponible — le badge "Nouveau" ne survivra pas à un
    // rechargement dans ce cas, dégradation silencieuse acceptable.
  }
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(iso, now.toISOString())) return "Aujourd'hui"
  if (isSameDay(iso, yesterday.toISOString())) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function avatarColorFor(userId: string): string {
  if (!userId) return AVATAR_COLORS[0]
  const code = userId.charCodeAt(userId.length - 1) || 0
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

function conversationLabel(conv: ConversationView, currentUserId: string): string {
  if (conv.type === 'group') return conv.name || 'Groupe'
  const other = conv.members.find((m) => m.userId !== currentUserId)
  return other?.name || 'Conversation'
}

function formatMuteUntil(untilAt: string | null): string {
  if (!untilAt) return "jusqu'à réactivation"
  return `jusqu'au ${new Date(untilAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function compressImage(dataUrl: string, maxSize = 1000, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const r = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * r)
        height = Math.round(height * r)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(dataUrl)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

const DESKTOP_QUERY = '(min-width: 768px)'
function subscribeToDesktopQuery(callback: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}
function getDesktopSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches
}
function getDesktopServerSnapshot(): boolean {
  return false
}

let toastSeq = 0

// ═══════════════════════════════ Composant principal ═════════════════════════

export default function MessagesClient({
  currentUserId,
  initialConversations,
  initialReceived,
  initialSent,
  initialFriends,
  initialBlocked,
  initialReports,
  initialStarred,
}: MessagesClientProps) {
  const [conversations, setConversations] = useState<ConversationView[]>(initialConversations)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageView[]>([])
  const [composerText, setComposerText] = useState('')
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([])
  const [received, setReceived] = useState(initialReceived)
  const [sent, setSent] = useState(initialSent)
  const [friends, setFriends] = useState(initialFriends)
  const [newFriendIds, setNewFriendIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.localStorage.getItem(NEW_FRIEND_IDS_STORAGE_KEY)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })
  const friendIdsBaselineRef = useRef<Set<string> | null>(null)
  const [blocked, setBlocked] = useState(initialBlocked)
  const [reports, setReports] = useState(initialReports)
  const [starred, setStarred] = useState(initialStarred)
  const [pollDraft, setPollDraft] = useState<{ question: string; options: string[] } | null>(null)
  const [showEventPicker, setShowEventPicker] = useState(false)

  type Panel = 'none' | 'friends' | 'newDirect' | 'newGroup' | 'groupSettings' | 'contactPanel' | 'starred' | 'blockedReported'
  const [panel, setPanel] = useState<Panel>('none')
  const [forwardTarget, setForwardTarget] = useState<MessageView | null>(null)
  const [reportTarget, setReportTarget] = useState<{ userId: string; userName: string } | null>(null)
  const [blockAfterReport, setBlockAfterReport] = useState<{ userId: string; userName: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ message: MessageView; x: number; y: number } | null>(null)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  // conversationId: null quand la photo vient du bouton caméra de l'EN-TÊTE
  // DE LISTE (aucune conversation ouverte) — il faut alors choisir le
  // destinataire dans l'aperçu avant de pouvoir envoyer.
  const [photoPreview, setPhotoPreview] = useState<{ dataUrl: string; conversationId: string | null } | null>(null)
  const [photoPreviewPickedConv, setPhotoPreviewPickedConv] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [muteMemberDialog, setMuteMemberDialog] = useState<{ userId: string; name: string } | null>(null)
  const [convContextMenu, setConvContextMenu] = useState<{ conversationId: string; x: number; y: number } | null>(null)
  const [convSearch, setConvSearch] = useState('')
  const [showListMenu, setShowListMenu] = useState(false)
  const [forwardTargetPick, setForwardTargetPick] = useState<Set<string>>(new Set())

  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; preview: string } | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [inThreadSearchOpen, setInThreadSearchOpen] = useState(false)
  const [inThreadSearchQuery, setInThreadSearchQuery] = useState('')
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [typingUsers, setTypingUsers] = useState<TypingUserView[]>([])
  const [presence, setPresence] = useState<PresenceMap>({})
  const [addMemberSearch, setAddMemberSearch] = useState('')

  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')

  const [isRecording, setIsRecording] = useState(false)
  const [recordDuration, setRecordDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStartRef = useRef(0)
  const wasHoldingRef = useRef(false)
  const shouldSendRef = useRef(true)

  const activeIdRef = useRef(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraFileInputRef = useRef<HTMLInputElement | null>(null)
  const groupAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushToast = useCallback((message: string) => {
    const id = ++toastSeq
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500)
  }, [])

  // ─── Responsive : split-view desktop (>=768px) vs plein écran mobile ───
  // useSyncExternalStore (pas useState+useEffect) : c'est l'API React dédiée
  // à la lecture d'un store externe (ici matchMedia) sans jamais déclencher
  // de setState synchrone dans un effet — le rendu serveur utilise le
  // troisième argument (snapshot serveur), jamais `window`.
  const isDesktop = useSyncExternalStore(subscribeToDesktopQuery, getDesktopSnapshot, getDesktopServerSnapshot)

  // ─── Deep-link depuis une page externe (ex. "Demander ce service" sur la
  // page publique d'un prestataire, voir ProviderCatalogInquiry.tsx) : la
  // conversation vient d'être créée côté serveur juste avant la navigation
  // vers /messages?conversationId=…, donc déjà présente dans la liste que
  // renverra refreshConversations — appelée ici immédiatement (sans attendre
  // le premier tick du polling ci-dessous) pour éviter un en-tête de thread
  // vide le temps que la liste initiale (chargée côté serveur AVANT cette
  // création) rattrape son retard. Lu depuis `window.location.search`
  // (jamais `useSearchParams`, absent de tout le reste de ce composant) —
  // exécuté une seule fois au montage, puis retiré de l'URL pour qu'un
  // rafraîchissement de page ne rouvre pas indéfiniment la même conversation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const conversationId = params.get('conversationId')
    if (!conversationId) return
    openConversation(conversationId)
    params.delete('conversationId')
    const rest = params.toString()
    window.history.replaceState(null, '', rest ? `${window.location.pathname}?${rest}` : window.location.pathname)

    let cancelled = false
    async function run() {
      const res = await apiFetch<{ conversations: ConversationView[] }>('/api/conversations')
      if (!cancelled && res.ok) setConversations(res.data.conversations)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  // ─── Polling : conversations, amis, messages, frappe, présence ───
  const refreshConversations = useCallback(async () => {
    const res = await apiFetch<{ conversations: ConversationView[] }>('/api/conversations')
    if (res.ok) setConversations(res.data.conversations)
  }, [])

  const refreshFriendData = useCallback(async () => {
    const [reqRes, friendsRes] = await Promise.all([
      apiFetch<{ received: FriendRequestView[]; sent: SentFriendRequestView[] }>('/api/friends/requests'),
      apiFetch<{ friends: FriendView[] }>('/api/friends'),
    ])
    if (reqRes.ok) {
      setReceived(reqRes.data.received)
      setSent(reqRes.data.sent)
    }
    if (friendsRes.ok) setFriends(friendsRes.data.friends)
  }, [])

  const fetchMessages = useCallback(async (conversationId: string) => {
    const res = await apiFetch<{ messages: MessageView[] }>(`/api/conversations/${conversationId}/messages?limit=50`)
    if (res.ok && activeIdRef.current === conversationId) setMessages(res.data.messages)
  }, [])

  useEffect(() => {
    if (!activeId) return
    fetchMessages(activeId)
    apiFetch(`/api/conversations/${activeId}/read`, { method: 'POST' }).then(() => refreshConversations())
    const interval = setInterval(() => fetchMessages(activeId), 3000)
    return () => clearInterval(interval)
  }, [activeId, fetchMessages, refreshConversations])

  useEffect(() => {
    const interval = setInterval(refreshConversations, 4000)
    return () => clearInterval(interval)
  }, [refreshConversations])

  useEffect(() => {
    const interval = setInterval(refreshFriendData, 8000)
    return () => clearInterval(interval)
  }, [refreshFriendData])

  // Réinitialise l'état propre au FIL à chaque changement de conversation —
  // ajustement PENDANT LE RENDU (pattern documenté React "Adjusting some
  // state when a prop changes"), jamais un effet : évite un rendu-fantôme
  // supplémentaire et le setState synchrone dans un effet.
  const [prevActiveId, setPrevActiveId] = useState(activeId)
  if (activeId !== prevActiveId) {
    setPrevActiveId(activeId)
    setReplyTo(null)
    setEditingMessageId(null)
    setComposerText('')
    setInThreadSearchOpen(false)
    setInThreadSearchQuery('')
    setContextMenu(null)
    setTypingUsers([])
  }

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null

  // ─── Indicateur de frappe (polling, jamais de websocket) ───
  useEffect(() => {
    if (!activeId) return
    const interval = setInterval(async () => {
      const res = await apiFetch<{ users: TypingUserView[] }>(`/api/conversations/${activeId}/typing`)
      if (res.ok && activeIdRef.current === activeId) setTypingUsers(res.data.users)
    }, 2500)
    return () => clearInterval(interval)
  }, [activeId])

  // ─── Présence (heartbeat + lecture des interlocuteurs pertinents) ───
  useEffect(() => {
    apiFetch('/api/users/presence', { method: 'POST' })
    const interval = setInterval(() => apiFetch('/api/users/presence', { method: 'POST' }), 20000)
    return () => clearInterval(interval)
  }, [])

  const relevantPresenceIds = useMemo(() => {
    const ids = new Set<string>()
    for (const conv of conversations) for (const m of conv.members) if (m.userId !== currentUserId) ids.add(m.userId)
    return [...ids]
  }, [conversations, currentUserId])

  useEffect(() => {
    if (relevantPresenceIds.length === 0) return
    let cancelled = false
    async function poll() {
      const res = await apiFetch<{ presence: PresenceMap }>(`/api/users/presence?ids=${relevantPresenceIds.join(',')}`)
      if (res.ok && !cancelled) setPresence(res.data.presence)
    }
    poll()
    const interval = setInterval(poll, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantPresenceIds.join(',')])

  // ─── Auto-scroll (seulement si déjà en bas) + bouton scroll-to-bottom ───
  useEffect(() => {
    if (!showScrollButton) {
      const el = chatScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [messages, showScrollButton])

  function handleChatScroll() {
    const el = chatScrollRef.current
    if (!el) return
    setShowScrollButton(el.scrollHeight - el.scrollTop - el.clientHeight > 120)
  }

  function scrollToBottom() {
    const el = chatScrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setShowScrollButton(false)
  }

  function openConversation(id: string) {
    setActiveId(id)
    setMobileView('thread')
  }

  // ─── Composeur : envoi texte / édition ───
  function handleInputChange(value: string) {
    setComposerText(value)
    if (!activeId || editingMessageId) return
    apiFetch(`/api/conversations/${activeId}/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typing: true }),
    })
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      apiFetch(`/api/conversations/${activeId}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typing: false }),
      })
    }, 2500)
  }

  async function handleSend() {
    const text = composerText.trim()
    if (!text || !activeId || busy) return
    setBusy(true)

    if (editingMessageId) {
      const res = await apiFetch<{ message: MessageView }>(`/api/messages/${editingMessageId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      if (!res.ok) pushToast(errorMessageFor(res.error))
      else {
        setMessages((prev) => prev.map((m) => (m.id === editingMessageId ? res.data.message : m)))
        setEditingMessageId(null)
        setComposerText('')
      }
      setBusy(false)
      return
    }

    const res = await apiFetch<{ message: MessageView }>(`/api/conversations/${activeId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', content: text, replyToMessageId: replyTo?.id ?? undefined }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
    } else {
      setMessages((prev) => [...prev, res.data.message])
      setComposerText('')
      setReplyTo(null)
      refreshConversations()
    }
    setBusy(false)
  }

  function handleEditCancel() {
    setEditingMessageId(null)
    setComposerText('')
  }

  function handleEditStart(msg: MessageView) {
    setReplyTo(null)
    setEditingMessageId(msg.id)
    setComposerText(msg.content || '')
  }

  function handleReply(msg: MessageView) {
    const preview =
      msg.type === 'text'
        ? (msg.content || '').slice(0, 60)
        : msg.type === 'image'
          ? 'Photo'
          : msg.type === 'voice'
            ? 'Message vocal'
            : msg.type === 'poll' || msg.type === 'event_poll'
              ? 'Sondage'
              : 'Pièce jointe'
    setReplyTo({ id: msg.id, senderName: msg.senderName, preview })
    setEditingMessageId(null)
    setContextMenu(null)
  }

  function scrollToMessage(messageId: string) {
    const el = document.querySelector(`[data-msg-id="${messageId}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(messageId)
    setTimeout(() => setHighlightedMessageId(null), 2000)
  }

  // ─── @mentions (groupes) ───
  const mentionMatch = activeConversation?.type === 'group' && !editingMessageId ? composerText.match(/(?:^|\s)@([^\s@]*)$/) : null
  const mentionMatches =
    mentionMatch && activeConversation
      ? activeConversation.members.filter((m) => m.userId !== currentUserId && m.name.toLowerCase().includes(mentionMatch[1].toLowerCase())).slice(0, 5)
      : []
  function applyMention(member: ConversationMember) {
    setComposerText((prev) => prev.replace(/((?:^|\s)@)[^\s@]*$/, `$1${member.name} `))
  }

  // ─── Réactions ───
  async function handleReact(messageId: string, emoji: string) {
    const res = await apiFetch<{ reactions: Record<string, string[]> }>(`/api/messages/${messageId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: res.data.reactions } : m)))
    setReactionPickerFor(null)
    setContextMenu(null)
  }

  async function handleVote(messageId: string, optionId: string) {
    const res = await apiFetch<{ options: PollOption[] }>(`/api/messages/${messageId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setMessages((prev) => prev.map((m) => (m.id === messageId && m.poll ? { ...m, poll: { ...m.poll, options: res.data.options } } : m)))
  }

  async function handleCreatePoll() {
    if (!activeId || !pollDraft) return
    const options = pollDraft.options.map((o) => o.trim()).filter(Boolean)
    const res = await apiFetch<{ message: MessageView }>(`/api/conversations/${activeId}/polls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'poll', question: pollDraft.question, options }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setMessages((prev) => [...prev, res.data.message])
    setPollDraft(null)
    refreshConversations()
  }

  async function handleCreateEventPoll(eventId: string) {
    if (!activeId) return
    const res = await apiFetch<{ message: MessageView }>(`/api/conversations/${activeId}/polls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'event_poll', eventId }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setMessages((prev) => [...prev, res.data.message])
    setShowEventPicker(false)
    refreshConversations()
  }

  // ─── Supprimer / marquer important / transférer ───
  async function handleDeleteForMe(messageId: string) {
    const res = await apiFetch(`/api/messages/${messageId}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'me' }),
    })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else setMessages((prev) => prev.filter((m) => m.id !== messageId))
    setContextMenu(null)
  }

  async function handleDeleteForAll(messageId: string) {
    const res = await apiFetch(`/api/messages/${messageId}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'all' }),
    })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deletedForAll: true, content: null, poll: null } : m)))
      pushToast('Message supprimé pour tous')
    }
    setContextMenu(null)
  }

  async function handleToggleStar(msg: MessageView) {
    const res = msg.starredByMe
      ? await apiFetch<{ starred: boolean }>(`/api/messages/${msg.id}/star`, { method: 'DELETE' })
      : await apiFetch<{ starred: boolean }>(`/api/messages/${msg.id}/star`, { method: 'POST' })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, starredByMe: res.data.starred } : m)))
    setStarred((prev) => (res.data.starred ? [{ ...msg, starredByMe: true }, ...prev] : prev.filter((m) => m.id !== msg.id)))
    setContextMenu(null)
  }

  async function handleTogglePin(msg: MessageView) {
    if (!activeId) return
    const alreadyPinned = activeConversation?.pinnedMessageId === msg.id
    const res = alreadyPinned
      ? await apiFetch(`/api/conversations/${activeId}/pinned-message`, { method: 'DELETE' })
      : await apiFetch(`/api/conversations/${activeId}/pinned-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: msg.id }),
        })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    refreshConversations()
    setMessages((prev) => prev.map((m) => ({ ...m, pinned: alreadyPinned ? false : m.id === msg.id })))
    pushToast(alreadyPinned ? 'Message désépinglé' : 'Message épinglé')
    setContextMenu(null)
  }

  function handleForwardOpen(msg: MessageView) {
    setForwardTarget(msg)
    setForwardTargetPick(new Set())
    setContextMenu(null)
  }

  async function handleForwardConfirm() {
    if (!forwardTarget || forwardTargetPick.size === 0) return
    const res = await apiFetch<{ messages: MessageView[] }>(`/api/messages/${forwardTarget.id}/forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toConversationIds: [...forwardTargetPick] }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    pushToast(res.data.messages.length > 1 ? 'Message transféré' : 'Message transféré')
    setForwardTarget(null)
    refreshConversations()
    if (activeId && forwardTargetPick.has(activeId)) fetchMessages(activeId)
  }

  // ─── Photo : sélection fichier / webcam → aperçu → envoi ───
  function openAttachMenu() {
    setShowAttachMenu((v) => !v)
  }

  async function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>, targetConversationId: string | null) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setShowAttachMenu(false)
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setPhotoPreview({ dataUrl, conversationId: targetConversationId })
    setPhotoPreviewPickedConv(targetConversationId)
  }

  async function openCamera() {
    setShowAttachMenu(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      cameraStreamRef.current = stream
      setShowCamera(true)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 0)
    } catch {
      pushToast("Impossible d'accéder à la caméra.")
    }
  }

  function closeCamera() {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
    cameraStreamRef.current = null
    setShowCamera(false)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    closeCamera()
    // Le bouton "Appareil photo" ne vit que dans le menu d'une conversation
    // déjà ouverte — jamais depuis l'en-tête de liste.
    setPhotoPreview({ dataUrl, conversationId: activeId })
    setPhotoPreviewPickedConv(activeId)
  }

  async function handleSendPhoto() {
    const targetId = photoPreview?.conversationId ?? photoPreviewPickedConv
    if (!photoPreview || !targetId) return
    setBusy(true)
    const compressed = await compressImage(photoPreview.dataUrl)
    setPhotoPreview(null)
    const res = await apiFetch<{ message: MessageView }>(`/api/conversations/${targetId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'image', content: '', mediaDataUri: compressed, replyToMessageId: targetId === activeId ? (replyTo?.id ?? undefined) : undefined }),
    })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else {
      if (targetId === activeId) {
        setMessages((prev) => [...prev, res.data.message])
        setReplyTo(null)
      } else {
        openConversation(targetId)
      }
      refreshConversations()
    }
    setBusy(false)
  }

  // ─── Notes vocales : tap-to-record ou press-and-hold, durée, annuler/envoyer ───
  async function startRecording() {
    if (!activeId || mediaRecorderRef.current?.state === 'recording') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || ''
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      shouldSendRef.current = true
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (recordTimerRef.current) clearInterval(recordTimerRef.current)
        setRecordDuration(0)
        setIsRecording(false)
        if (shouldSendRef.current && audioChunksRef.current.length > 0) {
          const actualMime = mr.mimeType || 'audio/webm'
          const blob = new Blob(audioChunksRef.current, { type: actualMime })
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.readAsDataURL(blob)
          })
          if (!activeIdRef.current) return
          const res = await apiFetch<{ message: MessageView }>(`/api/conversations/${activeIdRef.current}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'voice', content: '', mediaDataUri: dataUrl, replyToMessageId: replyTo?.id ?? undefined }),
          })
          if (!res.ok) pushToast(errorMessageFor(res.error))
          else {
            setMessages((prev) => [...prev, res.data.message])
            setReplyTo(null)
            refreshConversations()
          }
        }
      }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setRecordDuration(0)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      recordTimerRef.current = setInterval(() => setRecordDuration((d) => d + 1), 1000)
    } catch {
      pushToast('Impossible d’accéder au micro.')
    }
  }

  function stopRecording(send: boolean) {
    shouldSendRef.current = send
    const mr = mediaRecorderRef.current
    if (mr && mr.state === 'recording') mr.stop()
    mediaRecorderRef.current = null
  }

  function handleMicPointerDown() {
    pressStartRef.current = Date.now()
    wasHoldingRef.current = false
    holdTimerRef.current = setTimeout(() => {
      wasHoldingRef.current = true
      startRecording()
    }, 250)
  }

  function handleMicPointerUp() {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    const pressDuration = Date.now() - pressStartRef.current
    if (pressDuration < 250 && !wasHoldingRef.current) {
      // Tap : bascule démarrage/arrêt.
      if (mediaRecorderRef.current?.state === 'recording') stopRecording(true)
      else startRecording()
    } else if (wasHoldingRef.current) {
      stopRecording(true)
    }
  }

  // ─── Nouvelle conversation directe (parmi les amis, ou par email) ───
  async function handleStartDirectConversation(otherUserId: string) {
    const res = await apiFetch<{ conversation: ConversationView }>('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otherUserId }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setPanel('none')
    await refreshConversations()
    openConversation(res.data.conversation.id)
  }

  async function handleStartDirectConversationByEmail(email: string) {
    const lookup = await apiFetch<{ user: { id: string } }>(`/api/users/lookup?email=${encodeURIComponent(email)}`)
    if (!lookup.ok) {
      pushToast(errorMessageFor(lookup.error))
      return
    }
    await handleStartDirectConversation(lookup.data.user.id)
  }

  // ─── Nouveau groupe ───
  async function handleCreateGroup(name: string, memberIds: string[], avatarDataUrl: string | null) {
    const res = await apiFetch<{ conversation: ConversationView }>('/api/conversations/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, memberUserIds: memberIds }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    if (avatarDataUrl) {
      const compressed = await compressImage(avatarDataUrl, 500, 0.85)
      await apiFetch(`/api/conversations/${res.data.conversation.id}/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUri: compressed }),
      })
    }
    setPanel('none')
    await refreshConversations()
    openConversation(res.data.conversation.id)
  }

  // ─── Groupe : quitter / supprimer / renommer / avatar / admin ───
  async function handleLeaveGroup() {
    if (!activeId) return
    const res = await apiFetch(`/api/conversations/${activeId}/leave`, { method: 'POST' })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setPanel('none')
    setActiveId(null)
    setMobileView('list')
    refreshConversations()
    pushToast('Tu as quitté le groupe')
  }

  async function handleDeleteGroup() {
    if (!activeId) return
    const res = await apiFetch(`/api/conversations/${activeId}`, { method: 'DELETE' })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setPanel('none')
    setActiveId(null)
    setMobileView('list')
    refreshConversations()
    pushToast('Groupe supprimé')
  }

  async function handleRenameGroup(name: string) {
    if (!activeId) return
    const res = await apiFetch<{ name: string }>(`/api/conversations/${activeId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  async function handleUploadGroupAvatar(file: File) {
    if (!activeId) return
    const dataUrl = await fileToDataUrl(file)
    const compressed = await compressImage(dataUrl, 500, 0.85)
    const res = await apiFetch<{ avatar: string }>(`/api/conversations/${activeId}/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUri: compressed }),
    })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  async function handleAddMember(userId: string) {
    if (!activeId) return
    const res = await apiFetch(`/api/conversations/${activeId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else {
      refreshConversations()
      setAddMemberSearch('')
      pushToast('Membre ajouté')
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!activeId) return
    const res = await apiFetch(`/api/conversations/${activeId}/members/${userId}`, { method: 'DELETE' })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  async function handleSetMemberRole(userId: string, role: 'admin' | 'member') {
    if (!activeId) return
    const res = await apiFetch(`/api/conversations/${activeId}/members/${userId}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  async function handleApplyMemberMute(durationMs: number | null) {
    if (!activeId || !muteMemberDialog) return
    const res = await apiFetch<{ untilAtMs: number | null }>(`/api/conversations/${activeId}/members/${muteMemberDialog.userId}/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMs }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setMuteMemberDialog(null)
    refreshConversations()
    pushToast(`${muteMemberDialog.name} ne peut plus envoyer de message.`)
  }

  async function handleClearMemberMute(userId: string) {
    if (!activeId) return
    const res = await apiFetch(`/api/conversations/${activeId}/members/${userId}/mute`, { method: 'DELETE' })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  // ─── Conversation : épingler / masquer / couper notifs / vider historique ───
  async function handleToggleConvPin(conv: ConversationView) {
    const res = conv.pinned
      ? await apiFetch(`/api/conversations/${conv.id}/pin`, { method: 'DELETE' })
      : await apiFetch(`/api/conversations/${conv.id}/pin`, { method: 'POST' })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
    setConvContextMenu(null)
  }

  async function handleToggleConvMute(conv: ConversationView) {
    const res = conv.mutedForMe
      ? await apiFetch(`/api/conversations/${conv.id}/mute`, { method: 'DELETE' })
      : await apiFetch(`/api/conversations/${conv.id}/mute`, { method: 'POST' })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
    setConvContextMenu(null)
  }

  async function handleHideConversation(conversationId: string) {
    const res = await apiFetch(`/api/conversations/${conversationId}/hide`, { method: 'POST' })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setConvContextMenu(null)
    if (activeId === conversationId) {
      setActiveId(null)
      setMobileView('list')
    }
    refreshConversations()
    pushToast('Conversation masquée')
  }

  async function handleClearHistory() {
    if (!activeId) return
    const res = await apiFetch(`/api/conversations/${activeId}/clear`, { method: 'POST' })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else {
      setMessages([])
      pushToast('Historique vidé')
    }
  }

  // ─── Amis / blocage / signalement ───
  async function handleSendFriendRequest(email: string) {
    const lookup = await apiFetch<{ user: { id: string } }>(`/api/users/lookup?email=${encodeURIComponent(email)}`)
    if (!lookup.ok) {
      pushToast(errorMessageFor(lookup.error))
      return
    }
    const res = await apiFetch<{ status: string }>('/api/friends/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: lookup.data.user.id }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    pushToast(res.data.status === 'friends' ? 'Vous êtes maintenant amis !' : 'Demande envoyée.')
    refreshFriendData()
  }

  async function handleFriendRequestAction(requestId: string, action: 'accept' | 'decline' | 'cancel') {
    const res = await apiFetch(`/api/friends/requests/${requestId}/${action}`, { method: 'POST' })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    refreshFriendData()
  }

  async function handleRemoveFriend(friendUserId: string) {
    const res = await apiFetch('/api/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendUserId }),
    })
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else {
      refreshFriendData()
      pushToast('Contact supprimé')
    }
  }

  // "Nouveau" badge dismissible sur un ami récemment ajouté (port de
  // getNewContacts/clearNewContact, MessagingPage.jsx:2482-2496) — persisté
  // en localStorage pour survivre à un rechargement, exactement comme le
  // legacy. Un ami présent dès le tout premier rendu n'est JAMAIS marqué
  // nouveau (friendIdsBaselineRef sert de référence "déjà connu"), seuls les
  // ids apparaissant APRÈS ce premier rendu (acceptation d'une demande,
  // rafraîchissement périodique révélant un ami accepté ailleurs) le sont.
  // Hydraté via l'initialiseur paresseux de useState (ci-dessus), jamais un
  // effet de montage — lire une source externe synchrone une seule fois au
  // premier rendu n'est pas un "effet" au sens React, et un setState dans un
  // effet de montage déclenche react-hooks/set-state-in-effect à raison.
  useEffect(() => {
    const currentIds = new Set(friends.map((f) => f.userId))
    if (friendIdsBaselineRef.current === null) {
      friendIdsBaselineRef.current = currentIds
      return
    }
    const appeared = friends.filter((f) => !friendIdsBaselineRef.current!.has(f.userId)).map((f) => f.userId)
    friendIdsBaselineRef.current = currentIds
    if (appeared.length === 0) return
    setNewFriendIds((prev) => {
      const next = new Set(prev)
      appeared.forEach((id) => next.add(id))
      persistNewFriendIds(next)
      return next
    })
  }, [friends])

  function handleDismissNewFriend(userId: string) {
    setNewFriendIds((prev) => {
      if (!prev.has(userId)) return prev
      const next = new Set(prev)
      next.delete(userId)
      persistNewFriendIds(next)
      return next
    })
  }

  async function handleBlock(userId: string) {
    const res = await apiFetch('/api/users/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    pushToast('Compte bloqué.')
    const blockedRes = await apiFetch<{ blocked: BlockedUserView[] }>('/api/users/blocked')
    if (blockedRes.ok) setBlocked(blockedRes.data.blocked)
  }

  async function handleUnblock(userId: string) {
    const res = await apiFetch('/api/users/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setBlocked((prev) => prev.filter((b) => b.userId !== userId))
    pushToast('Compte débloqué.')
  }

  async function handleSubmitReport(userId: string, userName: string, reason: string) {
    const res = await apiFetch('/api/users/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId, reason }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setReportTarget(null)
    setBlockAfterReport({ userId, userName })
    const reportsRes = await apiFetch<{ reports: MyReportView[] }>('/api/users/report')
    if (reportsRes.ok) setReports(reportsRes.data.reports)
  }

  const otherDirectMember = activeConversation?.type === 'direct' ? activeConversation.members.find((m) => m.userId !== currentUserId) : null
  const isBlockedByMe = otherDirectMember ? blocked.some((b) => b.userId === otherDirectMember.userId) : false
  const isFriend = otherDirectMember ? friends.some((f) => f.userId === otherDirectMember.userId) : false
  const myGroupMute = activeConversation?.myGroupMute ?? null
  const amAdmin = activeConversation?.type === 'group' && activeConversation.members.find((m) => m.userId === currentUserId)?.role === 'admin'
  const pinnedMessage = activeConversation?.pinnedMessageId ? messages.find((m) => m.id === activeConversation.pinnedMessageId) : null

  const filteredConversations = conversations.filter((c) => {
    if (!convSearch.trim()) return true
    const q = convSearch.trim().toLowerCase()
    return conversationLabel(c, currentUserId).toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
  })

  const visibleMessages = inThreadSearchOpen && inThreadSearchQuery.trim()
    ? messages.filter((m) => (m.content || '').toLowerCase().includes(inThreadSearchQuery.trim().toLowerCase()))
    : messages

  const showListPane = isDesktop || mobileView === 'list'
  const showThreadPane = isDesktop || mobileView === 'thread'

  return (
    <main style={{ minHeight: '100vh', display: 'flex', background: 'var(--obsidian)' }}>
      {showListPane && (
        <aside
          style={{
            width: isDesktop ? 340 : '100%',
            flexShrink: 0,
            borderRight: isDesktop ? '1px solid var(--border)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
          }}
        >
          <div style={{ padding: '18px 16px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Messages</h1>
              <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
                <input
                  ref={cameraFileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => handlePhotoFileChange(e, activeId)}
                />
                <IconButton title="Envoyer une photo" onClick={() => cameraFileInputRef.current?.click()}>
                  📷
                </IconButton>
                <IconButton title="Nouvelle discussion" onClick={() => setPanel('newDirect')}>
                  {received.length > 0 && <Badge count={received.length} />}✎
                </IconButton>
                <IconButton title="Menu" onClick={() => setShowListMenu((v) => !v)}>
                  ⋮
                </IconButton>
                {showListMenu && (
                  <div style={{ position: 'absolute', top: 36, right: 0, zIndex: 50 }}>
                    <DropdownMenu
                      onClose={() => setShowListMenu(false)}
                      items={[
                        { label: 'Ajouter un ami', onClick: () => setPanel('friends') },
                        { label: 'Créer un groupe', onClick: () => setPanel('newGroup') },
                        { label: 'Importants', onClick: () => setPanel('starred') },
                        { label: 'Bloqués & signalés', onClick: () => setPanel('blockedReported') },
                      ]}
                    />
                  </div>
                )}
              </div>
            </div>
            <input
              value={convSearch}
              onChange={(e) => setConvSearch(e.target.value)}
              placeholder="Rechercher une conversation…"
              style={{ ...inputStyle, marginBottom: 0 }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 16px' }}>
            {conversations.length === 0 && <EmptyState icon="💬" title="Aucune conversation" subtitle="Ajoute un contact et commence à discuter" />}
            {conversations.length > 0 && filteredConversations.length === 0 && (
              <EmptyState icon="🔎" title="Aucun résultat" subtitle="Essaie un autre terme de recherche" />
            )}
            {filteredConversations.map((conv) => {
              const label = conversationLabel(conv, currentUserId)
              const other = conv.type === 'direct' ? conv.members.find((m) => m.userId !== currentUserId) : null
              return (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setConvContextMenu({ conversationId: conv.id, x: e.clientX, y: e.clientY })
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 10px',
                    borderRadius: 12,
                    border: 'none',
                    background: conv.id === activeId ? 'var(--surface-2)' : 'transparent',
                    cursor: 'pointer',
                    marginBottom: 2,
                  }}
                >
                  {conv.type === 'group' ? (
                    <GroupAvatar conv={conv} size={42} />
                  ) : (
                    <Avatar userId={other?.userId ?? ''} name={label} size={42} online={other ? presence[other.userId]?.online : false} showOnline />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'var(--text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {conv.pinned && <span title="Épinglée">📌</span>}
                        {label}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ''}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.lastMessage || 'Aucun message'}
                      </p>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {conv.mutedForMe && <span style={{ fontSize: 11, opacity: 0.6 }}>🔕</span>}
                        {conv.unreadCount > 0 &&
                          (conv.mutedForMe ? (
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal-solid)', display: 'inline-block' }} />
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#04120e',
                                background: 'var(--teal-solid)',
                                borderRadius: 999,
                                padding: '1px 6px',
                              }}
                            >
                              {conv.unreadCount}
                            </span>
                          ))}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>
      )}

      {showThreadPane && (
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: '100vh' }}>
          {!activeConversation ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyState icon="💬" title="Choisis une conversation" subtitle="Sélectionne un contact ou un groupe pour commencer à discuter" />
            </div>
          ) : (
            <>
              <ThreadHeader
                conversation={activeConversation}
                currentUserId={currentUserId}
                presence={presence}
                isDesktop={isDesktop}
                onBack={() => {
                  setMobileView('list')
                  setActiveId(null)
                }}
                onOpenSearch={() => setInThreadSearchOpen((v) => !v)}
                onOpenPoll={() => setPollDraft({ question: '', options: ['', ''] })}
                onOpenGroupSettings={() => setPanel('groupSettings')}
                onOpenContactPanel={() => setPanel('contactPanel')}
              />

              {inThreadSearchOpen && (
                <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                  <input
                    autoFocus
                    value={inThreadSearchQuery}
                    onChange={(e) => setInThreadSearchQuery(e.target.value)}
                    placeholder="Rechercher dans la conversation…"
                    style={{ ...inputStyle, marginBottom: 4 }}
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
                    {inThreadSearchQuery.trim() ? `${visibleMessages.length} résultat${visibleMessages.length !== 1 ? 's' : ''}` : 'Tape pour rechercher'}
                  </p>
                </div>
              )}

              {activeConversation.pinnedMessageId && pinnedMessage && (
                <div
                  style={{
                    padding: '8px 20px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    background: 'var(--surface)',
                    cursor: 'pointer',
                  }}
                  onClick={() => scrollToMessage(pinnedMessage.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span>📌</span>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pinnedMessage.deletedForAll ? 'Message supprimé' : pinnedMessage.content || messageTypeLabel(pinnedMessage.type)}
                    </p>
                  </div>
                  {amAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTogglePin(pinnedMessage)
                      }}
                      style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 13 }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              <div ref={chatScrollRef} onScroll={handleChatScroll} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', position: 'relative' }}>
                {visibleMessages.length === 0 && inThreadSearchOpen && inThreadSearchQuery.trim() && (
                  <EmptyState icon="🔎" title="Aucun résultat" subtitle="Aucun message ne correspond à ta recherche" />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {visibleMessages.map((msg, idx) => {
                    const prevMsg = visibleMessages[idx - 1]
                    const showDateSep = !prevMsg || !isSameDay(msg.createdAt, prevMsg.createdAt)
                    const isMine = msg.senderId === currentUserId
                    const showAvatar = !isMine && msg.type !== 'system' && (!prevMsg || prevMsg.senderId !== msg.senderId || showDateSep)
                    return (
                      <div key={msg.id} data-msg-id={msg.id}>
                        {showDateSep && (
                          <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                color: 'var(--text-faint)',
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                              }}
                            >
                              {formatDateSeparator(msg.createdAt)}
                            </span>
                          </div>
                        )}
                        <MessageRow
                          message={msg}
                          isMine={isMine}
                          currentUserId={currentUserId}
                          showAvatar={showAvatar}
                          showSenderName={!isMine && activeConversation.type === 'group' && showAvatar}
                          members={activeConversation.members}
                          highlighted={highlightedMessageId === msg.id}
                          onlineForAvatar={presence[msg.senderId]?.online}
                          replyPreview={msg.replyToMessageId ? messages.find((m) => m.id === msg.replyToMessageId) ?? null : null}
                          onReplyClick={scrollToMessage}
                          onOpenContextMenu={(x, y) => setContextMenu({ message: msg, x, y })}
                          onReact={handleReact}
                          onOpenFullPicker={() => setReactionPickerFor(msg.id)}
                          onVote={handleVote}
                          onReply={handleReply}
                        />
                      </div>
                    )
                  })}
                </div>
                {typingUsers.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
                    <TypingDots />
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {typingUsers.map((u) => u.name).join(', ')} écri{typingUsers.length > 1 ? 'vent' : 't'}…
                    </span>
                  </div>
                )}
              </div>

              {showScrollButton && (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  style={{
                    position: 'absolute',
                    right: isDesktop ? 32 : 16,
                    bottom: 96,
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    border: '1px solid var(--border-strong)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                >
                  ↓
                </button>
              )}

              {myGroupMute ? (
                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--pink)', margin: 0 }}>
                    Un administrateur t&apos;a mis en sourdine {formatMuteUntil(myGroupMute.untilAt)}.
                  </p>
                </div>
              ) : isBlockedByMe ? (
                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>
                    Tu as bloqué ce contact —{' '}
                    <button
                      type="button"
                      onClick={() => otherDirectMember && handleUnblock(otherDirectMember.userId)}
                      style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13 }}
                    >
                      débloquer
                    </button>
                  </p>
                </div>
              ) : (
                <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)' }}>
                  {mentionMatches.length > 0 && (
                    <div style={{ marginBottom: 8, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10, overflow: 'hidden' }}>
                      {mentionMatches.map((m) => (
                        <button
                          key={m.userId}
                          type="button"
                          onClick={() => applyMention(m)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 12px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: 13,
                          }}
                        >
                          @{m.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {editingMessageId && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--surface-2)',
                        borderRadius: 10,
                        padding: '6px 10px',
                        marginBottom: 8,
                        borderLeft: '3px solid var(--gold)',
                      }}
                    >
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', margin: 0 }}>Modifier le message</p>
                      <button type="button" onClick={handleEditCancel} style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  )}

                  {replyTo && !editingMessageId && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--surface-2)',
                        borderRadius: 10,
                        padding: '6px 10px',
                        marginBottom: 8,
                        borderLeft: '3px solid var(--violet)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', margin: '0 0 1px' }}>Répondre à {replyTo.senderName}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {replyTo.preview}
                        </p>
                      </div>
                      <button type="button" onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  )}

                  {isRecording ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        background: 'var(--surface)',
                        borderRadius: 999,
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => stopRecording(false)}
                        style={{ border: 'none', background: 'none', color: 'var(--pink)', cursor: 'pointer', fontSize: 18 }}
                        aria-label="Annuler"
                      >
                        🗑
                      </button>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pink)', animation: 'lib-pulse 1.2s infinite' }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
                        {Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')}
                      </span>
                      <button
                        type="button"
                        onClick={() => stopRecording(true)}
                        style={{ border: 'none', background: 'var(--teal-solid)', color: '#04120e', borderRadius: '50%', width: 34, height: 34, cursor: 'pointer' }}
                        aria-label="Envoyer"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
                      <div style={{ position: 'relative' }}>
                        <IconButton title="Joindre" onClick={openAttachMenu}>
                          +
                        </IconButton>
                        {showAttachMenu && (
                          <div style={{ position: 'absolute', bottom: 44, left: 0, zIndex: 50 }}>
                            <DropdownMenu
                              onClose={() => setShowAttachMenu(false)}
                              items={[
                                { label: 'Photo', onClick: () => fileInputRef.current?.click() },
                                { label: 'Appareil photo', onClick: openCamera },
                                { label: 'Sondage', onClick: () => setPollDraft({ question: '', options: ['', ''] }) },
                                { label: 'Partager un événement', onClick: () => setShowEventPicker(true) },
                              ]}
                            />
                          </div>
                        )}
                        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handlePhotoFileChange(e, activeId)} />
                      </div>
                      <textarea
                        value={composerText}
                        onChange={(e) => handleInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSend()
                          }
                        }}
                        placeholder="Écris un message…"
                        rows={1}
                        style={{ ...inputStyle, marginBottom: 0, flex: 1, resize: 'none', maxHeight: 120 }}
                      />
                      {composerText.trim() ? (
                        <button
                          type="button"
                          onClick={handleSend}
                          disabled={busy}
                          style={{
                            padding: '10px 20px',
                            borderRadius: 999,
                            border: 'none',
                            fontWeight: 700,
                            fontSize: 13,
                            color: '#fff',
                            background: busy ? 'rgba(143,86,255,0.5)' : 'linear-gradient(180deg,#8f56ff,#7a3bf2)',
                            cursor: busy ? 'default' : 'pointer',
                          }}
                        >
                          {editingMessageId ? 'Modifier' : 'Envoyer'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onPointerDown={handleMicPointerDown}
                          onPointerUp={handleMicPointerUp}
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: '50%',
                            border: 'none',
                            background: 'linear-gradient(180deg,#8f56ff,#7a3bf2)',
                            color: '#fff',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                          aria-label="Message vocal"
                        >
                          🎙
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ─── Menu contextuel de message ─── */}
      {contextMenu && (
        <MessageContextMenu
          message={contextMenu.message}
          x={contextMenu.x}
          y={contextMenu.y}
          currentUserId={currentUserId}
          amAdmin={Boolean(amAdmin)}
          pinnedMessageId={activeConversation?.pinnedMessageId ?? null}
          onClose={() => setContextMenu(null)}
          onReact={(emoji) => handleReact(contextMenu.message.id, emoji)}
          onReply={() => handleReply(contextMenu.message)}
          onEdit={() => handleEditStart(contextMenu.message)}
          onStar={() => handleToggleStar(contextMenu.message)}
          onForward={() => handleForwardOpen(contextMenu.message)}
          onPin={() => handleTogglePin(contextMenu.message)}
          onDeleteForMe={() => handleDeleteForMe(contextMenu.message.id)}
          onDeleteForAll={() => handleDeleteForAll(contextMenu.message.id)}
        />
      )}

      {/* ─── Menu contextuel de conversation ─── */}
      {convContextMenu &&
        (() => {
          const conv = conversations.find((c) => c.id === convContextMenu.conversationId)
          if (!conv) return null
          return (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setConvContextMenu(null)} />
              <div style={{ position: 'fixed', top: convContextMenu.y, left: convContextMenu.x, zIndex: 91 }}>
                <DropdownMenu
                  onClose={() => setConvContextMenu(null)}
                  items={[
                    { label: conv.pinned ? 'Désépingler' : 'Épingler', onClick: () => handleToggleConvPin(conv) },
                    { label: conv.mutedForMe ? 'Réactiver les notifications' : 'Couper les notifications', onClick: () => handleToggleConvMute(conv) },
                    { label: 'Masquer la conversation', onClick: () => handleHideConversation(conv.id) },
                  ]}
                />
              </div>
            </>
          )
        })()}

      {reactionPickerFor && (
        <FullReactionPicker onPick={(emoji) => handleReact(reactionPickerFor, emoji)} onClose={() => setReactionPickerFor(null)} />
      )}

      {/* ─── Panneaux / modales ─── */}
      {panel === 'newDirect' && (
        <NewDirectModal friends={friends} onPick={handleStartDirectConversation} onEmail={handleStartDirectConversationByEmail} onClose={() => setPanel('none')} />
      )}
      {panel === 'newGroup' && <NewGroupModal friends={friends} onCreate={handleCreateGroup} onClose={() => setPanel('none')} />}
      {panel === 'friends' && (
        <FriendsPanel
          received={received}
          sent={sent}
          friends={friends}
          newFriendIds={newFriendIds}
          onDismissNew={handleDismissNewFriend}
          onAction={handleFriendRequestAction}
          onSend={handleSendFriendRequest}
          onRemove={handleRemoveFriend}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'groupSettings' && activeConversation?.type === 'group' && (
        <GroupSettingsModal
          conversation={activeConversation}
          currentUserId={currentUserId}
          friends={friends}
          addMemberSearch={addMemberSearch}
          onAddMemberSearchChange={setAddMemberSearch}
          onAddMember={handleAddMember}
          onRemoveMember={handleRemoveMember}
          onSetRole={handleSetMemberRole}
          onOpenMuteDialog={(userId, name) => setMuteMemberDialog({ userId, name })}
          onClearMute={handleClearMemberMute}
          onRename={handleRenameGroup}
          onUploadAvatar={handleUploadGroupAvatar}
          groupAvatarInputRef={groupAvatarInputRef}
          onLeave={handleLeaveGroup}
          onDelete={handleDeleteGroup}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'contactPanel' && activeConversation?.type === 'direct' && otherDirectMember && (
        <ContactPanelModal
          conversationId={activeId as string}
          member={otherDirectMember}
          online={presence[otherDirectMember.userId]?.online}
          lastSeenAt={presence[otherDirectMember.userId]?.lastSeenAt ?? null}
          isFriend={isFriend}
          isBlocked={isBlockedByMe}
          onClearHistory={handleClearHistory}
          onRemoveFriend={() => handleRemoveFriend(otherDirectMember.userId)}
          onBlock={() => handleBlock(otherDirectMember.userId)}
          onUnblock={() => handleUnblock(otherDirectMember.userId)}
          onReport={() => setReportTarget({ userId: otherDirectMember.userId, userName: otherDirectMember.name })}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'starred' && (
        <StarredModal
          messages={starred}
          currentUserId={currentUserId}
          onJumpTo={(conversationId) => {
            setPanel('none')
            openConversation(conversationId)
          }}
          onUnstar={(id) => {
            handleToggleStar({ ...(starred.find((m) => m.id === id) as MessageView), starredByMe: true })
          }}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'blockedReported' && (
        <BlockedReportedModal blocked={blocked} reports={reports} onUnblock={handleUnblock} onClose={() => setPanel('none')} />
      )}

      {forwardTarget && (
        <ForwardModal
          conversations={conversations}
          currentUserId={currentUserId}
          picked={forwardTargetPick}
          onToggle={(id) =>
            setForwardTargetPick((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }
          onConfirm={handleForwardConfirm}
          onClose={() => setForwardTarget(null)}
        />
      )}

      {reportTarget && (
        <ReportModal target={reportTarget} onSubmit={(reason) => handleSubmitReport(reportTarget.userId, reportTarget.userName, reason)} onClose={() => setReportTarget(null)} />
      )}

      {blockAfterReport && (
        <ConfirmModal
          title="Signalement envoyé"
          message={`Bloquer aussi ${blockAfterReport.userName} ?`}
          confirmLabel="Bloquer"
          onConfirm={() => {
            handleBlock(blockAfterReport.userId)
            setBlockAfterReport(null)
          }}
          onCancel={() => setBlockAfterReport(null)}
        />
      )}

      {muteMemberDialog && (
        <MuteMemberModal name={muteMemberDialog.name} onApply={handleApplyMemberMute} onClose={() => setMuteMemberDialog(null)} />
      )}

      {pollDraft && <PollDraftModal draft={pollDraft} onChange={setPollDraft} onSubmit={handleCreatePoll} onClose={() => setPollDraft(null)} />}

      {showEventPicker && <EventPickerModal onPick={handleCreateEventPoll} onClose={() => setShowEventPicker(false)} />}

      {photoPreview && (
        <ModalShell title="Envoyer la photo" onClose={() => setPhotoPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoPreview.dataUrl} alt="Aperçu" style={{ width: '100%', borderRadius: 10, marginBottom: 12, maxHeight: 320, objectFit: 'contain' }} />
          {photoPreview.conversationId === null && (
            <>
              <p style={sectionLabelStyle}>Choisir un destinataire</p>
              <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
                {conversations.map((conv) => {
                  const label = conversationLabel(conv, currentUserId)
                  return (
                    <label key={conv.id} style={{ ...rowButtonStyle, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="photo-target-conversation"
                        checked={photoPreviewPickedConv === conv.id}
                        onChange={() => setPhotoPreviewPickedConv(conv.id)}
                        style={{ marginRight: 4 }}
                      />
                      {conv.type === 'group' ? <GroupAvatar conv={conv} size={28} /> : <Avatar userId={conv.id} name={label} size={28} />}
                      <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
                    </label>
                  )
                })}
              </div>
            </>
          )}
          <ModalActions
            onCancel={() => setPhotoPreview(null)}
            onConfirm={handleSendPhoto}
            confirmLabel="Envoyer"
            disabled={photoPreview.conversationId === null && !photoPreviewPickedConv}
          />
        </ModalShell>
      )}

      {showCamera && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <video ref={videoRef} autoPlay playsInline style={{ maxWidth: '92%', maxHeight: '70vh', borderRadius: 12 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={closeCamera} style={smallButtonStyle}>
              Annuler
            </button>
            <button type="button" onClick={capturePhoto} style={{ ...smallButtonStyle, background: 'var(--teal-solid)', color: '#04120e', border: 'none', fontWeight: 700 }}>
              Capturer
            </button>
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 400 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid rgba(224,90,170,0.4)',
              color: 'var(--text)',
              borderRadius: 12,
              padding: '10px 16px',
              fontSize: 13,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes lib-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes lib-bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-3px); } }
      `}</style>
    </main>
  )
}

function messageTypeLabel(type: MessageType): string {
  if (type === 'image') return 'Photo'
  if (type === 'voice') return 'Message vocal'
  if (type === 'poll' || type === 'event_poll') return 'Sondage'
  if (type === 'story') return 'Article'
  if (type === 'event') return 'Événement'
  if (type === 'catalog_item') return 'Offre prestataire'
  return ''
}

// ═══════════════════════════════ Sous-composants ══════════════════════════════

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        position: 'relative',
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '1px solid var(--border-strong)',
        background: 'var(--surface-2)',
        color: 'var(--text)',
        cursor: 'pointer',
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

function Badge({ count }: { count: number }) {
  return (
    <span
      style={{
        position: 'absolute',
        top: -3,
        right: -3,
        fontSize: 9,
        fontWeight: 700,
        color: '#fff',
        background: 'var(--pink)',
        borderRadius: 999,
        padding: '1px 4px',
        minWidth: 14,
        textAlign: 'center',
      }}
    >
      {count}
    </span>
  )
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 24px', textAlign: 'center' }}>
      <span style={{ fontSize: 32, opacity: 0.5 }}>{icon}</span>
      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, maxWidth: 220 }}>{subtitle}</p>
    </div>
  )
}

function Avatar({
  userId,
  name,
  size = 38,
  online,
  showOnline,
}: {
  userId: string
  name: string
  size?: number
  online?: boolean
  showOnline?: boolean
}) {
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
        {getInitials(name)}
      </div>
      {showOnline && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: online ? '#22c55e' : 'rgba(255,255,255,0.2)',
            border: '2px solid var(--obsidian)',
          }}
        />
      )}
    </div>
  )
}

function GroupAvatar({ conv, size = 38 }: { conv: { avatar: string | null; name: string | null }; size?: number }) {
  if (conv.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={conv.avatar} alt={conv.name ?? 'Groupe'} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(200,169,110,0.14)',
        border: '1px solid rgba(200,169,110,0.3)',
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

function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-faint)', animation: `lib-bounce 1.2s ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  )
}

function ThreadHeader({
  conversation,
  currentUserId,
  presence,
  isDesktop,
  onBack,
  onOpenSearch,
  onOpenPoll,
  onOpenGroupSettings,
  onOpenContactPanel,
}: {
  conversation: ConversationView
  currentUserId: string
  presence: PresenceMap
  isDesktop: boolean
  onBack: () => void
  onOpenSearch: () => void
  onOpenPoll: () => void
  onOpenGroupSettings: () => void
  onOpenContactPanel: () => void
}) {
  const label = conversationLabel(conversation, currentUserId)
  const other = conversation.type === 'direct' ? conversation.members.find((m) => m.userId !== currentUserId) : null
  const otherOnline = other ? presence[other.userId]?.online : false
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        onClick={conversation.type === 'group' ? onOpenGroupSettings : onOpenContactPanel}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}
      >
        {!isDesktop && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              onBack()
            }}
            style={{ color: 'var(--text-faint)', fontSize: 18, marginRight: 4 }}
          >
            ←
          </span>
        )}
        {conversation.type === 'group' ? <GroupAvatar conv={conversation} size={36} /> : <Avatar userId={other?.userId ?? ''} name={label} size={36} />}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</h2>
          <p style={{ fontSize: 11, color: otherOnline ? '#22c55e' : 'var(--text-faint)', margin: 0 }}>
            {conversation.type === 'group' ? `${conversation.members.length} membres` : otherOnline ? 'En ligne' : 'Hors ligne'}
          </p>
        </div>
      </button>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <IconButton title="Rechercher" onClick={onOpenSearch}>
          🔎
        </IconButton>
        <IconButton title="Sondage" onClick={onOpenPoll}>
          📊
        </IconButton>
      </div>
    </div>
  )
}

function MessageRow({
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
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 20, padding: '4px 12px' }}>{message.content}</span>
      </div>
    )
  }

  const reactionEntries = Object.entries(message.reactions).filter(([, users]) => users.length > 0)

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current
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
      <div style={{ width: 26, flexShrink: 0 }}>{showAvatar && <Avatar userId={message.senderId} name={message.senderName} size={26} online={onlineForAvatar} showOnline />}</div>
      <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2, transform: `translateX(${swipeX}px)` }}>
        {showSenderName && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', paddingLeft: 4 }}>{message.senderName}</span>}
        {message.forwardedFrom && (
          <span style={{ fontSize: 10.5, color: 'var(--text-faint)', paddingLeft: isMine ? 0 : 4 }}>↗ Transféré de {message.forwardedFrom.senderName}</span>
        )}
        {replyPreview && (
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
        )}
        <div
          onContextMenu={(e) => {
            e.preventDefault()
            onOpenContextMenu(e.clientX, e.clientY)
          }}
          style={{
            padding: message.deletedForAll ? '8px 14px' : ['image', 'poll', 'event_poll', 'story', 'event', 'catalog_item'].includes(message.type) ? 6 : '9px 14px',
            borderRadius: isMine ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
            background: isMine ? '#7a3bf2' : 'var(--surface)',
            border: `1px solid ${isMine ? 'rgba(255,255,255,0.1)' : 'var(--border)'}`,
            maxWidth: '100%',
            cursor: 'context-menu',
            boxShadow: highlighted ? '0 0 0 2px rgba(255,255,255,0.85)' : 'none',
            transition: 'box-shadow 0.3s',
          }}
        >
          <MessageContent message={message} members={members} onVote={onVote} />
        </div>

        {reactionEntries.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
            {reactionEntries.map(([emoji, users]) => {
              const reactedByMe = users.includes(currentUserId)
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(message.id, emoji)}
                  style={{
                    background: reactedByMe ? 'rgba(78,232,200,0.14)' : 'var(--surface-2)',
                    border: `1px solid ${reactedByMe ? 'rgba(78,232,200,0.3)' : 'var(--border)'}`,
                    borderRadius: 10,
                    padding: '2px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 11,
                    color: reactedByMe ? 'var(--teal)' : 'var(--text)',
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontSize: 9, color: reactedByMe ? 'var(--teal)' : 'var(--text-faint)' }}>{users.length}</span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={onOpenFullPicker}
              style={{ border: '1px solid var(--border)', background: 'transparent', borderRadius: 10, padding: '2px 6px', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 11 }}
            >
              +
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {message.starredByMe && <span style={{ fontSize: 10, color: 'var(--gold)' }}>★</span>}
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{formatTime(message.createdAt)}</span>
          {isMine && message.readStatus && (
            <span style={{ fontSize: 9, color: message.readStatus === 'read' ? 'var(--teal)' : 'var(--text-faint)' }}>
              {message.readStatus === 'read' ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function MessageContent({ message, members, onVote }: { message: MessageView; members: ConversationMember[]; onVote: (messageId: string, optionId: string) => void }) {
  if (message.deletedForAll) return <span style={{ fontSize: 12.5, color: 'var(--text-faint)', fontStyle: 'italic' }}>Message supprimé</span>

  if (message.type === 'text') {
    return (
      <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
        <MentionText content={message.content ?? ''} members={members} />
        {message.editedAt && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 5, fontStyle: 'italic' }}>(modifié)</span>}
      </p>
    )
  }
  if (message.type === 'image') return <ImageBubble content={message.content} createdAt={message.createdAt} />
  if (message.type === 'voice') return <VoiceBubble content={message.content} />
  if (message.type === 'poll' || message.type === 'event_poll') return <PollCard message={message} onVote={onVote} />
  if (message.type === 'story') return <StoryCard content={message.content} />
  if (message.type === 'event') return <EventCard content={message.content} />
  if (message.type === 'catalog_item') return <CatalogItemCard content={message.content} />
  return <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{message.content}</span>
}

function MentionText({ content, members }: { content: string; members: ConversationMember[] }) {
  if (members.length === 0 || !content.includes('@')) return <>{content}</>
  const names = members.map((m) => m.name).filter(Boolean)
  if (names.length === 0) return <>{content}</>
  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g')
  const parts = content.split(pattern)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') && names.includes(part.slice(1)) ? (
          <span key={i} style={{ color: 'var(--teal)', fontWeight: 700 }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

// L'expiration dépend de l'horloge murale (Date.now()), pas d'une donnée
// React — lue UNIQUEMENT dans l'effet (jamais pendant le rendu, qui doit
// rester pur), recalculée périodiquement pour que le badge d'heures restantes
// et le passage à "expirée" progressent sans nécessiter d'interaction.
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
        <span style={{ fontSize: 18 }}>⏳</span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Photo expirée</span>
      </div>
    )
  }

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={content}
          alt="Photo"
          onClick={() => setZoomed(true)}
          style={{ maxWidth: 220, maxHeight: 220, borderRadius: 10, display: 'block', cursor: 'zoom-in' }}
        />
        {hoursLeft <= 23 && (
          <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 600, color: '#fff' }}>
            {hoursLeft} h
          </span>
        )}
        <a
          href={content}
          download="photo.jpg"
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 5, right: 5, background: 'rgba(0,0,0,0.55)', borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textDecoration: 'none' }}
        >
          ↓
        </a>
      </div>
      {zoomed && (
        <div
          onClick={() => setZoomed(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={content} alt="Photo" style={{ maxWidth: '92%', maxHeight: '92%', objectFit: 'contain' }} />
        </div>
      )}
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
        const peaks = Array.from({ length: VOICE_BARS }, (_, i) => {
          let max = 0
          for (let j = 0; j < blockSize; j++) max = Math.max(max, Math.abs(data[i * blockSize + j] || 0))
          return max
        })
        const maxPeak = Math.max(...peaks, 0.01)
        setBars(peaks.map((p) => Math.max(0.15, p / maxPeak)))
        setDuration(Math.round(audioBuffer.duration))
      } catch {
        if (!cancelled) {
          setBars(Array.from({ length: VOICE_BARS }, (_, i) => 0.2 + ((content.charCodeAt(i % content.length) + i * 17) % 80) / 100))
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
      const a = new Audio(content)
      a.ontimeupdate = () => setProgress(a.currentTime / (a.duration || 1))
      a.onended = () => {
        setPlaying(false)
        setProgress(0)
      }
      audioRef.current = a
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
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190, maxWidth: 240 }}>
      <button
        type="button"
        onClick={handlePlay}
        style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 24 }}>
        {activeBars.map((h, i) => (
          <div
            key={i}
            style={{
              width: 2.5,
              height: `${h * 100}%`,
              borderRadius: 2,
              background: progress > 0 && i / activeBars.length <= progress ? '#fff' : 'rgba(255,255,255,0.3)',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', minWidth: 26, textAlign: 'right', flexShrink: 0 }}>{duration > 0 ? fmt(duration) : ''}</span>
    </div>
  )
}

function PollCard({ message, onVote }: { message: MessageView; onVote: (messageId: string, optionId: string) => void }) {
  const poll = message.poll
  if (!poll) return <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sondage indisponible.</span>
  const totalVotes = poll.options.reduce((s, o) => s + o.voterIds.length, 0)
  return (
    <div style={{ minWidth: 220, maxWidth: 280 }}>
      {poll.event && <p style={{ fontSize: 11, color: 'var(--gold)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{poll.event.name}</p>}
      <p style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>{poll.question}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {poll.options.map((opt) => {
          const pct = totalVotes ? Math.round((opt.voterIds.length / totalVotes) * 100) : 0
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onVote(message.id, opt.id)}
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--border-strong)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text)',
                fontSize: 12.5,
                cursor: 'pointer',
                textAlign: 'left',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'rgba(78,232,200,0.1)' }} />
              <span style={{ position: 'relative' }}>{opt.text}</span>
              <span style={{ position: 'relative', color: 'var(--teal)', fontWeight: 700 }}>{opt.voterIds.length}</span>
            </button>
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
      {story.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={story.imageUrl} alt={story.title} style={{ width: '100%', borderRadius: 6, maxHeight: 130, objectFit: 'cover', marginBottom: 8 }} />
      )}
      <p style={{ fontSize: 15, color: 'var(--text)', margin: '0 0 4px', fontWeight: 500 }}>{story.title}</p>
      {story.text && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{story.text}</p>}
    </div>
  )
}

function EventCard({ content }: { content: string | null }) {
  let ev: { id?: string; name?: string; date?: string; price?: number; image?: string } = {}
  try {
    ev = content ? JSON.parse(content) : {}
  } catch {
    return <span style={{ fontSize: 12, color: 'var(--gold)' }}>Événement</span>
  }
  const clickable = Boolean(ev.id)
  const priceLabel = ev.price == null ? null : Number(ev.price) <= 0 ? 'Gratuit' : `dès ${ev.price}€`
  return (
    <a
      href={clickable ? `/events/${ev.id}` : undefined}
      style={{ display: 'block', width: 240, borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)', textDecoration: 'none', cursor: clickable ? 'pointer' : 'default' }}
    >
      <div style={{ position: 'relative' }}>
        {ev.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ev.image} alt={ev.name} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(255,255,255,0.06)' }} />
        )}
        {priceLabel && (
          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 700, color: 'var(--gold)', background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: 6 }}>
            {priceLabel}
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 3px', fontWeight: 600 }}>{ev.name || 'Événement'}</p>
        <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: 0, textTransform: 'uppercase' }}>{ev.date || ''}</p>
      </div>
    </a>
  )
}

function CatalogItemCard({ content }: { content: string | null }) {
  let it: { providerId?: string; name?: string; category?: string; image?: string; price?: number } = {}
  try {
    it = content ? JSON.parse(content) : {}
  } catch {
    return <span style={{ fontSize: 11, color: 'var(--gold)' }}>Offre prestataire</span>
  }
  const clickable = Boolean(it.providerId)
  return (
    <a
      href={clickable ? `/providers/${encodeURIComponent(it.providerId!)}` : undefined}
      style={{ display: 'block', width: 240, borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)', textDecoration: 'none', cursor: clickable ? 'pointer' : 'default' }}
    >
      <div style={{ position: 'relative' }}>
        {it.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.image} alt={it.name} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(255,255,255,0.06)' }} />
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 3px', fontWeight: 600 }}>{it.name || 'Offre'}</p>
        {it.category && <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: 0, textTransform: 'uppercase' }}>{it.category}</p>}
      </div>
    </a>
  )
}

function MessageContextMenu({
  message,
  x,
  y,
  currentUserId,
  amAdmin,
  pinnedMessageId,
  onClose,
  onReact,
  onReply,
  onEdit,
  onStar,
  onForward,
  onPin,
  onDeleteForMe,
  onDeleteForAll,
}: {
  message: MessageView
  x: number
  y: number
  currentUserId: string
  amAdmin: boolean
  pinnedMessageId: string | null
  onClose: () => void
  onReact: (emoji: string) => void
  onReply: () => void
  onEdit: () => void
  onStar: () => void
  onForward: () => void
  onPin: () => void
  onDeleteForMe: () => void
  onDeleteForAll: () => void
}) {
  const isMine = message.senderId === currentUserId
  const items: { label: string; onClick: () => void; danger?: boolean }[] = []
  if (!message.deletedForAll) {
    items.push({ label: 'Répondre', onClick: onReply })
    if (isMine && message.type === 'text') items.push({ label: 'Modifier', onClick: onEdit })
    items.push({ label: message.starredByMe ? 'Retirer des importants' : 'Marquer important', onClick: onStar })
    items.push({ label: 'Transférer', onClick: onForward })
    if (amAdmin) items.push({ label: pinnedMessageId === message.id ? 'Désépingler' : 'Épingler', onClick: onPin })
    items.push({ label: 'Supprimer pour moi', onClick: onDeleteForMe })
    if (isMine) items.push({ label: 'Supprimer pour tous', onClick: onDeleteForAll, danger: true })
  }

  const maxX = typeof window !== 'undefined' ? window.innerWidth - 220 : x
  const left = Math.min(x, maxX)

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 190 }} onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div
        style={{
          position: 'fixed',
          top: y,
          left,
          zIndex: 191,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          minWidth: 200,
          overflow: 'hidden',
        }}
      >
        {!message.deletedForAll && (
          <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid var(--border)' }}>
            {QUICK_REACT.map((emoji) => (
              <button key={emoji} type="button" onClick={() => onReact(emoji)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>
                {emoji}
              </button>
            ))}
          </div>
        )}
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              item.onClick()
              onClose()
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '9px 14px',
              border: 'none',
              background: 'transparent',
              color: item.danger ? '#c2347f' : 'var(--text)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

function FullReactionPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <ModalShell title="Réagir" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onPick(emoji)
              onClose()
            }}
            style={{ border: 'none', background: 'var(--surface)', borderRadius: 8, padding: 8, fontSize: 20, cursor: 'pointer' }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </ModalShell>
  )
}

function DropdownMenu({ items, onClose }: { items: { label: string; onClick: () => void }[]; onClose: () => void }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onClose} />
      <div
        style={{
          position: 'relative',
          zIndex: 50,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          minWidth: 200,
          overflow: 'hidden',
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              item.onClick()
              onClose()
            }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

function ModalShell({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 16,
          padding: 22,
          width: wide ? 480 : 360,
          maxWidth: '100%',
          maxHeight: '82vh',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 14px', color: 'var(--text)' }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ onCancel, onConfirm, confirmLabel, disabled }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
      <button type="button" onClick={onCancel} style={smallButtonStyle}>
        Annuler
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        style={{ ...smallButtonStyle, background: disabled ? 'rgba(62,214,181,0.4)' : 'var(--teal-solid)', color: '#04120e', border: 'none', fontWeight: 700, cursor: disabled ? 'default' : 'pointer' }}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ModalShell title={title} onClose={onCancel}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>{message}</p>
      <ModalActions onCancel={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} />
    </ModalShell>
  )
}

function NewDirectModal({
  friends,
  onPick,
  onEmail,
  onClose,
}: {
  friends: FriendView[]
  onPick: (userId: string) => void
  onEmail: (email: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [email, setEmail] = useState('')
  const filtered = friends.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <ModalShell title="Nouvelle discussion" onClose={onClose} wide>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un ami…" style={inputStyle} autoFocus />
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
        {filtered.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun ami trouvé.</p>}
        {filtered.map((f) => (
          <button key={f.userId} type="button" onClick={() => onPick(f.userId)} style={{ ...rowButtonStyle }}>
            <Avatar userId={f.userId} name={f.name} size={32} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{f.name}</span>
          </button>
        ))}
      </div>
      <p style={sectionLabelStyle}>Ou par email</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email du contact" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
        <button
          type="button"
          onClick={() => email.trim() && onEmail(email.trim())}
          style={{ ...smallButtonStyle, background: 'var(--teal-solid)', color: '#04120e', border: 'none', fontWeight: 700 }}
        >
          Valider
        </button>
      </div>
    </ModalShell>
  )
}

function NewGroupModal({
  friends,
  onCreate,
  onClose,
}: {
  friends: FriendView[]
  onCreate: (name: string, memberIds: string[], avatarDataUrl: string | null) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const filtered = friends.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))

  function toggleMember(userId: string) {
    setMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  if (step === 2) {
    const selected = friends.filter((f) => memberIds.has(f.userId))
    return (
      <ModalShell title="Confirmer le groupe" onClose={onClose}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, cursor: 'pointer' }}>
          {avatarDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarDataUrl} alt="Avatar du groupe" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <GroupAvatar conv={{ avatar: null, name }} size={52} />
          )}
          <span style={{ fontSize: 12, color: 'var(--teal)' }}>Choisir une photo</span>
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setAvatarDataUrl(await fileToDataUrl(file))
            }}
          />
        </label>
        <p style={sectionLabelStyle}>{name}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {selected.map((f) => (
            <div key={f.userId} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', borderRadius: 999, padding: '4px 10px 4px 4px' }}>
              <Avatar userId={f.userId} name={f.name} size={22} />
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{f.name}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button type="button" onClick={() => setStep(1)} style={smallButtonStyle}>
            Retour
          </button>
          <button
            type="button"
            onClick={() => onCreate(name, [...memberIds], avatarDataUrl)}
            style={{ ...smallButtonStyle, background: 'var(--teal-solid)', color: '#04120e', border: 'none', fontWeight: 700 }}
          >
            Créer le groupe
          </button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title="Nouveau groupe" onClose={onClose} wide>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du groupe" style={inputStyle} autoFocus />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un ami…" style={inputStyle} />
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
        {filtered.map((f) => (
          <label key={f.userId} style={{ ...rowButtonStyle, cursor: 'pointer' }}>
            <input type="checkbox" checked={memberIds.has(f.userId)} onChange={() => toggleMember(f.userId)} style={{ marginRight: 4 }} />
            <Avatar userId={f.userId} name={f.name} size={32} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{f.name}</span>
          </label>
        ))}
        {filtered.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun ami trouvé.</p>}
      </div>
      <ModalActions onCancel={onClose} onConfirm={() => setStep(2)} confirmLabel="Suivant" disabled={!name.trim() || memberIds.size === 0} />
    </ModalShell>
  )
}

function FriendsPanel({
  received,
  sent,
  friends,
  newFriendIds,
  onDismissNew,
  onAction,
  onSend,
  onRemove,
  onClose,
}: {
  received: FriendRequestView[]
  sent: SentFriendRequestView[]
  friends: FriendView[]
  newFriendIds: Set<string>
  onDismissNew: (userId: string) => void
  onAction: (requestId: string, action: 'accept' | 'decline' | 'cancel') => void
  onSend: (email: string) => void
  onRemove: (friendUserId: string) => void
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  return (
    <ModalShell title="Amis" onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email d'un ami" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
        <button
          type="button"
          onClick={() => {
            if (email.trim()) {
              onSend(email.trim())
              setEmail('')
            }
          }}
          style={smallButtonStyle}
        >
          Envoyer
        </button>
      </div>

      {received.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={sectionLabelStyle}>Demandes reçues</p>
          {received.map((r) => (
            <div key={r.id} style={rowStyle}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{r.fromName}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => onAction(r.id, 'accept')} style={smallButtonStyle}>
                  Accepter
                </button>
                <button type="button" onClick={() => onAction(r.id, 'decline')} style={smallButtonStyle}>
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sent.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={sectionLabelStyle}>Demandes envoyées</p>
          {sent.map((r) => (
            <div key={r.id} style={rowStyle}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{r.toName}</span>
              <button type="button" onClick={() => onAction(r.id, 'cancel')} style={smallButtonStyle}>
                Annuler
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <p style={sectionLabelStyle}>Mes amis ({friends.length})</p>
        {friends.length === 0 && <EmptyState icon="🤝" title="Aucun ami pour le moment" subtitle="Envoie une demande par email pour commencer" />}
        {friends.map((f) => (
          <div key={f.userId} style={rowStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
              {f.name}
              {newFriendIds.has(f.userId) && (
                <button
                  type="button"
                  onClick={() => onDismissNew(f.userId)}
                  title="Marquer comme vu"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--teal)',
                    background: 'rgba(78,232,200,0.12)',
                    border: '1px solid rgba(78,232,200,0.35)',
                    borderRadius: 999,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Nouveau
                </button>
              )}
            </span>
            <button type="button" onClick={() => onRemove(f.userId)} style={smallButtonStyle}>
              Retirer
            </button>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

function GroupSettingsModal({
  conversation,
  currentUserId,
  friends,
  addMemberSearch,
  onAddMemberSearchChange,
  onAddMember,
  onRemoveMember,
  onSetRole,
  onOpenMuteDialog,
  onClearMute,
  onRename,
  onUploadAvatar,
  groupAvatarInputRef,
  onLeave,
  onDelete,
  onClose,
}: {
  conversation: ConversationView
  currentUserId: string
  friends: FriendView[]
  addMemberSearch: string
  onAddMemberSearchChange: (value: string) => void
  onAddMember: (userId: string) => void
  onRemoveMember: (userId: string) => void
  onSetRole: (userId: string, role: 'admin' | 'member') => void
  onOpenMuteDialog: (userId: string, name: string) => void
  onClearMute: (userId: string) => void
  onRename: (name: string) => void
  onUploadAvatar: (file: File) => void
  groupAvatarInputRef: React.RefObject<HTMLInputElement | null>
  onLeave: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(conversation.name || '')
  const [showAddMember, setShowAddMember] = useState(false)
  const isAdmin = conversation.members.find((m) => m.userId === currentUserId)?.role === 'admin'
  const memberIds = new Set(conversation.members.map((m) => m.userId))
  const addableFriends = friends.filter((f) => !memberIds.has(f.userId) && f.name.toLowerCase().includes(addMemberSearch.trim().toLowerCase()))

  return (
    <ModalShell title="Groupe" onClose={onClose} wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ cursor: isAdmin ? 'pointer' : 'default' }}>
          <GroupAvatar conv={conversation} size={52} />
          {isAdmin && (
            <input
              ref={groupAvatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onUploadAvatar(file)
                e.target.value = ''
              }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </label>
        {isAdmin ? (
          <div style={{ flex: 1, display: 'flex', gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
            <button
              type="button"
              onClick={() => name.trim() && name.trim() !== conversation.name && onRename(name.trim())}
              style={smallButtonStyle}
            >
              Renommer
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{conversation.name}</p>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ ...sectionLabelStyle, margin: 0 }}>Membres ({conversation.members.length})</p>
        {isAdmin && (
          <button type="button" onClick={() => setShowAddMember((v) => !v)} style={smallButtonStyle}>
            + Ajouter
          </button>
        )}
      </div>

      {showAddMember && (
        <div style={{ marginBottom: 12, background: 'var(--surface)', borderRadius: 10, padding: 10 }}>
          <input value={addMemberSearch} onChange={(e) => onAddMemberSearchChange(e.target.value)} placeholder="Rechercher un ami…" style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            {addableFriends.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun ami à ajouter.</p>}
            {addableFriends.map((f) => (
              <button key={f.userId} type="button" onClick={() => onAddMember(f.userId)} style={rowButtonStyle}>
                <Avatar userId={f.userId} name={f.name} size={28} />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        {conversation.members.map((m) => (
          <div key={m.userId} style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Avatar userId={m.userId} name={m.name} size={30} />
              <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name}
                {m.role === 'admin' && <em style={{ color: 'var(--gold)', fontStyle: 'normal', fontSize: 11 }}> · admin</em>}
                {m.muteUntilAt !== undefined && <em style={{ color: 'var(--pink)', fontStyle: 'normal', fontSize: 11 }}> · en sourdine</em>}
              </span>
            </div>
            {isAdmin && m.userId !== currentUserId && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {m.role !== 'admin' && (
                  <>
                    {m.muteUntilAt !== undefined ? (
                      <button type="button" onClick={() => onClearMute(m.userId)} style={smallButtonStyle}>
                        Réactiver
                      </button>
                    ) : (
                      <button type="button" onClick={() => onOpenMuteDialog(m.userId, m.name)} style={smallButtonStyle}>
                        Sourdine
                      </button>
                    )}
                  </>
                )}
                <button type="button" onClick={() => onSetRole(m.userId, m.role === 'admin' ? 'member' : 'admin')} style={smallButtonStyle}>
                  {m.role === 'admin' ? 'Retirer admin' : 'Nommer admin'}
                </button>
                <button type="button" onClick={() => onRemoveMember(m.userId)} style={{ ...smallButtonStyle, color: '#c2347f' }}>
                  Retirer
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onLeave} style={smallButtonStyle}>
          Quitter le groupe
        </button>
        {isAdmin && (
          <button type="button" onClick={onDelete} style={{ ...smallButtonStyle, color: '#c2347f' }}>
            Supprimer le groupe
          </button>
        )}
      </div>
    </ModalShell>
  )
}

function MuteMemberModal({ name, onApply, onClose }: { name: string; onApply: (durationMs: number | null) => void; onClose: () => void }) {
  const [durationMs, setDurationMs] = useState<number | null>(GROUP_MUTE_DURATIONS[1].ms)
  return (
    <ModalShell title={`Mettre ${name} en sourdine`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {GROUP_MUTE_DURATIONS.map((d) => (
          <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="radio" name="mute-duration" checked={durationMs === d.ms} onChange={() => setDurationMs(d.ms)} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{d.label}</span>
          </label>
        ))}
      </div>
      <ModalActions onCancel={onClose} onConfirm={() => onApply(durationMs)} confirmLabel="Mettre en sourdine" />
    </ModalShell>
  )
}

function ContactPanelModal({
  conversationId,
  member,
  online,
  lastSeenAt,
  isFriend,
  isBlocked,
  onClearHistory,
  onRemoveFriend,
  onBlock,
  onUnblock,
  onReport,
  onClose,
}: {
  conversationId: string
  member: ConversationMember
  online?: boolean
  lastSeenAt: string | null
  isFriend: boolean
  isBlocked: boolean
  onClearHistory: () => void
  onRemoveFriend: () => void
  onBlock: () => void
  onUnblock: () => void
  onReport: () => void
  onClose: () => void
}) {
  const [phone, setPhone] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ phone: string | null }>(`/api/conversations/${conversationId}/contact-phone`).then((res) => {
      if (!cancelled && res.ok) setPhone(res.data.phone)
    })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  return (
    <ModalShell title="Contact" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Avatar userId={member.userId} name={member.name} size={64} online={online} showOnline />
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{member.name}</p>
        <p style={{ fontSize: 12, color: online ? '#22c55e' : 'var(--text-faint)', margin: 0 }}>
          {online ? 'En ligne' : lastSeenAt ? `Vu ${new Date(lastSeenAt).toLocaleString('fr-FR')}` : 'Hors ligne'}
        </p>
        {phone && (
          <a href={`tel:${phone}`} style={{ fontSize: 13, color: 'var(--teal)', textDecoration: 'none' }}>
            {phone}
          </a>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" onClick={onClearHistory} style={fullRowButtonStyle}>
          Vider l&apos;historique
        </button>
        {isFriend && (
          <button type="button" onClick={onRemoveFriend} style={fullRowButtonStyle}>
            Retirer des amis
          </button>
        )}
        {isBlocked ? (
          <button type="button" onClick={onUnblock} style={fullRowButtonStyle}>
            Débloquer
          </button>
        ) : (
          <button type="button" onClick={onBlock} style={{ ...fullRowButtonStyle, color: '#c2347f' }}>
            Bloquer
          </button>
        )}
        <button type="button" onClick={onReport} style={{ ...fullRowButtonStyle, color: '#c2347f' }}>
          Signaler
        </button>
      </div>
    </ModalShell>
  )
}

function ReportModal({ target, onSubmit, onClose }: { target: { userId: string; userName: string }; onSubmit: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  return (
    <ModalShell title={`Signaler ${target.userName}`} onClose={onClose}>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Décris le problème…"
        style={{ ...inputStyle, minHeight: 90, resize: 'vertical' as const }}
        autoFocus
      />
      <ModalActions onCancel={onClose} onConfirm={() => reason.trim() && onSubmit(reason.trim())} confirmLabel="Envoyer" disabled={!reason.trim()} />
    </ModalShell>
  )
}

function StarredModal({
  messages,
  currentUserId,
  onJumpTo,
  onUnstar,
  onClose,
}: {
  messages: MessageView[]
  currentUserId: string
  onJumpTo: (conversationId: string) => void
  onUnstar: (messageId: string) => void
  onClose: () => void
}) {
  return (
    <ModalShell title="Messages importants" onClose={onClose} wide>
      {messages.length === 0 && (
        <EmptyState icon="★" title="Aucun message important" subtitle="Maintiens un message (ou clic droit) → « Marquer important »" />
      )}
      {messages.map((m) => (
        <div key={m.id} style={rowStyle}>
          <button type="button" onClick={() => onJumpTo(m.conversationId)} style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: m.senderId === currentUserId ? 'var(--teal)' : 'var(--text-muted)', margin: 0 }}>{m.senderName}</p>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.content || messageTypeLabel(m.type)}
            </p>
          </button>
          <button type="button" onClick={() => onUnstar(m.id)} style={smallButtonStyle}>
            Retirer
          </button>
        </div>
      ))}
    </ModalShell>
  )
}

function BlockedReportedModal({
  blocked,
  reports,
  onUnblock,
  onClose,
}: {
  blocked: BlockedUserView[]
  reports: MyReportView[]
  onUnblock: (userId: string) => void
  onClose: () => void
}) {
  return (
    <ModalShell title="Bloqués & signalés" onClose={onClose} wide>
      <p style={sectionLabelStyle}>Comptes bloqués ({blocked.length})</p>
      {blocked.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>Aucun compte bloqué.</p>}
      {blocked.map((b) => (
        <div key={b.userId} style={rowStyle}>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{b.name}</span>
          <button type="button" onClick={() => onUnblock(b.userId)} style={smallButtonStyle}>
            Débloquer
          </button>
        </div>
      ))}
      <p style={{ ...sectionLabelStyle, marginTop: 18 }}>Signalements envoyés ({reports.length})</p>
      {reports.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun signalement envoyé.</p>}
      {reports.map((r) => (
        <div key={r.id} style={rowStyle}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{r.targetName}</p>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</p>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{new Date(r.createdAt).toLocaleDateString('fr-FR')}</span>
        </div>
      ))}
    </ModalShell>
  )
}

function ForwardModal({
  conversations,
  currentUserId,
  picked,
  onToggle,
  onConfirm,
  onClose,
}: {
  conversations: ConversationView[]
  currentUserId: string
  picked: Set<string>
  onToggle: (conversationId: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <ModalShell title="Transférer vers…" onClose={onClose} wide>
      <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
        {conversations.map((conv) => {
          const label = conversationLabel(conv, currentUserId)
          return (
            <label key={conv.id} style={{ ...rowButtonStyle, cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.has(conv.id)} onChange={() => onToggle(conv.id)} style={{ marginRight: 4 }} />
              {conv.type === 'group' ? <GroupAvatar conv={conv} size={30} /> : <Avatar userId={conv.id} name={label} size={30} />}
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
            </label>
          )
        })}
      </div>
      <ModalActions onCancel={onClose} onConfirm={onConfirm} confirmLabel="Transférer" disabled={picked.size === 0} />
    </ModalShell>
  )
}

function PollDraftModal({
  draft,
  onChange,
  onSubmit,
  onClose,
}: {
  draft: { question: string; options: string[] }
  onChange: (next: { question: string; options: string[] }) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <ModalShell title="Nouveau sondage" onClose={onClose}>
      <input value={draft.question} onChange={(e) => onChange({ ...draft, question: e.target.value })} placeholder="Question" style={inputStyle} autoFocus />
      {draft.options.map((opt, i) => (
        <input
          key={i}
          value={opt}
          onChange={(e) => {
            const next = [...draft.options]
            next[i] = e.target.value
            onChange({ ...draft, options: next })
          }}
          placeholder={`Option ${i + 1}`}
          style={inputStyle}
        />
      ))}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {draft.options.length < 6 && (
          <button type="button" onClick={() => onChange({ ...draft, options: [...draft.options, ''] })} style={smallButtonStyle}>
            + Option
          </button>
        )}
        {draft.options.length > 2 && (
          <button type="button" onClick={() => onChange({ ...draft, options: draft.options.slice(0, -1) })} style={smallButtonStyle}>
            − Option
          </button>
        )}
      </div>
      <ModalActions onCancel={onClose} onConfirm={onSubmit} confirmLabel="Envoyer" />
    </ModalShell>
  )
}

interface EventSearchResult {
  id: string
  name: string
  date: string
  city: string | null
  image: string | null
}

// "Partager un événement" (attach menu) → sondage 'On y va ?' via POST
// /api/conversations/[id]/polls kind:'event_poll' (createEventPoll,
// lib/server/polls.ts recharge de toute façon l'Event complet, jamais depuis
// ce qui est affiché ici). Recherche débouncée sur GET /api/events/search.
function EventPickerModal({ onPick, onClose }: { onPick: (eventId: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EventSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const trimmedQuery = query.trim()

  useEffect(() => {
    // Rien à chercher pour une requête vide — les résultats affichés sont de
    // toute façon dérivés de trimmedQuery ci-dessous, jamais rendus quand
    // elle est vide (évite un setState synchrone dans le corps de l'effet).
    if (!trimmedQuery) return
    const timer = setTimeout(async () => {
      setSearching(true)
      const res = await apiFetch<{ events: EventSearchResult[] }>(`/api/events/search?q=${encodeURIComponent(trimmedQuery)}`)
      setSearching(false)
      if (res.ok) setResults(res.data.events)
    }, 350)
    return () => clearTimeout(timer)
  }, [trimmedQuery])

  const visibleResults = trimmedQuery ? results : []

  return (
    <ModalShell title="Partager un événement" onClose={onClose} wide>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un événement…" style={inputStyle} autoFocus />
      {searching && <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 8px' }}>Recherche…</p>}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {!searching && trimmedQuery && visibleResults.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun événement trouvé.</p>
        )}
        {visibleResults.map((ev) => (
          <button key={ev.id} type="button" onClick={() => onPick(ev.id)} style={{ ...rowButtonStyle, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)' }}>
              {ev.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ev.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.name}
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>{[ev.date, ev.city].filter(Boolean).join(' · ')}</p>
            </div>
          </button>
        ))}
      </div>
    </ModalShell>
  )
}

// ─────────────────────────────────── styles partagés ──────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 13,
  marginBottom: 10,
  fontFamily: 'inherit',
}

const smallButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const fullRowButtonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'left',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '7px 0',
  borderBottom: '1px solid var(--border)',
  gap: 8,
}

const rowButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '7px 4px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  margin: '0 0 8px',
}
