import { describe, expect, it } from 'vitest'
import {
  canModeratePlaylist,
  countMySpentLikes,
  formatDuration,
  toSongView,
} from '../playlistServerUtils'

describe('playlistServerUtils', () => {
  it('autorise la modération pour propriétaire, agent, dj et manager', () => {
    const event = { organizerId: 'org-1', createdBy: 'creator-1' }
    expect(canModeratePlaylist('org-1', [], event, undefined)).toBe(true)
    expect(canModeratePlaylist('creator-1', [], event, undefined)).toBe(true)
    expect(canModeratePlaylist('agent-1', ['agent'], event, undefined)).toBe(true)
    expect(canModeratePlaylist('dj-1', [], event, { 'dj-1': { role: 'dj' } })).toBe(true)
    expect(canModeratePlaylist('mgr-1', [], event, { 'mgr-1': { role: 'manager' } })).toBe(true)
    expect(canModeratePlaylist('srv-1', [], event, { 'srv-1': { role: 'serveur' } })).toBe(false)
  })

  it('convertit une chanson en vue normalisée', () => {
    expect(toSongView({
      id: 's1',
      title: 'Track',
      artist: undefined,
      previewUrl: undefined,
      cover: undefined,
      addedBy: 'u1',
      addedByName: undefined,
      likedBy: undefined,
      status: undefined,
    } as never)).toEqual({
      id: 's1',
      title: 'Track',
      artist: '',
      previewUrl: null,
      cover: null,
      addedBy: 'u1',
      addedByName: '',
      likedBy: [],
      status: 'pending',
    })
  })

  it('compte les likes dépensés hors sons refusés', () => {
    expect(countMySpentLikes([
      { likedBy: ['me'], status: 'pending' },
      { likedBy: ['me'], status: 'refused' },
      { likedBy: ['me', 'me'], status: 'validated' },
      { likedBy: ['other'], status: 'validated' },
    ] as never, 'me')).toBe(2)
  })

  it('formate une durée mm:ss', () => {
    expect(formatDuration(185000)).toBe('3:05')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(59000)).toBe('0:59')
    expect(formatDuration(undefined)).toBe('')
  })
})
