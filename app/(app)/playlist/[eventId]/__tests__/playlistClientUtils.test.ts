import { afterEach, describe, expect, it, vi } from 'vitest'
import { playlistApiFetch, playlistClientErrorMessage } from '../playlistClientUtils'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('playlistClientUtils', () => {
  it('retourne un message lisible avec fallback', () => {
    expect(playlistClientErrorMessage('duplicate_song')).toContain('déjà dans la playlist')
    expect(playlistClientErrorMessage(undefined)).toBe('Une erreur est survenue.')
    expect(playlistClientErrorMessage('unknown')).toBe('Une erreur est survenue.')
  })

  it('retourne les données en cas de réponse ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, value: 42 }),
    }))

    await expect(playlistApiFetch<{ ok: true; value: number }>('/api/test')).resolves.toEqual({
      ok: true,
      data: { ok: true, value: 42 },
    })
  })

  it('retourne un code d’erreur en cas de réponse non ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'search_unavailable' }),
    }))

    await expect(playlistApiFetch('/api/test')).resolves.toEqual({
      ok: false,
      error: 'search_unavailable',
    })
  })

  it('retourne network_error si fetch échoue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))

    await expect(playlistApiFetch('/api/test')).resolves.toEqual({
      ok: false,
      error: 'network_error',
    })
  })
})
