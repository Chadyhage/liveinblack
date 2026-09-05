export interface PlaylistSong {
  id: string
  title: string
  artist: string
  previewUrl: string | null
  cover: string | null
  addedBy: string
  addedByName: string
  likedBy: string[]
  status: 'pending' | 'validated' | 'refused' | 'played'
}

export const STATUS_BADGE: Record<PlaylistSong['status'], { label: string; color: string } | null> = {
  pending: null,
  validated: { label: 'Validé', color: 'var(--primary)' },
  refused: { label: 'Refusé par le DJ', color: 'var(--pink)' },
  played: { label: 'Joué', color: 'var(--violet)' },
}

export function rankPlaylistSongs(songs: PlaylistSong[]): PlaylistSong[] {
  return [...songs].filter((s) => s.status !== 'refused').sort((a, b) => b.likedBy.length - a.likedBy.length)
}

export function myPlaylistSongs(songs: PlaylistSong[], currentUserId: string): PlaylistSong[] {
  return songs.filter((s) => s.addedBy === currentUserId)
}

export function effectiveParticipantState(input: {
  hasTicket: boolean
  isCheckedIn: boolean
  previewMode: boolean
  realTicketCount: number
  songsRemaining: number
  mySongsCount: number
}) {
  const effectiveHasTicket = input.hasTicket || input.previewMode
  const effectiveIsCheckedIn = input.isCheckedIn || input.previewMode
  const ticketCount = input.previewMode ? Math.max(1, input.realTicketCount) : input.realTicketCount
  const effectiveSongsRemaining = input.previewMode ? Math.max(0, ticketCount - input.mySongsCount) : input.songsRemaining
  return { effectiveHasTicket, effectiveIsCheckedIn, ticketCount, effectiveSongsRemaining }
}

export function moderationSongsForTab(
  songs: PlaylistSong[],
  moderationTab: 'all' | PlaylistSong['status'],
  djSort: 'likes' | 'recent'
): PlaylistSong[] {
  const filtered = moderationTab === 'all' ? songs : songs.filter((s) => s.status === moderationTab)
  return [...filtered].sort((a, b) => (djSort === 'likes' ? b.likedBy.length - a.likedBy.length : songs.indexOf(b) - songs.indexOf(a)))
}

export function playlistDjStats(songs: PlaylistSong[]) {
  return {
    total: songs.length,
    likes: songs.reduce((sum, s) => sum + s.likedBy.length, 0),
    pending: songs.filter((s) => s.status === 'pending').length,
    validated: songs.filter((s) => s.status === 'validated').length,
    played: songs.filter((s) => s.status === 'played').length,
    refused: songs.filter((s) => s.status === 'refused').length,
  }
}

export function buildPlaylistExportText(songs: PlaylistSong[], eventName: string, djSort: 'likes' | 'recent'): string {
  const full = [...songs].sort((a, b) => (djSort === 'likes' ? b.likedBy.length - a.likedBy.length : songs.indexOf(b) - songs.indexOf(a)))
  const lines = full.map((s, i) => `${i + 1}. ${s.title} — ${s.artist}${STATUS_BADGE[s.status] ? ` [${STATUS_BADGE[s.status]!.label}]` : ''}`).join('\n')
  return `Playlist — ${eventName}\n\n${lines}`
}
