import type { MessageDoc } from '@/lib/models/Message'

export const MAX_FORWARD_TARGETS = 20

export function normalizeForwardTargetIds(rawIds: unknown, maxTargets = MAX_FORWARD_TARGETS): { ok: true; targetIds: string[] } | { ok: false; error: 'invalid_input' | 'too_many_targets' } {
  const targetIdsRaw = Array.isArray(rawIds) ? rawIds : []
  const targetIds = [...new Set(targetIdsRaw.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean))]
  if (targetIds.length === 0) return { ok: false, error: 'invalid_input' }
  if (targetIds.length > maxTargets) return { ok: false, error: 'too_many_targets' }
  return { ok: true, targetIds }
}

export function canForwardMessageType(message: Pick<MessageDoc, 'deletedForAll' | 'type'>): { ok: true } | { ok: false; error: 'message_deleted' | 'invalid_type' } {
  if (message.deletedForAll) return { ok: false, error: 'message_deleted' }
  if (message.type === 'system') return { ok: false, error: 'invalid_type' }
  return { ok: true }
}

export function buildForwardedPoll(
  poll: MessageDoc['poll'] | null | undefined,
): MessageDoc['poll'] | null {
  if (!poll) return null
  return {
    pollType: poll.pollType,
    question: poll.question,
    options: poll.options.map((option) => ({ id: option.id, text: option.text, voterIds: [] as string[] })),
    event: poll.event ? { ...poll.event } : null,
  }
}

export function resolveForwardedLastMessageLabel(type: MessageDoc['type'], content: string | null | undefined): string {
  if (type === 'text') return content ?? ''
  if (type === 'image') return 'Photo'
  if (type === 'voice') return 'Message vocal'
  return 'Message'
}
