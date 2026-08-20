import { describe, expect, it, vi } from 'vitest'
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
} from '../messagingActions'

describe('messagingActions', () => {
  it('crée une conversation directe', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: { conversation: { id: 'c1' } } })
    await createDirectConversation(apiFetch, 'u1')
    expect(apiFetch).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ otherUserId: 'u1' }),
    }))
  })

  it('crée un groupe', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: { conversation: { id: 'g1' } } })
    await createGroupConversation(apiFetch, 'Staff', ['u1', 'u2'])
    expect(apiFetch).toHaveBeenCalledWith('/api/conversations/groups', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Staff', memberUserIds: ['u1', 'u2'] }),
    }))
  })

  it('renomme et téléverse un avatar de conversation', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await renameConversation(apiFetch, 'c1', 'Nouveau nom')
    await uploadConversationAvatar(apiFetch, 'c1', 'data:image/jpeg;base64,abc')
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/conversations/c1/rename', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Nouveau nom' }),
    }))
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/conversations/c1/avatar', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ dataUri: 'data:image/jpeg;base64,abc' }),
    }))
  })

  it('gère les membres et leur rôle', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await addConversationMember(apiFetch, 'c1', 'u2')
    await removeConversationMember(apiFetch, 'c1', 'u2')
    await setConversationMemberRole(apiFetch, 'c1', 'u2', 'admin')
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/conversations/c1/members', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    }))
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/conversations/c1/members/u2', { method: 'DELETE' })
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/api/conversations/c1/members/u2/role', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ role: 'admin' }),
    }))
  })

  it('gère le mute membre et son retrait', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await muteConversationMember(apiFetch, 'c1', 'u2', 60000)
    await clearConversationMemberMute(apiFetch, 'c1', 'u2')
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/conversations/c1/members/u2/mute', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ durationMs: 60000 }),
    }))
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/conversations/c1/members/u2/mute', { method: 'DELETE' })
  })

  it('gère pin/mute/hide/clear/leave/delete d’une conversation', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await toggleConversationPin(apiFetch, 'c1', false)
    await toggleConversationPin(apiFetch, 'c1', true)
    await toggleConversationMute(apiFetch, 'c1', false)
    await toggleConversationMute(apiFetch, 'c1', true)
    await hideConversation(apiFetch, 'c1')
    await clearConversationHistory(apiFetch, 'c1')
    await leaveConversation(apiFetch, 'c1')
    await deleteConversation(apiFetch, 'c1')
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/conversations/c1/pin', { method: 'POST' })
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/conversations/c1/pin', { method: 'DELETE' })
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/api/conversations/c1/mute', { method: 'POST' })
    expect(apiFetch).toHaveBeenNthCalledWith(4, '/api/conversations/c1/mute', { method: 'DELETE' })
    expect(apiFetch).toHaveBeenNthCalledWith(5, '/api/conversations/c1/hide', { method: 'POST' })
    expect(apiFetch).toHaveBeenNthCalledWith(6, '/api/conversations/c1/clear', { method: 'POST' })
    expect(apiFetch).toHaveBeenNthCalledWith(7, '/api/conversations/c1/leave', { method: 'POST' })
    expect(apiFetch).toHaveBeenNthCalledWith(8, '/api/conversations/c1', { method: 'DELETE' })
  })
})
