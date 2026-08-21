import { useCallback, useEffect, useRef } from 'react'
import type {
  ConversationListResponse,
  ConversationView,
  FriendRequestView,
  FriendView,
  SentFriendRequestView,
} from './types'

export interface ApiFetchResultOk<T> {
  ok: true
  data: T
}

export interface ApiFetchResultErr {
  ok: false
  error: string
}

export type ApiFetchLike = <T>(url: string, init?: RequestInit) => Promise<ApiFetchResultOk<T> | ApiFetchResultErr>

export async function loadConversationPage(
  apiFetch: ApiFetchLike,
  page: number,
  pageSize: number
): Promise<{ conversations: ConversationView[]; total: number } | null> {
  const result = await apiFetch<ConversationListResponse>(`/api/conversations?page=${page}&pageSize=${pageSize}`)
  if (!result.ok) return null
  return {
    conversations: result.data.conversations,
    total: result.data.total ?? result.data.conversations.length,
  }
}

export async function loadFriendDirectory(
  apiFetch: ApiFetchLike
): Promise<{ received: FriendRequestView[]; sent: SentFriendRequestView[]; friends: FriendView[] } | null> {
  const [requestsResult, friendsResult] = await Promise.all([
    apiFetch<{ received: FriendRequestView[]; sent: SentFriendRequestView[] }>('/api/friends/requests'),
    apiFetch<{ friends: FriendView[] }>('/api/friends'),
  ])
  if (!requestsResult.ok || !friendsResult.ok) return null
  return {
    received: requestsResult.data.received,
    sent: requestsResult.data.sent,
    friends: friendsResult.data.friends,
  }
}

interface UseMessagingDirectoryPollingArgs {
  apiFetch: ApiFetchLike
  conversationPage: number
  conversationPageSize: number
  onConversationsLoaded: (payload: { conversations: ConversationView[]; total: number }) => void
  onFriendsLoaded: (payload: { received: FriendRequestView[]; sent: SentFriendRequestView[]; friends: FriendView[] }) => void
}

export function useMessagingDirectoryPolling({
  apiFetch,
  conversationPage,
  conversationPageSize,
  onConversationsLoaded,
  onFriendsLoaded,
}: UseMessagingDirectoryPollingArgs) {
  const onConversationsLoadedRef = useRef(onConversationsLoaded)
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded
  })

  const onFriendsLoadedRef = useRef(onFriendsLoaded)
  useEffect(() => {
    onFriendsLoadedRef.current = onFriendsLoaded
  })

  const lastConvFetchRef = useRef<number>(0)
  const isConvFetchingRef = useRef<boolean>(false)

  const refreshConversations = useCallback(async () => {
    const now = Date.now()
    if (isConvFetchingRef.current || now - lastConvFetchRef.current < 1500) return
    isConvFetchingRef.current = true
    lastConvFetchRef.current = now
    try {
      const payload = await loadConversationPage(apiFetch, conversationPage, conversationPageSize)
      if (payload) onConversationsLoadedRef.current(payload)
    } finally {
      isConvFetchingRef.current = false
    }
  }, [apiFetch, conversationPage, conversationPageSize])

  const lastFriendFetchRef = useRef<number>(0)
  const isFriendFetchingRef = useRef<boolean>(false)

  const refreshFriendData = useCallback(async () => {
    const now = Date.now()
    if (isFriendFetchingRef.current || now - lastFriendFetchRef.current < 3000) return
    isFriendFetchingRef.current = true
    lastFriendFetchRef.current = now
    try {
      const payload = await loadFriendDirectory(apiFetch)
      if (payload) onFriendsLoadedRef.current(payload)
    } finally {
      isFriendFetchingRef.current = false
    }
  }, [apiFetch])

  useEffect(() => {
    const interval = setInterval(refreshConversations, 5000)
    return () => clearInterval(interval)
  }, [refreshConversations])

  useEffect(() => {
    const interval = setInterval(refreshFriendData, 10000)
    return () => clearInterval(interval)
  }, [refreshFriendData])

  return { refreshConversations, refreshFriendData }
}
