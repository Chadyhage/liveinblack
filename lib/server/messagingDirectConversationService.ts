import Conversation from '../models/Conversation'
import User from '../models/User'

export interface CreateDirectConversationCaller {
  id: string
}

export interface CreateDirectConversationInput {
  otherUserId: string
}

export interface DirectConversationMemberView {
  userId: string
  name: string
  role: 'member' | 'admin'
  muteUntilAt?: string | null
}

export interface DirectConversationView {
  id: string
  type: 'direct' | 'group'
  participantIds: string[]
  members: DirectConversationMemberView[]
}

export type DirectConversationResult =
  | { ok: false; status: number; error: string }
  | { ok: true; conversation: DirectConversationView }

export interface CreateDirectConversationDependencies<TConversationSource, TConversationView extends DirectConversationView> {
  normalizeObjectId: (id: string) => string
  toConversationView: (conversation: TConversationSource) => TConversationView
  withDirectConversationMembers: (
    conversation: TConversationView,
    names: Map<string, string>,
  ) => TConversationView
  resolveDirectMemberNames: (participantIds: string[]) => Promise<Map<string, string>>
}

export async function createDirectConversationForCaller<
  TConversationSource,
  TConversationView extends DirectConversationView,
>(
  caller: CreateDirectConversationCaller,
  input: CreateDirectConversationInput,
  {
    normalizeObjectId,
    toConversationView,
    withDirectConversationMembers,
    resolveDirectMemberNames,
  }: CreateDirectConversationDependencies<TConversationSource, TConversationView>,
): Promise<DirectConversationResult | { ok: true; conversation: TConversationView }> {
  const otherUserIdRaw = input.otherUserId?.trim()
  if (!otherUserIdRaw) return { ok: false, status: 400, error: 'invalid_input' }

  if (!User.base?.mongoose?.isValidObjectId(otherUserIdRaw)) return { ok: false, status: 404, error: 'user_not_found' }

  const otherUserId = normalizeObjectId(otherUserIdRaw)
  const other = await User.findById(otherUserId).lean()
  if (!other) return { ok: false, status: 404, error: 'user_not_found' }
  if (otherUserId === caller.id) return { ok: false, status: 400, error: 'cannot_message_self' }

  const existing = await Conversation.findOne({
    type: 'direct',
    participantIds: { $all: [caller.id, otherUserId], $size: 2 },
  }).lean()
  if (existing) {
    const view = toConversationView(existing as TConversationSource)
    const names = await resolveDirectMemberNames(view.participantIds)
    return { ok: true, conversation: withDirectConversationMembers(view, names) }
  }

  const callerUser = await User.findById(caller.id).lean()
  const blocked =
    Boolean(callerUser?.blockedUserIds?.includes(otherUserId)) || Boolean(other.blockedUserIds?.includes(caller.id))
  if (blocked) return { ok: false, status: 403, error: 'blocked' }

  const created = await Conversation.create({ type: 'direct', participantIds: [caller.id, otherUserId] })
  const view = toConversationView(created.toObject({ flattenMaps: true }) as TConversationSource)
  const names = await resolveDirectMemberNames(view.participantIds)
  return { ok: true, conversation: withDirectConversationMembers(view, names) }
}
