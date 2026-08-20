import type { TicketWalletGroupView, TicketWalletItemView } from './TicketWallet'

export type GroupBucket = 'upcoming' | 'past' | 'cancelled'

export function toMajor(minor: number, currency: string): number {
  return currency === 'XOF' ? minor : minor / 100
}

export function readDismissedTicketBanners(storageValue: string | null): Set<string> {
  try {
    return new Set(JSON.parse(storageValue || '[]'))
  } catch {
    return new Set()
  }
}

export function classifyTicketGroup(group: TicketWalletGroupView, now: Date = new Date()): GroupBucket {
  if (group.event?.cancelled) return 'cancelled'
  const dateStr = group.event?.date
  if (!dateStr) return 'past'
  const eventDate = new Date(dateStr)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return eventDate.getTime() < today.getTime() ? 'past' : 'upcoming'
}

export function bucketTicketGroups(groups: TicketWalletGroupView[], now: Date = new Date()) {
  const withBucket = groups.map((g) => ({ g, bucket: classifyTicketGroup(g, now) }))
  const rank: Record<GroupBucket, number> = { upcoming: 0, past: 1, cancelled: 2 }
  withBucket.sort((a, b) => {
    if (rank[a.bucket] !== rank[b.bucket]) return rank[a.bucket] - rank[b.bucket]
    const da = a.g.event?.date ? new Date(a.g.event.date).getTime() : 0
    const db = b.g.event?.date ? new Date(b.g.event.date).getTime() : 0
    return a.bucket === 'upcoming' ? da - db : db - da
  })
  return {
    upcoming: withBucket.filter((x) => x.bucket === 'upcoming').map((x) => x.g),
    past: withBucket.filter((x) => x.bucket === 'past').map((x) => x.g),
    cancelled: withBucket.filter((x) => x.bucket === 'cancelled').map((x) => x.g),
  }
}

export function countUpcomingSeats(groups: TicketWalletGroupView[]): number {
  return groups.reduce((sum, g) => sum + g.myTickets.length, 0)
}

export function visibleGroupTickets(group: TicketWalletGroupView, currentUserId: string): TicketWalletItemView[] {
  return group.myTickets.filter((t) => !(t.isHostSeat && t.assignedTo && t.assignedTo !== currentUserId))
}

export function hoursRemainingLabel(expiresAtISO: string, now: Date = new Date()): string {
  const ms = new Date(expiresAtISO).getTime() - now.getTime()
  if (ms <= 0) return 'Expiré'
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours >= 1) return `${hours}h${minutes.toString().padStart(2, '0')} restantes`
  return `${minutes} min restantes`
}
