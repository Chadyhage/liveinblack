export interface ConversationMember {
  userId: string
  name: string
  role: 'admin' | 'member'
  muteUntilAt?: string | null
}

export interface ConversationView {
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

export interface ConversationListResponse {
  conversations: ConversationView[]
  total?: number
  page?: number
  pageSize?: number
  hasMore?: boolean
}

export interface PollOption {
  id: string
  text: string
  voterIds: string[]
}

export interface EventSearchResult {
  id: string
  name: string
  date: string
  city: string | null
  image: string | null
}

export interface MessagePoll {
  pollType: 'poll' | 'event_poll'
  question: string
  options: PollOption[]
  event: { id: string; name: string; date: string; price: number; currency: string; image: string | null } | null
}

export type MessageType = 'text' | 'image' | 'voice' | 'poll' | 'event_poll' | 'story' | 'event' | 'catalog_item' | 'system'

export interface MessageView {
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

export interface FriendRequestView {
  id: string
  fromId: string
  fromName: string
  toId: string
  status: string
  createdAt: string
  respondedAt: string | null
}

export interface SentFriendRequestView extends FriendRequestView {
  toName: string
}

export interface FriendView {
  userId: string
  name: string
  email: string
}

export interface BlockedUserView {
  userId: string
  name: string
  email: string
}

export interface MyReportView {
  id: string
  targetId: string
  targetName: string
  reason: string
  createdAt: string
}

export interface TypingUserView {
  userId: string
  name: string
}

export type PresenceMap = Record<string, { online: boolean; lastSeenAt: string | null }>

export interface MessagesClientProps {
  currentUserId: string
  initialConversations: ConversationView[]
  initialConversationTotal: number
  initialReceived: FriendRequestView[]
  initialSent: SentFriendRequestView[]
  initialFriends: FriendView[]
  initialBlocked: BlockedUserView[]
  initialReports: MyReportView[]
  initialStarred: MessageView[]
}
