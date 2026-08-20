import type { ApiFetchLike } from './messagingData'
import type { ConversationView } from './types'

export async function createDirectConversation(apiFetch: ApiFetchLike, otherUserId: string) {
  return apiFetch<{ conversation: ConversationView }>('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otherUserId }),
  })
}

export async function createGroupConversation(
  apiFetch: ApiFetchLike,
  name: string,
  memberUserIds: string[]
) {
  return apiFetch<{ conversation: ConversationView }>('/api/conversations/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, memberUserIds }),
  })
}

export async function leaveConversation(apiFetch: ApiFetchLike, conversationId: string) {
  return apiFetch(`/api/conversations/${conversationId}/leave`, { method: 'POST' })
}

export async function deleteConversation(apiFetch: ApiFetchLike, conversationId: string) {
  return apiFetch(`/api/conversations/${conversationId}`, { method: 'DELETE' })
}

export async function renameConversation(apiFetch: ApiFetchLike, conversationId: string, name: string) {
  return apiFetch<{ name: string }>(`/api/conversations/${conversationId}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function uploadConversationAvatar(apiFetch: ApiFetchLike, conversationId: string, dataUri: string) {
  return apiFetch<{ avatar: string }>(`/api/conversations/${conversationId}/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUri }),
  })
}

export async function addConversationMember(apiFetch: ApiFetchLike, conversationId: string, userId: string) {
  return apiFetch(`/api/conversations/${conversationId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
}

export async function removeConversationMember(apiFetch: ApiFetchLike, conversationId: string, userId: string) {
  return apiFetch(`/api/conversations/${conversationId}/members/${userId}`, { method: 'DELETE' })
}

export async function setConversationMemberRole(
  apiFetch: ApiFetchLike,
  conversationId: string,
  userId: string,
  role: 'admin' | 'member'
) {
  return apiFetch(`/api/conversations/${conversationId}/members/${userId}/role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
}

export async function muteConversationMember(
  apiFetch: ApiFetchLike,
  conversationId: string,
  userId: string,
  durationMs: number | null
) {
  return apiFetch<{ untilAtMs: number | null }>(`/api/conversations/${conversationId}/members/${userId}/mute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ durationMs }),
  })
}

export async function clearConversationMemberMute(apiFetch: ApiFetchLike, conversationId: string, userId: string) {
  return apiFetch(`/api/conversations/${conversationId}/members/${userId}/mute`, { method: 'DELETE' })
}

export async function toggleConversationPin(apiFetch: ApiFetchLike, conversationId: string, pinned: boolean) {
  return pinned
    ? apiFetch(`/api/conversations/${conversationId}/pin`, { method: 'DELETE' })
    : apiFetch(`/api/conversations/${conversationId}/pin`, { method: 'POST' })
}

export async function toggleConversationMute(apiFetch: ApiFetchLike, conversationId: string, mutedForMe: boolean) {
  return mutedForMe
    ? apiFetch(`/api/conversations/${conversationId}/mute`, { method: 'DELETE' })
    : apiFetch(`/api/conversations/${conversationId}/mute`, { method: 'POST' })
}

export async function hideConversation(apiFetch: ApiFetchLike, conversationId: string) {
  return apiFetch(`/api/conversations/${conversationId}/hide`, { method: 'POST' })
}

export async function clearConversationHistory(apiFetch: ApiFetchLike, conversationId: string) {
  return apiFetch(`/api/conversations/${conversationId}/clear`, { method: 'POST' })
}
