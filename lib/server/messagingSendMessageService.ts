import type { HydratedDocument } from 'mongoose'
import type { ConversationDoc } from '../models/Conversation'
import type { MessageView } from './messagingViews'
import type { SendableType } from './messagingSendUtils'
import type { MessagingCaller } from './messagingCoreService'
import type { MessagingErrorResult } from './messagingServiceTypes'

export interface SendMessageOptions {
  deferSideEffects?: (work: () => Promise<void>) => void | Promise<void>
}

export interface SendMessageInput {
  conversationId: string
  type: string
  content: string
  mediaDataUri?: string
  replyToMessageId?: string | null
  catalogItemId?: string
  eventId?: string
}

export type SendMessageResult = MessagingErrorResult | { ok: true; message: MessageView }

export interface SendMessageDependencies {
  loadParticipantConversation: (
    conversationId: string,
    callerId: string,
  ) => Promise<MessagingErrorResult | { ok: true; conversation: HydratedDocument<ConversationDoc> }>
  isSendableType: (type: string) => type is SendableType
  resolveSendMessageContent: (
    callerId: string,
    conversation: HydratedDocument<ConversationDoc>,
    input: {
      type: SendableType
      content: string
      mediaDataUri?: string
      catalogItemId?: string
      eventId?: string
    },
  ) => Promise<{ ok: true; content: string } | MessagingErrorResult>
  validateMessageContentLength: (
    type: SendableType,
    content: string,
  ) => { ok: true } | { ok: false; error: 'empty_message' | 'message_too_long' }
  assertCanSendInConversation: (
    conversation: HydratedDocument<ConversationDoc>,
    callerId: string,
  ) => Promise<{ ok: true } | MessagingErrorResult>
  resolveDisplayName: (userId: string) => Promise<string>
  deliverMessageForConversation: (
    caller: MessagingCaller,
    conversation: HydratedDocument<ConversationDoc>,
    input: {
      type: SendableType
      content: string
      replyToMessageId: string | null
      senderName: string
    },
    options: SendMessageOptions,
  ) => Promise<SendMessageResult>
}

export async function sendMessageForCaller(
  caller: MessagingCaller,
  input: SendMessageInput,
  options: SendMessageOptions,
  {
    loadParticipantConversation,
    isSendableType,
    resolveSendMessageContent,
    validateMessageContentLength,
    assertCanSendInConversation,
    resolveDisplayName,
    deliverMessageForConversation,
  }: SendMessageDependencies,
): Promise<SendMessageResult> {
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  const conversation = guard.conversation

  if (!isSendableType(input.type)) return { ok: false, status: 400, error: 'invalid_type' }
  const type = input.type

  const contentResult = await resolveSendMessageContent(caller.id, conversation, {
    type,
    content: input.content ?? '',
    mediaDataUri: input.mediaDataUri,
    catalogItemId: input.catalogItemId,
    eventId: input.eventId,
  })
  if (!contentResult.ok) return contentResult

  const contentValidation = validateMessageContentLength(type, contentResult.content)
  if (!contentValidation.ok) return { ok: false, status: 400, error: contentValidation.error }

  const sendGuard = await assertCanSendInConversation(conversation, caller.id)
  if (!sendGuard.ok) return sendGuard

  const senderName = await resolveDisplayName(caller.id)
  const replyToMessageId = input.replyToMessageId?.trim() || null

  return deliverMessageForConversation(
    caller,
    conversation,
    {
      type,
      content: contentResult.content,
      replyToMessageId,
      senderName,
    },
    options,
  )
}
