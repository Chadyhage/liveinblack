import { useCallback, useEffect } from 'react'
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
  const refreshConversations = useCallback(async () => {
    const payload = await loadConversationPage(apiFetch, conversationPage, conversationPageSize)
    if (payload) onConversationsLoaded(payload)
  }, [apiFetch, conversationPage, conversationPageSize, onConversationsLoaded])

  const refreshFriendData = useCallback(async () => {
    const payload = await loadFriendDirectory(apiFetch)
    if (payload) onFriendsLoaded(payload)
  }, [apiFetch, onFriendsLoaded])

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  useEffect(() => {
    const interval = setInterval(refreshConversations, 4000)
    return () => clearInterval(interval)
  }, [refreshConversations])

  useEffect(() => {
    const interval = setInterval(refreshFriendData, 8000)
    return () => clearInterval(interval)
  }, [refreshFriendData])

  return { refreshConversations, refreshFriendData }
}
