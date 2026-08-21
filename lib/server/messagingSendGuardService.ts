import User from '../models/User'
import { resolveMemberMuteStatus } from './messagingMuteUtils'
import { findOtherParticipantId, hasBlockedEitherWay, toBlockedUserIdsMap } from './messagingDirectBlockUtils'

export interface SendGuardConversation {
  type: 'direct' | 'group'
  participantIds: string[]
  mutedUserIds?: string[]
  memberMuteUntil?: Record<string, string> | Map<string, string>
}

export async function assertConversationSendAllowed(
  conversation: SendGuardConversation,
  callerId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (conversation.type === 'group' && resolveMemberMuteStatus(conversation, callerId).muted) {
    return { ok: false, status: 403, error: 'muted' }
  }

  if (conversation.type === 'direct') {
    const otherId = findOtherParticipantId(conversation.participantIds, callerId)
    if (otherId) {
      const users = await User.find({ _id: { $in: [callerId, otherId] } }).select('_id blockedUserIds').lean()
      const blocked = hasBlockedEitherWay(toBlockedUserIdsMap(users), callerId, otherId)
      if (blocked) return { ok: false, status: 403, error: 'blocked' }
    }
  }

  return { ok: true }
}
