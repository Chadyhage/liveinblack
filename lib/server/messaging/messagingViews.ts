export interface ConversationMemberView {
  userId: string
  name: string
  role: 'admin' | 'member'
  avatarUrl?: string | null
  muteUntilAt?: string | null
}

export interface ConversationView {
  id: string
  type: 'direct' | 'group'
  participantIds: string[]
  members: ConversationMemberView[]
  name: string | null
  avatar: string | null
  mutedUserIds: string[]
  lastMessage: string
  lastMessageAt: string | null
  lastSenderId: string | null
  pinnedMessageId: string | null
  createdAt: string
}

export interface MessagePollOptionView {
  id: string
  text: string
  voterIds: string[]
}

export interface MessagePollView {
  pollType: 'poll' | 'event_poll'
  question: string
  options: MessagePollOptionView[]
  event: { id: string; name: string; date: string; price: number; currency: string; image: string | null } | null
}

export interface MessageView {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  type: 'text' | 'image' | 'voice' | 'poll' | 'event_poll' | 'story' | 'event' | 'catalog_item' | 'system'
  content: string | null
  poll: MessagePollView | null
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

export interface ConversationSource {
  _id: unknown
  type: 'direct' | 'group'
  participantIds: string[]
  members?: { userId: string; name?: string | null; role?: 'admin' | 'member' }[]
  name?: string | null
  avatar?: string | null
  mutedUserIds?: string[]
  memberMuteUntil?: Record<string, string> | Map<string, string>
  lastMessage?: string
  lastMessageAt?: Date | string | null
  lastSenderId?: string | null
  pinnedMessageId?: string | null
  lastReadAt?: Record<string, Date | string>
  pinnedByUserIds?: string[]
  mutedConversationByUserIds?: string[]
  hiddenByUserIds?: string[]
  typingAt?: Record<string, Date | string> | Map<string, Date | string>
  createdAt: Date | string
}

export interface MessageSource {
  _id: unknown
  conversationId: string
  senderId: string
  senderName?: string | null
  type: MessageView['type']
  content?: string | null
  poll?: {
    pollType: 'poll' | 'event_poll'
    question: string
    options: { id: string; text: string; voterIds?: string[] }[]
    event?: { id: string; name?: string | null; date?: string | null; price?: number | null; currency?: string | null; image?: string | null } | null
  } | null
  reactions?: Record<string, string[]>
  readBy?: Record<string, Date | string>
  deletedForAll?: boolean
  deletedForUserIds?: string[]
  pinned?: boolean
  replyToMessageId?: string | null
  createdAt: Date | string
  editedAt?: Date | string | null
  starredByUserIds?: string[]
  forwardedFrom?: { senderName?: string | null; convName?: string | null } | null
}

export function toConversationView(conv: ConversationSource): ConversationView {
  return {
    id: String(conv._id),
    type: conv.type,
    participantIds: conv.participantIds ?? [],
    members: (conv.members ?? []).map((m) => ({ userId: m.userId, name: m.name ?? '', role: m.role ?? 'member', avatarUrl: null })),
    name: conv.name ?? null,
    avatar: conv.avatar ?? null,
    mutedUserIds: conv.mutedUserIds ?? [],
    lastMessage: conv.lastMessage ?? '',
    lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
    lastSenderId: conv.lastSenderId ?? null,
    pinnedMessageId: conv.pinnedMessageId ?? null,
    createdAt: new Date(conv.createdAt).toISOString(),
  }
}

export function readLastReadAt(source: Record<string, Date | string> | Map<string, Date | string> | undefined, userId: string): number | null {
  if (!source) return null
  const raw = source instanceof Map ? source.get(userId) : source[userId]
  if (!raw) return null
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function toMessageView(
  msg: MessageSource,
  ctx: { callerId: string; conversation: ConversationSource; readReceiptsAllowed: Map<string, boolean> }
): MessageView {
  const reactions = msg.reactions ?? {}
  const readByRaw = msg.readBy ?? {}
  const readBy: Record<string, string> = {}
  for (const [userId, at] of Object.entries(readByRaw)) readBy[userId] = new Date(at).toISOString()

  let readStatus: MessageView['readStatus'] = null
  if (msg.senderId === ctx.callerId && !msg.deletedForAll) {
    const createdAtMs = new Date(msg.createdAt).getTime()
    const callerAllows = ctx.readReceiptsAllowed.get(ctx.callerId) !== false
    const others = (ctx.conversation.participantIds ?? []).filter((id) => id !== ctx.callerId)
    const readByAnyOther =
      callerAllows &&
      others.some((id) => {
        if (ctx.readReceiptsAllowed.get(id) === false) return false
        const lastReadMs = readLastReadAt(ctx.conversation.lastReadAt, id)
        return lastReadMs !== null && lastReadMs >= createdAtMs
      })
    readStatus = readByAnyOther ? 'read' : 'sent'
  }

  return {
    id: String(msg._id),
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    senderName: msg.senderName ?? '',
    type: msg.type,
    content: msg.deletedForAll ? null : (msg.content ?? null),
    poll:
      msg.poll && !msg.deletedForAll
        ? {
            pollType: msg.poll.pollType,
            question: msg.poll.question,
            options: msg.poll.options.map((o) => ({ id: o.id, text: o.text, voterIds: [...(o.voterIds ?? [])] })),
            event: msg.poll.event
              ? {
                  id: msg.poll.event.id,
                  name: msg.poll.event.name ?? '',
                  date: msg.poll.event.date ?? '',
                  price: msg.poll.event.price ?? 0,
                  currency: msg.poll.event.currency ?? 'EUR',
                  image: msg.poll.event.image ?? null,
                }
              : null,
          }
        : null,
    reactions,
    readBy,
    deletedForAll: Boolean(msg.deletedForAll),
    pinned: Boolean(msg.pinned),
    replyToMessageId: msg.replyToMessageId ?? null,
    createdAt: new Date(msg.createdAt).toISOString(),
    editedAt: msg.editedAt ? new Date(msg.editedAt).toISOString() : null,
    starredByMe: (msg.starredByUserIds ?? []).includes(ctx.callerId),
    forwardedFrom: msg.forwardedFrom
      ? { senderName: msg.forwardedFrom.senderName ?? '', convName: msg.forwardedFrom.convName ?? '' }
      : null,
    readStatus,
  }
}
