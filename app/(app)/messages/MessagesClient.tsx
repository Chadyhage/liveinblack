'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MessageCircle,
  Search,
  Pin,
  X,
  ArrowDown,
} from 'lucide-react'
import { Button, Input, ToastViewport } from '@/app/components/ui'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import { ConfirmModal, ReportModal, ForwardModal, PollDraftModal, BlockedReportedModal, StarredModal, EventPickerModal, ConversationListPane, MessageContextMenu, FullReactionPicker, DropdownMenu, PhotoPreviewModal, CameraCaptureModal, MessagingComposer, inputStyle, NewDirectModal, NewGroupModal, FriendsPanel, GroupSettingsModal, MuteMemberModal, ContactPanelModal } from '@/app/components/features/messaging'
import {
  addConversationMember,
  clearConversationHistory,
  clearConversationMemberMute,
  createDirectConversation,
  createGroupConversation,
  deleteConversation,
  hideConversation,
  leaveConversation,
  muteConversationMember,
  removeConversationMember,
  renameConversation,
  setConversationMemberRole,
  toggleConversationMute,
  toggleConversationPin,
  uploadConversationAvatar,
} from '@/app/components/features/messaging/messagingActions'
import {
  actOnFriendRequest,
  blockUser,
  listBlockedUsers,
  listMyReports,
  lookupUserByEmail,
  removeFriend,
  sendFriendRequest,
  submitUserReport,
  unblockUser,
} from '@/app/components/features/messaging/messagingSocialActions'
import {
  compressImage,
  fileToDataUrl,
} from '@/app/components/features/messaging/messagingComposerActions'
import { useMessagingDirectoryPolling } from '@/app/components/features/messaging/messagingData'
import { useActiveThread } from '@/app/components/features/messaging/useActiveThread'
import { useMessagingPresence } from '@/app/components/features/messaging/useMessagingPresence'
import { useDesktopThreadView } from '@/app/components/features/messaging/useDesktopThreadView'
import { useMessagingMedia } from '@/app/components/features/messaging/useMessagingMedia'
import { Avatar, GroupAvatar, MessageRow, ThreadHeaderSection, TypingDots, messageTypeLabel } from '@/app/components/features/messaging/MessageThreadParts'
import type { EventSearchResult } from '@/app/components/features/messaging/EventPickerModal'
import MessagingEmptyState from '@/app/components/features/messaging/MessagingEmptyState'
import {
  applyMentionSelection,
  buildReplyPreview,
  conversationLabel,
  errorMessageFor,
  findMentionMatches,
  formatDateSeparator,
  isSameDay,
  formatMuteUntil,
  formatTime,
  mergeMessagesById,
  NEW_FRIEND_IDS_STORAGE_KEY,
  persistNewFriendIds,
} from '@/app/components/features/messaging/messagingUtils'
import type {
  ConversationMember,
  ConversationView,
  MessageView,
  MessagesClientProps,
  PollOption,
} from '@/app/components/features/messaging/types'

const CONV_PAGE_SIZE = 20
import styles from './MessagesClient.module.css'

// ─────────────────────────────────── constantes ──────────────────────────────

const GROUP_MUTE_DURATIONS: { id: string; label: string; ms: number | null }[] = [
  { id: '15m', label: '15 min', ms: 15 * 60 * 1000 },
  { id: '1h', label: '1 heure', ms: 60 * 60 * 1000 },
  { id: '8h', label: '8 heures', ms: 8 * 60 * 60 * 1000 },
  { id: '24h', label: '24 heures', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 jours', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: 'forever', label: "Jusqu'à réactivation", ms: null },
]

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

let toastSeq = 0

// ═══════════════════════════════ Composant principal ═════════════════════════

export default function MessagesClient({
  currentUserId,
  initialConversations,
  initialConversationTotal,
  initialReceived,
  initialSent,
  initialFriends,
  initialBlocked,
  initialReports,
  initialStarred,
}: MessagesClientProps) {
  const [conversations, setConversations] = useState<ConversationView[]>(initialConversations)
  // Conversation ouverte reflétée dans l'URL (?conversationId=) — un lien
  // direct vers une conversation précise doit rester partageable ET survivre
  // à un rafraîchissement de page (avant, ce paramètre n'était lu qu'une
  // fois au montage puis retiré exprès, voir l'effet de deep-link plus bas).
  const [activeIdParam, setActiveIdParam] = useQueryParamState<string>('conversationId', '')
  const activeId = activeIdParam || null
  // Ouvrir une conversation empile une entrée d'historique (push) — le
  // bouton retour doit revenir à la conversation précédente, pas quitter
  // /messages entièrement. Fermer (id=null) reste en replace : "retour"
  // après avoir fermé ne doit pas rouvrir ce qu'on vient de fermer.
  const setActiveId = (id: string | null) => setActiveIdParam(id ?? '', { push: id != null })
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
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null)
  // Suppression de groupe = perte définitive de la conversation ET de tous
  // ses messages pour tous les membres (transactionnel côté serveur) — trop
  // destructeur pour partir directement du clic, contrairement à "Quitter le
  // groupe" qui ne retire que l'appelant.
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ message: MessageView; x: number; y: number } | null>(null)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  // conversationId: null quand la photo vient du bouton caméra de l'EN-TÊTE
  // DE LISTE (aucune conversation ouverte) — il faut alors choisir le
  // destinataire dans l'aperçu avant de pouvoir envoyer.
  const [muteMemberDialog, setMuteMemberDialog] = useState<{ userId: string; name: string } | null>(null)
  const [convContextMenu, setConvContextMenu] = useState<{ conversationId: string; x: number; y: number } | null>(null)
  const [convSearch, setConvSearch] = useState('')
  const [convPage, setConvPage] = useState(1)
  const [conversationTotal, setConversationTotal] = useState(initialConversationTotal)
  const [forwardTargetPick, setForwardTargetPick] = useState<Set<string>>(new Set())

  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; preview: string } | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [inThreadSearchOpen, setInThreadSearchOpen] = useState(false)
  const [inThreadSearchQuery, setInThreadSearchQuery] = useState('')
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [addMemberSearch, setAddMemberSearch] = useState('')

  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const groupAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const pushToast = useCallback((message: string) => {
    const id = ++toastSeq
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500)
  }, [])

  // ─── Responsive : split-view desktop (>=768px) vs plein écran mobile ───
  const isDesktop = useDesktopThreadView()

  const activeIdRef = useRef(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // ─── Deep-link : /messages?conversationId=… ouvre directement le fil
  // correspondant — `activeId` vient déjà de l'URL (voir useQueryParamState
  // ci-dessus), ce lien reste maintenant valable après un rafraîchissement
  // de page (changement voulu : avant, le paramètre était retiré de l'URL
  // après un seul chargement pour ne PAS rouvrir la même conversation au
  // refresh — désormais c'est exactement le comportement recherché, un lien
  // direct doit rester partageable et stable).
  //
  // Cas d'usage d'origine (ex. "Demander ce service" sur la page publique
  // d'un prestataire, voir ProviderCatalogInquiry.tsx) : la conversation
  // vient d'être créée côté serveur juste avant la navigation vers cette


  // ─── Polling : conversations, amis, messages, frappe, présence ───
  const { refreshConversations, refreshFriendData } = useMessagingDirectoryPolling({
    apiFetch,
    conversationPage: convPage,
    conversationPageSize: CONV_PAGE_SIZE,
    onConversationsLoaded: ({ conversations: nextConversations, total }) => {
      setConversations(nextConversations)
      setConversationTotal(total)
    },
    onFriendsLoaded: ({ received: nextReceived, sent: nextSent, friends: nextFriends }) => {
      setReceived(nextReceived)
      setSent(nextSent)
      setFriends(nextFriends)
    },
  })
  const {
    messages,
    setMessages,
    loadingOlder,
    showScrollButton,
    chatScrollRef,
    fetchMessages,
    handleChatScroll,
    scrollToBottom,
  } = useActiveThread({
    activeId,
    apiFetch,
    onRead: refreshConversations,
  })

  const {
    typingUsers,
    presence,
    notifyTyping,
  } = useMessagingPresence({
    apiFetch,
    activeId,
    conversations,
    currentUserId,
  })

  // Réinitialise l'état propre au FIL à chaque changement de conversation —
  // tout ce qui ne relève pas du chargement/polling du fil lui-même.
  const [prevActiveId, setPrevActiveId] = useState(activeId)
  if (activeId !== prevActiveId) {
    setPrevActiveId(activeId)
    setReplyTo(null)
    setEditingMessageId(null)
    setComposerText('')
    setInThreadSearchOpen(false)
    setInThreadSearchQuery('')
    setContextMenu(null)
  }

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null

  const {
    photoPreview,
    setPhotoPreview,
    photoPreviewPickedConv,
    setPhotoPreviewPickedConv,
    showCamera,
    showAttachMenu,
    isRecording,
    isRecordingPaused,
    recordDuration,
    videoRef,
    openAttachMenu,
    closeAttachMenu,
    handlePhotoFileChange,
    openCamera,
    closeCamera,
    capturePhoto,
    handleSendPhoto,
    handleMicPointerDown,
    handleMicPointerUp,
    stopRecording,
    toggleRecordingPause,
  } = useMessagingMedia({
    apiFetch,
    activeId,
    replyTo,
    setReplyTo,
    setMessages,
    refreshConversations,
    openConversation,
    pushToast,
    setBusy,
  })

  function openConversation(id: string) {
    setActiveId(id)
    setMobileView('thread')
  }

  // ─── Composeur : envoi texte / édition ───
  function handleInputChange(value: string) {
    setComposerText(value)
    if (!activeId || editingMessageId) return
    notifyTyping(activeId)
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
      setMessages((prev) => mergeMessagesById(prev, [res.data.message]))
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
    setReplyTo({ id: msg.id, senderName: msg.senderName, preview: buildReplyPreview(msg) })
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
  const mentionMatches = findMentionMatches({
    conversationType: activeConversation?.type ?? null,
    editingMessageId,
    composerText,
    members: activeConversation?.members ?? [],
    currentUserId,
  })
  function applyMention(member: ConversationMember) {
    setComposerText((prev) => applyMentionSelection(prev, member.name))
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
    setMessages((prev) => mergeMessagesById(prev, [res.data.message]))
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
    setMessages((prev) => mergeMessagesById(prev, [res.data.message]))
    setShowEventPicker(false)
    refreshConversations()
  }

  // Partage DIRECT d'un événement (carte cliquable, EventCard) — distinct de
  // handleCreateEventPoll ci-dessus (sondage "On y va ?"). Avant ce correctif,
  // "Partager un événement" ne menait QU'au sondage : aucun chemin serveur
  // n'existait pour un message de type 'event' (voir SENDABLE_TYPES,
  // lib/server/messaging.ts) — d'où le retour client "le partage
  // d'événements ne marche pas".
  async function handleShareEvent(eventId: string) {
    if (!activeId) return
    const res = await apiFetch<{ message: MessageView }>(`/api/conversations/${activeId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'event', content: '', eventId, replyToMessageId: replyTo?.id ?? undefined }),
    })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setMessages((prev) => mergeMessagesById(prev, [res.data.message]))
    setReplyTo(null)
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

  // ─── Nouvelle conversation directe (parmi les amis, ou par email) ───
  async function handleStartDirectConversation(otherUserId: string) {
    const res = await createDirectConversation(apiFetch, otherUserId)
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
    const res = await createGroupConversation(apiFetch, name, memberIds)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    if (avatarDataUrl) {
      const compressed = await compressImage(avatarDataUrl, 500, 0.85)
      await uploadConversationAvatar(apiFetch, res.data.conversation.id, compressed)
    }
    setPanel('none')
    await refreshConversations()
    openConversation(res.data.conversation.id)
  }

  // ─── Groupe : quitter / supprimer / renommer / avatar / admin ───
  async function handleLeaveGroup() {
    if (!activeId) return
    const res = await leaveConversation(apiFetch, activeId)
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
    const res = await deleteConversation(apiFetch, activeId)
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
    const res = await renameConversation(apiFetch, activeId, name)
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  async function handleUploadGroupAvatar(file: File) {
    if (!activeId) return
    const dataUrl = await fileToDataUrl(file)
    const compressed = await compressImage(dataUrl, 500, 0.85)
    const res = await uploadConversationAvatar(apiFetch, activeId, compressed)
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  async function handleAddMember(userId: string) {
    if (!activeId) return
    const res = await addConversationMember(apiFetch, activeId, userId)
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else {
      refreshConversations()
      setAddMemberSearch('')
      pushToast('Membre ajouté')
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!activeId) return
    const res = await removeConversationMember(apiFetch, activeId, userId)
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  async function handleSetMemberRole(userId: string, role: 'admin' | 'member') {
    if (!activeId) return
    const res = await setConversationMemberRole(apiFetch, activeId, userId, role)
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  async function handleApplyMemberMute(durationMs: number | null) {
    if (!activeId || !muteMemberDialog) return
    const res = await muteConversationMember(apiFetch, activeId, muteMemberDialog.userId, durationMs)
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
    const res = await clearConversationMemberMute(apiFetch, activeId, userId)
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
  }

  // ─── Conversation : épingler / masquer / couper notifs / vider historique ───
  async function handleToggleConvPin(conv: ConversationView) {
    const res = await toggleConversationPin(apiFetch, conv.id, conv.pinned)
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
    setConvContextMenu(null)
  }

  async function handleToggleConvMute(conv: ConversationView) {
    const res = await toggleConversationMute(apiFetch, conv.id, conv.mutedForMe)
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else refreshConversations()
    setConvContextMenu(null)
  }

  async function handleHideConversation(conversationId: string) {
    const res = await hideConversation(apiFetch, conversationId)
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
    const res = await clearConversationHistory(apiFetch, activeId)
    if (!res.ok) pushToast(errorMessageFor(res.error))
    else {
      setMessages([])
      pushToast('Historique vidé')
    }
  }

  // ─── Amis / blocage / signalement ───
  async function handleSendFriendRequest(email: string) {
    const lookup = await lookupUserByEmail(apiFetch, email)
    if (!lookup.ok) {
      pushToast(errorMessageFor(lookup.error))
      return false
    }
    const res = await sendFriendRequest(apiFetch, lookup.data.user.id)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return false
    }
    pushToast(res.data.status === 'friends' ? 'Vous êtes maintenant amis !' : 'Demande envoyée.')
    refreshFriendData()
    return true
  }

  async function handleFriendRequestAction(requestId: string, action: 'accept' | 'decline' | 'cancel') {
    const res = await actOnFriendRequest(apiFetch, requestId, action)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    refreshFriendData()
  }

  async function handleRemoveFriend(friendUserId: string) {
    const res = await removeFriend(apiFetch, friendUserId)
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
    const res = await blockUser(apiFetch, userId)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    pushToast('Compte bloqué.')
    const blockedRes = await listBlockedUsers(apiFetch)
    if (blockedRes.ok) setBlocked(blockedRes.data.blocked)
  }

  async function handleUnblock(userId: string) {
    const res = await unblockUser(apiFetch, userId)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setBlocked((prev) => prev.filter((b) => b.userId !== userId))
    pushToast('Compte débloqué.')
  }

  async function handleSubmitReport(userId: string, userName: string, reason: string) {
    const res = await submitUserReport(apiFetch, userId, reason)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    setReportTarget(null)
    setBlockAfterReport({ userId, userName })
    const reportsRes = await listMyReports(apiFetch)
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

  const convPageCount = Math.max(1, Math.ceil((conversationTotal || 0) / CONV_PAGE_SIZE))

  const visibleMessages = inThreadSearchOpen && inThreadSearchQuery.trim()
    ? messages.filter((m) => (m.content || '').toLowerCase().includes(inThreadSearchQuery.trim().toLowerCase()))
    : messages

  const conversationAvatarSize = 34
  const showListPane = isDesktop || mobileView === 'list'
  const showThreadPane = isDesktop || mobileView === 'thread'
  const avatarUrlFor = (userId: string) => conversations.flatMap((conversation) => conversation.members).find((member) => member.userId === userId)?.avatarUrl ?? friends.find((friend) => friend.userId === userId)?.avatarUrl ?? null

  return (
    <main className={styles.root}>
      {showListPane && (
        <aside
          className={styles.listPane}
          style={{
            width: isDesktop && conversations.length > 0 ? 340 : '100%',
            flexShrink: 0,
            borderRight: isDesktop && conversations.length > 0 ? '1px solid var(--border)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <ConversationListPane
            currentUserId={currentUserId}
            conversations={conversations}
            filteredConversations={filteredConversations}
            activeId={activeId}
            convSearch={convSearch}
            onConvSearchChange={(value) => {
              setConvSearch(value)
              setConvPage(1)
            }}
            onOpenConversation={openConversation}
            onConversationContextMenu={(conversationId, x, y) => setConvContextMenu({ conversationId, x, y })}
            conversationLabel={conversationLabel}
            renderAvatar={(conv, label, online) =>
              conv.type === 'group'
                ? <GroupAvatar conv={conv} size={conversationAvatarSize} />
                : (() => { const member = conv.members.find((m) => m.userId !== currentUserId); return <Avatar userId={member?.userId ?? ''} name={label} size={conversationAvatarSize} src={member?.avatarUrl} online={online} showOnline /> })()
            }
            presenceOnlineFor={(userId) => (userId ? Boolean(presence[userId]?.online) : false)}
            formatTime={formatTime}
            convPage={convPage}
            convPageCount={convPageCount}
            conversationTotal={conversationTotal}
            pageSize={CONV_PAGE_SIZE}
            onConvPageChange={setConvPage}
            toolbar={
              <>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setPanel('friends')}
                  style={{ borderRadius: 14, fontWeight: 650, textTransform: 'none', letterSpacing: 'normal' }}
                >
                  Amis
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setPanel('newGroup')}
                  style={{ borderRadius: 14, fontWeight: 650, textTransform: 'none', letterSpacing: 'normal' }}
                >
                  Nouveau groupe
                </Button>
              </>
            }
          />
        </aside>
      )}

      {showThreadPane && conversations.length > 0 && (
        <section className={styles.threadPane} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
          {!activeConversation ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessagingEmptyState icon={<MessageCircle size={32} />} title="Choisis une conversation" subtitle="Sélectionne un contact ou un groupe pour commencer à discuter" />
            </div>
          ) : (
            <>
              <ThreadHeaderSection
                conversation={activeConversation}
                currentUserId={currentUserId}
                presence={presence}
                isDesktop={isDesktop}
                onBack={() => {
                  setMobileView('list')
                  setActiveId(null)
                }}
                onOpenSearch={() => setInThreadSearchOpen((v) => !v)}
                onOpenGroupSettings={() => setPanel('groupSettings')}
                onOpenContactPanel={() => setPanel('contactPanel')}
              />

              {inThreadSearchOpen && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <Input
                    autoFocus
                    value={inThreadSearchQuery}
                    onChange={(e) => setInThreadSearchQuery(e.target.value)}
                    placeholder="Rechercher dans la conversation…"
                    style={{ ...inputStyle, marginBottom: 3 }}
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
                    {inThreadSearchQuery.trim() ? `${visibleMessages.length} résultat${visibleMessages.length !== 1 ? 's' : ''}` : 'Tape pour rechercher'}
                  </p>
                </div>
              )}

              {activeConversation.pinnedMessageId && pinnedMessage && (
                <div
                  style={{
                    padding: '6px 12px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    background: 'var(--surface)',
                    cursor: 'pointer',
                  }}
                  onClick={() => scrollToMessage(pinnedMessage.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span><Pin size={14} /></span>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pinnedMessage.deletedForAll ? 'Message supprimé' : pinnedMessage.content || messageTypeLabel(pinnedMessage.type)}
                    </p>
                  </div>
                  {amAdmin && (
                    <Button
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTogglePin(pinnedMessage)
                      }}
                      style={{ color: 'var(--text-faint)', fontSize: 13, padding: 0 }}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              )}

              <div ref={chatScrollRef} onScroll={handleChatScroll} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', position: 'relative' }}>
                {loadingOlder && (
                  <div style={{ textAlign: 'center', padding: '2px 0 6px' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Chargement des messages précédents…</span>
                  </div>
                )}
                {visibleMessages.length === 0 && inThreadSearchOpen && inThreadSearchQuery.trim() && (
                  <MessagingEmptyState icon={<Search size={32} />} title="Aucun résultat" subtitle="Aucun message ne correspond à ta recherche" />
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
                          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 3px' }}>
                    <TypingDots />
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {typingUsers.map((u) => u.name).join(', ')} écri{typingUsers.length > 1 ? 'vent' : 't'}…
                    </span>
                  </div>
                )}
              </div>

              {showScrollButton && (
                <Button
                  variant="secondary"
                  aria-label="Défiler vers le bas"
                  onClick={scrollToBottom}
                  style={{
                    position: 'absolute',
                    right: isDesktop ? 28 : 14,
                    bottom: 88,
                    width: 38,
                    height: 38,
                    minWidth: 38,
                    minHeight: 38,
                    padding: 0,
                    borderRadius: '50%',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                >
                  <ArrowDown size={16} />
                </Button>
              )}

              {myGroupMute ? (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--pink)', margin: 0 }}>
                    Un administrateur t&apos;a mis en sourdine {formatMuteUntil(myGroupMute.untilAt)}.
                  </p>
                </div>
              ) : isBlockedByMe ? (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
                    Tu as bloqué ce contact —{' '}
                    <Button
                      variant="link"
                      onClick={() => otherDirectMember && handleUnblock(otherDirectMember.userId)}
                      style={{ fontSize: 12 }}
                    >
                      débloquer
                    </Button>
                  </p>
                </div>
              ) : (
                <MessagingComposer
                  mentionMatches={mentionMatches}
                  onApplyMention={applyMention}
                  editingMessage={Boolean(editingMessageId)}
                  onCancelEdit={handleEditCancel}
                  replyTo={replyTo}
                  onCancelReply={() => setReplyTo(null)}
                  isRecording={isRecording}
                  isRecordingPaused={isRecordingPaused}
                  recordDuration={recordDuration}
                  onCancelRecording={() => stopRecording(false)}
                  onSendRecording={() => stopRecording(true)}
                  onToggleRecordingPause={toggleRecordingPause}
                  onOpenAttachMenu={openAttachMenu}
                  showAttachMenu={showAttachMenu}
                  onCloseAttachMenu={closeAttachMenu}
                  onOpenPhotoPicker={() => fileInputRef.current?.click()}
                  onOpenCamera={openCamera}
                  onOpenPoll={() => setPollDraft({ question: '', options: ['', ''] })}
                  onOpenEventShare={() => setShowEventPicker(true)}
                  fileInputRef={fileInputRef}
                  onPhotoFileChange={handlePhotoFileChange}
                  activeConversationId={activeId}
                  composerText={composerText}
                  onComposerChange={handleInputChange}
                  onComposerKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  onSendText={handleSend}
                  busy={busy}
                  editingMessageId={editingMessageId}
                  onMicPointerDown={handleMicPointerDown}
                  onMicPointerUp={handleMicPointerUp}
                />
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
          onDeleteForMe={() =>
            setPendingConfirm({
              title: 'Supprimer pour moi',
              message: 'Ce message disparaîtra uniquement de ta conversation.',
              confirmLabel: 'Supprimer',
              onConfirm: () => { void handleDeleteForMe(contextMenu.message.id) },
            })
          }
          onDeleteForAll={() =>
            setPendingConfirm({
              title: 'Supprimer pour tous',
              message: 'Ce message sera retiré définitivement pour tous les membres de la conversation.',
              confirmLabel: 'Supprimer',
              onConfirm: () => { void handleDeleteForAll(contextMenu.message.id) },
            })
          }
        />
      )}

      {/* ─── Menu contextuel de conversation ─── */}
      {convContextMenu &&
        (() => {
          const conv = conversations.find((c) => c.id === convContextMenu.conversationId)
          if (!conv) return null
          return (
            <>
              <div style={{ position: 'fixed', top: convContextMenu.y, left: convContextMenu.x, zIndex: 191 }}>
                <DropdownMenu
                  onClose={() => setConvContextMenu(null)}
                  items={[
                    { label: conv.pinned ? 'Désépingler' : 'Épingler', onClick: () => handleToggleConvPin(conv) },
                    { label: conv.mutedForMe ? 'Réactiver les notifications' : 'Couper les notifications', onClick: () => handleToggleConvMute(conv) },
                    {
                      label: 'Masquer la conversation',
                      onClick: () =>
                        setPendingConfirm({
                          title: 'Masquer la conversation',
                          message: 'Cette conversation disparaîtra de ta liste principale. Tu pourras la retrouver plus tard si nécessaire.',
                          confirmLabel: 'Masquer',
                          onConfirm: () => { void handleHideConversation(conv.id) },
                        }),
                    },
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
        <NewDirectModal
          friends={friends}
          onPick={handleStartDirectConversation}
          onEmail={handleStartDirectConversationByEmail}
          onClose={() => setPanel('none')}
          renderAvatar={(userId, name, size = 40) => <Avatar userId={userId} name={name} size={size} src={avatarUrlFor(userId)} online={Boolean(presence[userId]?.online)} showOnline />}
        />
      )}
      {panel === 'newGroup' && (
        <NewGroupModal
          friends={friends}
          onCreate={handleCreateGroup}
          onClose={() => setPanel('none')}
          onGoToFriends={() => setPanel('friends')}
          onPickAvatar={async (file) => compressImage(await fileToDataUrl(file))}
          renderAvatar={(userId, name, size = 40) => <Avatar userId={userId} name={name} size={size} src={avatarUrlFor(userId)} online={Boolean(presence[userId]?.online)} showOnline />}
          renderGroupAvatar={(name, avatar, size = 40) => (
            <GroupAvatar conv={{ name, avatar }} size={size} />
          )}
        />
      )}
      {panel === 'friends' && (
        <FriendsPanel
          received={received}
          sent={sent}
          friends={friends}
          newFriendIds={newFriendIds}
          onDismissNew={handleDismissNewFriend}
          onAction={handleFriendRequestAction}
          onSend={handleSendFriendRequest}
          renderAvatar={(userId, name, size = 40) => <Avatar userId={userId} name={name} size={size} src={avatarUrlFor(userId)} online={Boolean(presence[userId]?.online)} showOnline />}
          onRemove={(userId, name) =>
            setPendingConfirm({
              title: 'Retirer ce contact',
              message: `${name} sera retiré de ta liste d'amis.`,
              confirmLabel: 'Retirer',
              onConfirm: () => { void handleRemoveFriend(userId) },
            })
          }
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
          onRemoveMember={(userId, name) =>
            setPendingConfirm({
              title: 'Retirer ce membre',
              message: `${name} sera retiré du groupe et perdra l'accès à cette conversation.`,
              confirmLabel: 'Retirer',
              onConfirm: () => { void handleRemoveMember(userId) },
            })
          }
          onSetRole={handleSetMemberRole}
          onOpenMuteDialog={(userId, name) => setMuteMemberDialog({ userId, name })}
          onClearMute={handleClearMemberMute}
          onRename={handleRenameGroup}
          onUploadAvatar={handleUploadGroupAvatar}
          groupAvatarInputRef={groupAvatarInputRef}
          renderAvatar={(userId, name, size = 40) => <Avatar userId={userId} name={name} size={size} src={avatarUrlFor(userId)} online={Boolean(presence[userId]?.online)} showOnline />}
          renderGroupAvatar={(name, avatar, size = 40) => <GroupAvatar conv={{ name, avatar }} size={size} />}
          onLeave={() =>
            setPendingConfirm({
              title: 'Quitter le groupe',
              message: 'Tu quitteras cette conversation et tu ne recevras plus ses nouveaux messages.',
              confirmLabel: 'Quitter',
              onConfirm: () => { void handleLeaveGroup() },
            })
          }
          onDelete={() => setDeleteGroupConfirm(true)}
          onClose={() => setPanel('none')}
        />
      )}
      {deleteGroupConfirm && (
        <ConfirmModal
          title="Supprimer le groupe"
          message="Le groupe et tous ses messages seront supprimés définitivement pour tous les membres. Cette action est irréversible."
          confirmLabel="Supprimer"
          onConfirm={() => {
            setDeleteGroupConfirm(false)
            handleDeleteGroup()
          }}
          onCancel={() => setDeleteGroupConfirm(false)}
        />
      )}
      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          onConfirm={() => {
            const run = pendingConfirm.onConfirm
            setPendingConfirm(null)
            run()
          }}
          onCancel={() => setPendingConfirm(null)}
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
          onClearHistory={() =>
            setPendingConfirm({
              title: 'Vider l’historique',
              message: 'Tous les messages de cette conversation seront supprimés de ton historique.',
              confirmLabel: 'Vider',
              onConfirm: () => { void handleClearHistory() },
            })
          }
          onRemoveFriend={() =>
            setPendingConfirm({
              title: 'Retirer ce contact',
              message: `${otherDirectMember.name} sera retiré de ta liste d'amis.`,
              confirmLabel: 'Retirer',
              onConfirm: () => { void handleRemoveFriend(otherDirectMember.userId) },
            })
          }
          onBlock={() =>
            setPendingConfirm({
              title: 'Bloquer ce compte',
              message: `${otherDirectMember.name} ne pourra plus te contacter tant que ce blocage restera actif.`,
              confirmLabel: 'Bloquer',
              onConfirm: () => { void handleBlock(otherDirectMember.userId) },
            })
          }
          onUnblock={() =>
            setPendingConfirm({
              title: 'Débloquer ce compte',
              message: `${otherDirectMember.name} pourra à nouveau te contacter si vous reprenez la conversation.`,
              confirmLabel: 'Débloquer',
              onConfirm: () => { void handleUnblock(otherDirectMember.userId) },
            })
          }
          onReport={() => setReportTarget({ userId: otherDirectMember.userId, userName: otherDirectMember.name })}
          onLoadPhone={async (conversationId) => {
            const res = await apiFetch<{ phone: string | null }>(`/api/conversations/${conversationId}/contact-phone`)
            return res.ok ? res.data.phone : null
          }}
          renderAvatar={(userId, name, size = 40, online = false, showOnline = false) => (
            <Avatar userId={userId} name={name} size={size} src={avatarUrlFor(userId)} online={online} showOnline={showOnline} />
          )}
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
          messageTypeLabel={messageTypeLabel}
        />
      )}
      {panel === 'blockedReported' && (
        <BlockedReportedModal
          blocked={blocked}
          reports={reports}
          onUnblock={(userId, name) =>
            setPendingConfirm({
              title: 'Débloquer ce compte',
              message: `${name} pourra à nouveau te contacter si vous reprenez la conversation.`,
              confirmLabel: 'Débloquer',
              onConfirm: () => { void handleUnblock(userId) },
            })
          }
          onClose={() => setPanel('none')}
        />
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
        <MuteMemberModal name={muteMemberDialog.name} durations={GROUP_MUTE_DURATIONS} onApply={handleApplyMemberMute} onClose={() => setMuteMemberDialog(null)} />
      )}

      {pollDraft && <PollDraftModal draft={pollDraft} onChange={setPollDraft} onSubmit={handleCreatePoll} onClose={() => setPollDraft(null)} />}

      {showEventPicker && (
        <EventPickerModal
          onShare={handleShareEvent}
          onPoll={handleCreateEventPoll}
          onClose={() => setShowEventPicker(false)}
          searchEvents={async (query) => {
            const res = await apiFetch<{ events: EventSearchResult[] }>(`/api/events/search?q=${encodeURIComponent(query)}`)
            return res.ok ? res.data.events : []
          }}
        />
      )}

      {photoPreview ? (
        <PhotoPreviewModal
          photoPreview={photoPreview}
          photoPreviewPickedConv={photoPreviewPickedConv}
          conversations={conversations}
          currentUserId={currentUserId}
          onPickConversation={setPhotoPreviewPickedConv}
          onCancel={() => setPhotoPreview(null)}
          onConfirm={handleSendPhoto}
        />
      ) : null}

      {showCamera ? <CameraCaptureModal videoRef={videoRef} onClose={closeCamera} onCapture={capturePhoto} /> : null}

      <ToastViewport items={toasts.map((toast) => ({ id: toast.id, message: toast.message, kind: 'info' }))} />

      <style>{`
        @keyframes lib-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes lib-bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-3px); } }
      `}</style>
    </main>
  )
}
