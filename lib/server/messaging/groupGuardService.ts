import type { HydratedDocument } from 'mongoose'
import type { ConversationDoc } from '@/lib/models/Conversation'
import type { MessagingCaller } from './messagingCoreService'
import type { MessagingErrorResult } from './messagingServiceTypes'

type ConversationMember = NonNullable<ConversationDoc['members']>[number]

export type GroupGuardResult =
  | MessagingErrorResult
  | {
      ok: true
      conversation: HydratedDocument<ConversationDoc>
      members: ConversationMember[]
    }

export interface GroupGuardDependencies {
  loadParticipantConversation: (
    conversationId: string,
    callerId: string,
  ) => Promise<
    | MessagingErrorResult
    | {
        ok: true
        conversation: HydratedDocument<ConversationDoc>
      }
  >
}

export async function loadGroupConversationForCaller(
  callerId: string,
  conversationId: string,
  { loadParticipantConversation }: GroupGuardDependencies,
): Promise<GroupGuardResult> {
  const guard = await loadParticipantConversation(conversationId, callerId)
  if (!guard.ok) return guard
  const { conversation } = guard
  if (conversation.type !== 'group' || !conversation.members) {
    return { ok: false, status: 404, error: 'conversation_not_found' }
  }
  return { ok: true, conversation, members: conversation.members }
}

export async function loadGroupAsAdminForCaller(
  caller: MessagingCaller,
  conversationId: string,
  deps: GroupGuardDependencies,
): Promise<GroupGuardResult> {
  const guard = await loadGroupConversationForCaller(caller.id, conversationId, deps)
  if (!guard.ok) return guard
  const callerMember = guard.members.find((member) => member.userId === caller.id)
  if (callerMember?.role !== 'admin') return { ok: false, status: 403, error: 'admin_only' }
  return guard
}
