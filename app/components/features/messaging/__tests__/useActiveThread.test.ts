import { describe, expect, it, vi } from 'vitest'
import { fetchLatestThreadMessages, fetchOlderThreadMessages } from '../useActiveThread'

describe('useActiveThread helpers', () => {
  it('charge la dernière fenêtre de messages du fil', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: { messages: [{ id: 'm1' }], hasMore: true } })

    await expect(fetchLatestThreadMessages(apiFetch, 'c1')).resolves.toEqual({
      ok: true,
      data: { messages: [{ id: 'm1' }], hasMore: true },
    })
    expect(apiFetch).toHaveBeenCalledWith('/api/conversations/c1/messages?limit=50')
  })

  it('charge la fenêtre plus ancienne avec le bon curseur', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, data: { messages: [{ id: 'm0' }], hasMore: false } })

    await expect(fetchOlderThreadMessages(apiFetch, 'c1', 'm1')).resolves.toEqual({
      ok: true,
      data: { messages: [{ id: 'm0' }], hasMore: false },
    })
    expect(apiFetch).toHaveBeenCalledWith('/api/conversations/c1/messages?before=m1&limit=50')
  })
})
