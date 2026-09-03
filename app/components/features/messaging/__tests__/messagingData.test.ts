import { describe, expect, it, vi } from 'vitest'
import { loadConversationPage, loadFriendDirectory, type ApiFetchLike } from '../messagingData'

describe('messagingData', () => {
  it('charge une page de conversations avec un total cohérent', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      data: { conversations: [{ id: 'c1' }, { id: 'c2' }], total: 8 },
    })
    const apiFetch = apiFetchMock as unknown as ApiFetchLike

    await expect(loadConversationPage(apiFetch, 2, 20)).resolves.toEqual({
      conversations: [{ id: 'c1' }, { id: 'c2' }],
      total: 8,
    })
    expect(apiFetchMock).toHaveBeenCalledWith('/api/conversations?page=2&pageSize=20')
  })

  it('retombe sur la longueur locale quand le total est absent', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      data: { conversations: [{ id: 'c1' }] },
    })
    const apiFetch = apiFetchMock as unknown as ApiFetchLike

    await expect(loadConversationPage(apiFetch, 1, 20)).resolves.toEqual({
      conversations: [{ id: 'c1' }],
      total: 1,
    })
  })

  it('retourne null si le chargement des conversations échoue', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, error: 'network_error' }) as unknown as ApiFetchLike
    await expect(loadConversationPage(apiFetch, 1, 20)).resolves.toBeNull()
  })

  it('agrège les demandes et amis quand les deux requêtes réussissent', async () => {
    const apiFetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { received: [{ id: 'r1' }], sent: [{ id: 's1' }] } })
      .mockResolvedValueOnce({ ok: true, data: { friends: [{ userId: 'u1' }] } })
    const apiFetch = apiFetchMock as unknown as ApiFetchLike

    await expect(loadFriendDirectory(apiFetch)).resolves.toEqual({
      received: [{ id: 'r1' }],
      sent: [{ id: 's1' }],
      friends: [{ userId: 'u1' }],
    })
  })

  it('retourne null si une des requêtes amis échoue', async () => {
    const apiFetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { received: [], sent: [] } })
      .mockResolvedValueOnce({ ok: false, error: 'network_error' })
    const apiFetch = apiFetchMock as unknown as ApiFetchLike

    await expect(loadFriendDirectory(apiFetch)).resolves.toBeNull()
  })
})
