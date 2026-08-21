'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeMessagesById } from './messagingUtils'
import type { ApiFetchLike } from './messagingData'
import type { MessageView } from './types'

interface UseActiveThreadArgs {
  activeId: string | null
  apiFetch: ApiFetchLike
  onRead?: () => void
}

export async function fetchLatestThreadMessages(apiFetch: ApiFetchLike, conversationId: string) {
  return apiFetch<{ messages: MessageView[]; hasMore: boolean }>(`/api/conversations/${conversationId}/messages?limit=50`)
}

export async function fetchOlderThreadMessages(apiFetch: ApiFetchLike, conversationId: string, oldestMessageId: string) {
  return apiFetch<{ messages: MessageView[]; hasMore: boolean }>(
    `/api/conversations/${conversationId}/messages?before=${oldestMessageId}&limit=50`
  )
}

export function useActiveThread({ activeId, apiFetch, onRead }: UseActiveThreadArgs) {
  const [messages, setMessages] = useState<MessageView[]>([])
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const activeIdRef = useRef(activeId)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const fetchMessages = useCallback(async (conversationId: string) => {
    const result = await fetchLatestThreadMessages(apiFetch, conversationId)
    if (!result.ok || activeIdRef.current !== conversationId) return
    setMessages((prev) => mergeMessagesById(prev, result.data.messages))
    setHasMoreOlder(result.data.hasMore)
  }, [apiFetch])

  const loadOlderMessages = useCallback(async () => {
    const conversationId = activeIdRef.current
    if (!conversationId || loadingOlder || !hasMoreOlder || messages.length === 0) return
    const oldest = messages[0].id
    setLoadingOlder(true)
    const element = chatScrollRef.current
    const previousScrollHeight = element?.scrollHeight ?? 0
    try {
      const result = await fetchOlderThreadMessages(apiFetch, conversationId, oldest)
      if (result.ok && activeIdRef.current === conversationId) {
        setMessages((prev) => mergeMessagesById(result.data.messages, prev))
        setHasMoreOlder(result.data.hasMore)
        requestAnimationFrame(() => {
          if (element) element.scrollTop = element.scrollHeight - previousScrollHeight
        })
      }
    } finally {
      setLoadingOlder(false)
    }
  }, [apiFetch, hasMoreOlder, loadingOlder, messages])

  const onReadRef = useRef(onRead)
  useEffect(() => {
    onReadRef.current = onRead
  })

  useEffect(() => {
    if (!activeId) return
    void fetchMessages(activeId)
    void apiFetch(`/api/conversations/${activeId}/read`, { method: 'POST' }).then(() => onReadRef.current?.())
    const interval = setInterval(() => void fetchMessages(activeId), 4000)
    return () => clearInterval(interval)
  }, [activeId, apiFetch, fetchMessages])

  const [previousActiveId, setPreviousActiveId] = useState(activeId)
  if (activeId !== previousActiveId) {
    setPreviousActiveId(activeId)
    setMessages([])
    setHasMoreOlder(false)
    setShowScrollButton(false)
  }

  useEffect(() => {
    if (!showScrollButton) {
      const element = chatScrollRef.current
      if (element) element.scrollTop = element.scrollHeight
    }
  }, [messages, showScrollButton])

  const handleChatScroll = useCallback(() => {
    const element = chatScrollRef.current
    if (!element) return
    setShowScrollButton(element.scrollHeight - element.scrollTop - element.clientHeight > 120)
    if (element.scrollTop < 80) void loadOlderMessages()
  }, [loadOlderMessages])

  const scrollToBottom = useCallback(() => {
    const element = chatScrollRef.current
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    setShowScrollButton(false)
  }, [])

  return {
    messages,
    setMessages,
    hasMoreOlder,
    loadingOlder,
    showScrollButton,
    chatScrollRef,
    fetchMessages,
    loadOlderMessages,
    handleChatScroll,
    scrollToBottom,
  }
}
