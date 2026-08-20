import type { PlaylistSong } from '../models/EventPlaylist'
import type { EventDoc } from '../models/Event'
import type { StaffRoster } from './playlist'

export interface PlaylistSongView {
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

export function canModeratePlaylist(
  callerId: string,
  callerRoles: string[],
  event: Pick<EventDoc, 'organizerId' | 'createdBy'>,
  staffRoster: StaffRoster | undefined
): boolean {
  const isOwner = event.organizerId === callerId || event.createdBy === callerId
  if (isOwner) return true
  if (callerRoles.includes('agent')) return true
  const role = staffRoster?.[callerId]?.role
  return role === 'dj' || role === 'manager'
}

export function toSongView(song: PlaylistSong): PlaylistSongView {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist ?? '',
    previewUrl: song.previewUrl ?? null,
    cover: song.cover ?? null,
    addedBy: song.addedBy,
    addedByName: song.addedByName ?? '',
    likedBy: song.likedBy ?? [],
    status: (song.status ?? 'pending') as PlaylistSongView['status'],
  }
}

export function countMySpentLikes(songs: PlaylistSong[], callerId: string): number {
  return songs.filter((song) => song.status !== 'refused' && (song.likedBy ?? []).includes(callerId)).length
}

export function formatDuration(ms: number | undefined): string {
  if (!ms) return ''
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
