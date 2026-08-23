import User from '@/lib/models/User'
import {
  normalizeBlockedTargetUserId,
  validateModerationTargetUserId,
} from './messagingModerationUtils'

export interface BlockUserCaller {
  id: string
}

export interface BlockUserInput {
  targetUserId: string
}

export interface BlockUserDependencies {
  normalizeObjectId: (id: string) => string
  postBlockSystemMessage: (
    byId: string,
    targetId: string,
    kind: 'block' | 'unblock',
    resolveDisplayName: (userId: string) => Promise<string>,
  ) => Promise<void>
  resolveDisplayName: (userId: string) => Promise<string>
}

export async function blockUserForCaller(
  caller: BlockUserCaller,
  input: BlockUserInput,
  {
    normalizeObjectId,
    postBlockSystemMessage,
    resolveDisplayName,
  }: BlockUserDependencies,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const targetValidation = validateModerationTargetUserId(input.targetUserId, normalizeObjectId)
  if (!targetValidation.ok) return targetValidation

  const { targetUserId } = targetValidation
  const target = await User.findById(targetUserId).lean()
  if (!target) return { ok: false, status: 404, error: 'user_not_found' }
  if (targetUserId === caller.id) return { ok: false, status: 400, error: 'cannot_block_self' }

  await User.updateOne({ _id: caller.id }, { $addToSet: { blockedUserIds: targetUserId } })
  await postBlockSystemMessage(caller.id, targetUserId, 'block', resolveDisplayName)
  return { ok: true }
}

export async function unblockUserForCaller(
  caller: BlockUserCaller,
  input: BlockUserInput,
  {
    normalizeObjectId,
    postBlockSystemMessage,
    resolveDisplayName,
  }: BlockUserDependencies,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const targetNormalization = normalizeBlockedTargetUserId(input.targetUserId, normalizeObjectId)
  if (!targetNormalization.ok) return targetNormalization

  const { targetUserId } = targetNormalization
  await User.updateOne({ _id: caller.id }, { $pull: { blockedUserIds: targetUserId } })
  await postBlockSystemMessage(caller.id, targetUserId, 'unblock', resolveDisplayName)
  return { ok: true }
}
