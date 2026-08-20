import { describe, expect, it } from 'vitest'
import { buildPlaylistExportText, effectiveParticipantState, moderationSongsForTab, myPlaylistSongs, playlistDjStats, rankPlaylistSongs, type PlaylistSong } from '../playlistUtils'

const songs: PlaylistSong[] = [
  {
    id: 's1',
    title: 'First',
    artist: 'Artist A',
    previewUrl: null,
    cover: null,
    addedBy: 'u1',
    addedByName: 'Nina',
    likedBy: ['u2', 'u3'],
    status: 'pending',
  },
  {
    id: 's2',
    title: 'Second',
    artist: 'Artist B',
    previewUrl: null,
    cover: null,
    addedBy: 'u2',
    addedByName: 'Leo',
    likedBy: ['u1'],
    status: 'validated',
  },
  {
    id: 's3',
    title: 'Third',
    artist: 'Artist C',
    previewUrl: null,
    cover: null,
    addedBy: 'u1',
    addedByName: 'Nina',
    likedBy: [],
    status: 'refused',
  },
  {
    id: 's4',
    title: 'Fourth',
    artist: 'Artist D',
    previewUrl: null,
    cover: null,
    addedBy: 'u4',
    addedByName: 'Maya',
    likedBy: ['u1', 'u2', 'u3', 'u5'],
    status: 'played',
  },
]

describe('playlistUtils', () => {
  it('classe le top sans les sons refusés', () => {
    expect(rankPlaylistSongs(songs).map((song) => song.id)).toEqual(['s4', 's1', 's2'])
  })

  it('retourne les sons de l’utilisateur courant', () => {
    expect(myPlaylistSongs(songs, 'u1').map((song) => song.id)).toEqual(['s1', 's3'])
  })

  it('calcule l’état participant effectif en mode aperçu', () => {
    expect(
      effectiveParticipantState({
        hasTicket: false,
        isCheckedIn: false,
        previewMode: true,
        realTicketCount: 0,
        songsRemaining: 0,
        mySongsCount: 1,
      })
    ).toEqual({
      effectiveHasTicket: true,
      effectiveIsCheckedIn: true,
      ticketCount: 1,
      effectiveSongsRemaining: 0,
    })
  })

  it('filtre et trie la modération selon le tri demandé', () => {
    expect(moderationSongsForTab(songs, 'validated', 'likes').map((song) => song.id)).toEqual(['s2'])
    expect(moderationSongsForTab(songs, 'all', 'recent').map((song) => song.id)).toEqual(['s4', 's3', 's2', 's1'])
  })

  it('agrège les stats DJ et prépare le texte exportable', () => {
    expect(playlistDjStats(songs)).toEqual({
      total: 4,
      likes: 7,
      pending: 1,
      validated: 1,
      played: 1,
      refused: 1,
    })

    expect(buildPlaylistExportText(songs, 'Soirée Test', 'likes')).toBe(
      'Playlist — Soirée Test\n\n' +
        '1. Fourth — Artist D [Joué]\n' +
        '2. First — Artist A\n' +
        '3. Second — Artist B [Validé]\n' +
        '4. Third — Artist C [Refusé par le DJ]'
    )
  })
})
