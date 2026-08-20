import { describe, expect, it, vi } from 'vitest'
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
} from '../messagingSocialActions'

describe('messagingSocialActions', () => {
  it('résout un utilisateur par email', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: { user: { id: 'u1' } } })
    await lookupUserByEmail(apiFetch, 'test@example.com')
    expect(apiFetch).toHaveBeenCalledWith('/api/users/lookup?email=test%40example.com')
  })

  it('envoie et traite une demande d’ami', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await sendFriendRequest(apiFetch, 'u1')
    await actOnFriendRequest(apiFetch, 'r1', 'accept')
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/friends/requests', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ toUserId: 'u1' }),
    }))
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/friends/requests/r1/accept', { method: 'POST' })
  })

  it('supprime un ami', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await removeFriend(apiFetch, 'u2')
    expect(apiFetch).toHaveBeenCalledWith('/api/friends/remove', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ friendUserId: 'u2' }),
    }))
  })

  it('gère blocage et déblocage', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await blockUser(apiFetch, 'u3')
    await unblockUser(apiFetch, 'u3')
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/users/block', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ targetUserId: 'u3' }),
    }))
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/users/unblock', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ targetUserId: 'u3' }),
    }))
  })

  it('liste les comptes bloqués et les signalements', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await listBlockedUsers(apiFetch)
    await listMyReports(apiFetch)
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/users/blocked')
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/users/report')
  })

  it('soumet un signalement', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await submitUserReport(apiFetch, 'u4', 'Spam')
    expect(apiFetch).toHaveBeenCalledWith('/api/users/report', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ targetUserId: 'u4', reason: 'Spam' }),
    }))
  })
})
