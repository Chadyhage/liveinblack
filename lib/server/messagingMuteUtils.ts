export interface MemberMuteStatus {
  muted: boolean
  untilAtMs: number | null
}

export function resolveMemberMuteStatus(
  conversation: { mutedUserIds?: string[]; memberMuteUntil?: Record<string, string> | Map<string, string> },
  userId: string,
  nowMs = Date.now(),
): MemberMuteStatus {
  const source = conversation.memberMuteUntil
  const raw = source instanceof Map ? source.get(userId) : source?.[userId]
  if (raw === undefined) {
    const inLegacyList = (conversation.mutedUserIds ?? []).includes(userId)
    return inLegacyList ? { muted: true, untilAtMs: null } : { muted: false, untilAtMs: null }
  }
  if (raw === '') return { muted: true, untilAtMs: null }
  const untilAtMs = new Date(raw).getTime()
  if (!Number.isFinite(untilAtMs) || untilAtMs <= nowMs) return { muted: false, untilAtMs: null }
  return { muted: true, untilAtMs }
}
