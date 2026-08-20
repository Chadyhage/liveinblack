'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiFetchLike } from './messagingData'
import type { ConversationView, PresenceMap, TypingUserView } from './types'

export async function sendPresenceHeartbeat(apiFetch: ApiFetchLike) {
  return apiFetch('/api/users/presence', { method: 'POST' })
}

export async function fetchPresenceMap(apiFetch: ApiFetchLike, userIds: string[]) {
  return apiFetch<{ presence: PresenceMap }>(`/api/users/presence?ids=${userIds.join(',')}`)
}

export async function fetchTypingUsers(apiFetch: ApiFetchLike, conversationId: string) {
  return apiFetch<{ users: TypingUserView[] }>(`/api/conversations/${conversationId}/typing`)
}

export async function sendTypingState(apiFetch: ApiFetchLike, conversationId: string, typing: boolean) {
  return apiFetch(`/api/conversations/${conversationId}/typing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ typing }),
  })
}

interface UseMessagingPresenceArgs {
  apiFetch: ApiFetchLike
  activeId: string | null
  conversations: ConversationView[]
  currentUserId: string
}

export function useMessagingPresence({
  apiFetch,
  activeId,
  conversations,
  currentUserId,
}: UseMessagingPresenceArgs) {
  const [typingUsers, setTypingUsers] = useState<TypingUserView[]>([])
  const [presence, setPresence] = useState<PresenceMap>({})
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdRef = useRef(activeId)

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const relevantPresenceIds = useMemo(() => {
    const ids = new Set<string>()
    for (const conversation of conversations) {
      for (const member of conversation.members) {
        if (member.userId !== currentUserId) ids.add(member.userId)
      }
    }
    return [...ids]
  }, [conversations, currentUserId])

  useEffect(() => {
    if (!activeId) return
    const interval = setInterval(async () => {
      const result = await fetchTypingUsers(apiFetch, activeId)
      if (result.ok && activeIdRef.current === activeId) setTypingUsers(result.data.users)
    }, 2500)
    return () => clearInterval(interval)
  }, [activeId, apiFetch])

  useEffect(() => {
    void sendPresenceHeartbeat(apiFetch)
    const interval = setInterval(() => void sendPresenceHeartbeat(apiFetch), 20000)
    return () => clearInterval(interval)
  }, [apiFetch])

  useEffect(() => {
    if (relevantPresenceIds.length === 0) return
    let cancelled = false
    async function poll() {
      const result = await fetchPresenceMap(apiFetch, relevantPresenceIds)
      if (result.ok && !cancelled) setPresence(result.data.presence)
    }
    void poll()
    const interval = setInterval(() => void poll(), 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [apiFetch, relevantPresenceIds])

  const notifyTyping = useCallback((conversationId: string) => {
    void sendTypingState(apiFetch, conversationId, true)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      void sendTypingState(apiFetch, conversationId, false)
    }, 2500)
  }, [apiFetch])

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [])

  return {
    typingUsers: activeId ? typingUsers : [],
    presence,
    notifyTyping,
  }
}
