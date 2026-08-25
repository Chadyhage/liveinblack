import mongoose from 'mongoose'
import type { HydratedDocument } from 'mongoose'
import User from '@/lib/models/User'
import type { ConversationDoc } from '@/lib/models/Conversation'
import type { Email } from '@/lib/server/emails/types'
import type { MessagingCaller } from './messagingCoreService'
import type { MessagingErrorResult } from './messagingServiceTypes'
import type { ConversationView } from './messagingViews'

export interface AddGroupMemberInput {
  conversationId: string
  userId: string
}

export interface RemoveGroupMemberInput {
  conversationId: string
  userId: string
}

export interface SetGroupMemberRoleInput {
  conversationId: string
  userId: string
  role: 'admin' | 'member'
}

export type AddGroupMemberResult = MessagingErrorResult | { ok: true; conversation: ConversationView }
export type RemoveGroupMemberResult = MessagingErrorResult | { ok: true }
export type SetGroupMemberRoleResult = MessagingErrorResult | { ok: true }

type ConversationMember = NonNullable<ConversationDoc['members']>[number]

export interface GroupMemberDependencies {
  normalizeObjectId: (id: string) => string
  loadGroupAsAdmin: (
    caller: MessagingCaller,
    conversationId: string,
  ) => Promise<
    | MessagingErrorResult
    | {
        ok: true
        conversation: HydratedDocument<ConversationDoc>
        members: ConversationMember[]
      }
  >
  resolveDisplayName: (userId: string) => Promise<string>
  appendGroupSystemMessage: (
    conversation: HydratedDocument<ConversationDoc>,
    input: {
      senderId: string
      senderName: string
      content: string
    },
  ) => Promise<void>
  notifyUserById: (
    userId: string,
    buildEmail: () => Email,
  ) => Promise<void>
  addedToGroupEmail: (
    groupName: string,
    callerName: string,
    groupUrl: string,
    site: string,
  ) => Email
  toConversationView: (conversation: ConversationDoc) => ConversationView
  maxMembersTotal: number
  site: string
}

export async function addGroupMemberForCaller(
  caller: MessagingCaller,
  input: AddGroupMemberInput,
  {
    normalizeObjectId,
    loadGroupAsAdmin,
    resolveDisplayName,
    appendGroupSystemMessage,
    notifyUserById,
    addedToGroupEmail,
    toConversationView,
    maxMembersTotal,
    site,
  }: GroupMemberDependencies,
): Promise<AddGroupMemberResult> {
  const conversationId = input.conversationId?.trim()
  const userIdRaw = input.userId?.trim()
  if (!conversationId || !userIdRaw) return { ok: false, status: 400, error: 'invalid_input' }
  if (!mongoose.isValidObjectId(userIdRaw)) return { ok: false, status: 404, error: 'user_not_found' }
  const userId = normalizeObjectId(userIdRaw)

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation, members } = guard

  if (members.some((member) => member.userId === userId)) return { ok: false, status: 400, error: 'already_a_member' }
  if (members.length >= maxMembersTotal) return { ok: false, status: 400, error: 'too_many_members' }

  const user = await User.findById(userId).lean()
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }
  const memberName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email

  conversation.members!.push({ userId, name: memberName, role: 'member' })
  conversation.participantIds = conversation.members!.map((member) => member.userId)

  const callerName = await resolveDisplayName(caller.id)
  await appendGroupSystemMessage(conversation, {
    senderId: caller.id,
    senderName: callerName,
    content: `${callerName} a ajouté ${memberName}`,
  })
  await conversation.save()

  const groupUrl = `${site}/conversation/${String(conversation._id)}`
  await notifyUserById(userId, () => addedToGroupEmail(conversation.name || 'un groupe', callerName, groupUrl, site))

  return {
    ok: true,
    conversation: toConversationView(conversation.toObject({ flattenMaps: true }) as unknown as ConversationDoc),
  }
}

export async function removeGroupMemberForCaller(
  caller: MessagingCaller,
  input: RemoveGroupMemberInput,
  {
    loadGroupAsAdmin,
    resolveDisplayName,
    appendGroupSystemMessage,
  }: Pick<GroupMemberDependencies, 'loadGroupAsAdmin' | 'resolveDisplayName' | 'appendGroupSystemMessage'>,
): Promise<RemoveGroupMemberResult> {
  const conversationId = input.conversationId?.trim()
  const userId = input.userId?.trim()
  if (!conversationId || !userId) return { ok: false, status: 400, error: 'invalid_input' }
  if (userId === caller.id) return { ok: false, status: 400, error: 'cannot_remove_self' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation, members } = guard

  const idx = members.findIndex((member) => member.userId === userId)
  if (idx === -1) return { ok: false, status: 400, error: 'not_a_member' }
  const removedName = members[idx].name

  conversation.members!.splice(idx, 1)
  conversation.participantIds = conversation.members!.map((member) => member.userId)

  const callerName = await resolveDisplayName(caller.id)
  await appendGroupSystemMessage(conversation, {
    senderId: caller.id,
    senderName: callerName,
    content: `${removedName} a été retiré du groupe`,
  })
  conversation.mutedUserIds = conversation.mutedUserIds.filter((id) => id !== userId)
  if (conversation.memberMuteUntil) conversation.memberMuteUntil.delete(userId)
  await conversation.save()

  return { ok: true }
}

export async function setGroupMemberRoleForCaller(
  caller: MessagingCaller,
  input: SetGroupMemberRoleInput,
  {
    loadGroupAsAdmin,
    resolveDisplayName,
    appendGroupSystemMessage,
  }: Pick<GroupMemberDependencies, 'loadGroupAsAdmin' | 'resolveDisplayName' | 'appendGroupSystemMessage'>,
): Promise<SetGroupMemberRoleResult> {
  const conversationId = input.conversationId?.trim()
  const userId = input.userId?.trim()
  const role = input.role
  if (!conversationId || !userId || (role !== 'admin' && role !== 'member')) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadGroupAsAdmin(caller, conversationId)
  if (!guard.ok) return guard
  const { conversation, members } = guard

  const target = members.find((member) => member.userId === userId)
  if (!target) return { ok: false, status: 400, error: 'not_a_member' }
  if (target.role === role) return { ok: true }

  if (target.role === 'admin' && role === 'member') {
    const adminCount = members.filter((member) => member.role === 'admin').length
    if (adminCount <= 1) return { ok: false, status: 400, error: 'only_admin' }
  }

  target.role = role
  const callerName = await resolveDisplayName(caller.id)
  await appendGroupSystemMessage(conversation, {
    senderId: caller.id,
    senderName: callerName,
    content:
      role === 'admin'
        ? `${callerName} a nommé ${target.name} administrateur`
        : `${callerName} a retiré le rôle Admin à ${target.name}`,
  })
  await conversation.save()

  return { ok: true }
}
