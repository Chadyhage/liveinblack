import { describe, expect, it, vi } from 'vitest'
import {
  fetchPresenceMap,
  fetchTypingUsers,
  sendPresenceHeartbeat,
  sendTypingState,
} from '../useMessagingPresence'

describe('useMessagingPresence helpers', () => {
  it('envoie le heartbeat de présence', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await sendPresenceHeartbeat(apiFetch)
    expect(apiFetch).toHaveBeenCalledWith('/api/users/presence', { method: 'POST' })
  })

  it('charge la présence avec la bonne liste d’identifiants', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: { presence: { u1: { online: true, lastSeenAt: null } } } })
    await fetchPresenceMap(apiFetch, ['u1', 'u2'])
    expect(apiFetch).toHaveBeenCalledWith('/api/users/presence?ids=u1,u2')
  })

  it('charge les utilisateurs en train d’écrire pour une conversation', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: { users: [{ userId: 'u1', name: 'Awa' }] } })
    await fetchTypingUsers(apiFetch, 'c42')
    expect(apiFetch).toHaveBeenCalledWith('/api/conversations/c42/typing')
  })

  it('envoie correctement l’état de frappe', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    await sendTypingState(apiFetch, 'c42', true)
    expect(apiFetch).toHaveBeenCalledWith('/api/conversations/c42/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typing: true }),
    })
  })
})
