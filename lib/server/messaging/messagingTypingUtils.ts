import type { TypingUserView } from './messagingTypingService'

export function collectActiveTypingUserIds(
  typingAt: Map<string, Date | string> | Record<string, Date | string> | undefined,
  callerId: string,
  ttlMs: number,
  nowMs = Date.now(),
): string[] {
  const entries = typingAt instanceof Map ? Array.from(typingAt.entries()) : Object.entries(typingAt ?? {})
  return entries
    .filter(([userId, at]) => {
      if (userId === callerId) return false
      const timestampMs = new Date(at).getTime()
      return Number.isFinite(timestampMs) && nowMs - timestampMs < ttlMs
    })
    .map(([userId]) => userId)
}

export function buildTypingUsers(activeUserIds: string[], names: ReadonlyMap<string, string>): TypingUserView[] {
  return activeUserIds.map((userId) => ({ userId, name: names.get(userId) ?? '' }))
}
