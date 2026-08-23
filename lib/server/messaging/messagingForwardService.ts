import Conversation from '@/lib/models/Conversation'
import Message from '@/lib/models/Message'
import {
  buildForwardedPoll,
  canForwardMessageType,
  normalizeForwardTargetIds,
  resolveForwardedLastMessageLabel,
} from './messagingForwardUtils'
import type {
  LoadParticipantMessageLike,
  MessagingErrorResult,
  LoadParticipantConversationLike,
} from './messagingServiceTypes'
import { toMessageView, type ConversationSource, type MessageSource, type MessageView } from './messagingViews'

export interface ForwardServiceCaller {
  id: string
}

export interface ForwardMessageInput {
  messageId: string
  toConversationIds: string[]
}

type CanSendInConversationLike<TConversation> = (
  conversation: TConversation,
  callerId: string,
) => Promise<{ ok: true } | MessagingErrorResult>

type ForwardSourceMessageLike = {
  type: MessageView['type']
  content?: string | null
  poll?: MessageSource['poll']
  senderName?: string | null
}

export async function resolveForwardConversationLabel(
  conversation: { type: 'direct' | 'group'; name?: string | null; participantIds: string[] },
  callerId: string,
  resolveDisplayName: (userId: string) => Promise<string>,
): Promise<string> {
  if (conversation.type === 'group') return conversation.name || 'Groupe'
  const otherId = conversation.participantIds.find((id) => id !== callerId)
  return otherId ? await resolveDisplayName(otherId) : ''
}

export async function forwardMessageForCaller<
  TSourceMessage extends ForwardSourceMessageLike,
  TSourceConversation extends { type: 'direct' | 'group'; name?: string | null; participantIds: string[] },
  TTargetConversation extends { _id: unknown; toObject: (options: { flattenMaps: true }) => unknown },
>(
  caller: ForwardServiceCaller,
  input: ForwardMessageInput,
  deps: {
    loadParticipantMessage: LoadParticipantMessageLike<TSourceMessage, TSourceConversation>
    loadParticipantConversation: LoadParticipantConversationLike<TTargetConversation>
    assertCanSendInConversation: CanSendInConversationLike<TTargetConversation>
    resolveDisplayName: (userId: string) => Promise<string>
  },
): Promise<{ ok: true; messages: MessageView[] } | { ok: false; status: number; error: string }> {
  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await deps.loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard

  const sourceGuard = canForwardMessageType(guard.message as any)
  if (!sourceGuard.ok) return { ok: false, status: 400, error: sourceGuard.error }

  const targetIdsResult = normalizeForwardTargetIds(input.toConversationIds)
  if (!targetIdsResult.ok) return { ok: false, status: 400, error: targetIdsResult.error }

  return forwardMessageToConversations(
    caller,
    {
      source: {
        type: guard.message.type,
        content: guard.message.content ?? null,
        poll: guard.message.poll,
        senderName: guard.message.senderName ?? '',
      },
      sourceConversation: guard.conversation,
      targetIds: targetIdsResult.targetIds,
    },
    {
      loadParticipantConversation: deps.loadParticipantConversation,
      assertCanSendInConversation: deps.assertCanSendInConversation,
      resolveDisplayName: deps.resolveDisplayName,
    },
  )
}

export async function forwardMessageToConversations<
  TSourceConversation extends { type: 'direct' | 'group'; name?: string | null; participantIds: string[] },
  TTargetConversation extends { _id: unknown; toObject: (options: { flattenMaps: true }) => unknown },
>(
  caller: ForwardServiceCaller,
  args: {
    source: {
      type: MessageView['type']
      content: string | null
      poll: MessageSource['poll']
      senderName: string
    }
    sourceConversation: TSourceConversation
    targetIds: string[]
  },
  deps: {
    loadParticipantConversation: LoadParticipantConversationLike<TTargetConversation>
    assertCanSendInConversation: CanSendInConversationLike<TTargetConversation>
    resolveDisplayName: (userId: string) => Promise<string>
  },
): Promise<{ ok: true; messages: MessageView[] } | { ok: false; status: number; error: string }> {
  const sourceConvLabel = await resolveForwardConversationLabel(args.sourceConversation, caller.id, deps.resolveDisplayName)
  const senderName = await deps.resolveDisplayName(caller.id)

  const sent: MessageView[] = []
  for (const targetId of args.targetIds) {
    const targetGuard = await deps.loadParticipantConversation(targetId, caller.id)
    if (!targetGuard.ok) continue

    const targetConversation = targetGuard.conversation
    const canSend = await deps.assertCanSendInConversation(targetConversation, caller.id)
    if (!canSend.ok) continue

    const forwardedPoll = buildForwardedPoll(args.source.poll as any)
    const created = await Message.create({
      conversationId: String(targetConversation._id),
      senderId: caller.id,
      senderName,
      type: args.source.type,
      content: args.source.content,
      poll: forwardedPoll,
      forwardedFrom: { senderName: args.source.senderName, convName: sourceConvLabel },
    })

    const lastMessageLabel = resolveForwardedLastMessageLabel(args.source.type, args.source.content)
    await Conversation.updateOne(
      { _id: targetConversation._id },
      { $set: { lastMessage: lastMessageLabel, lastMessageAt: created.createdAt, lastSenderId: caller.id } }
    )

    const targetConvSource = targetConversation.toObject({ flattenMaps: true }) as ConversationSource
    sent.push(
      toMessageView(created.toObject({ flattenMaps: true }) as unknown as MessageSource, {
        callerId: caller.id,
        conversation: targetConvSource,
        readReceiptsAllowed: new Map(),
      })
    )
  }

  if (sent.length === 0) return { ok: false, status: 400, error: 'forward_failed' }
  return { ok: true, messages: sent }
}
