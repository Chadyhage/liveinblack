import type {
  LoadParticipantMessageLike,
} from './messagingServiceTypes'
import type { ConversationSource, MessageSource, MessageView } from './messagingViews'
import { toMessageView } from './messagingViews'

export interface EditMessageInput {
  messageId: string
  content: string
}

export interface EditMessageCaller {
  id: string
}

export async function editParticipantTextMessage<
  TMessage extends {
    senderId: string
    type: string
    deletedForAll?: boolean
    content?: string | null
    editedAt?: Date | null
    save: () => Promise<unknown>
    toObject: (options: { flattenMaps: true }) => unknown
  },
  TConversation extends {
    toObject: (options: { flattenMaps: true }) => unknown
  },
>(
  caller: EditMessageCaller,
  input: EditMessageInput,
  loadParticipantMessage: LoadParticipantMessageLike<TMessage, TConversation>,
  resolveReadReceiptsAllowed: (participantIds: string[]) => Promise<Map<string, boolean>>,
): Promise<{ ok: true; message: MessageView } | { ok: false; status: number; error: string }> {
  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard

  const { message, conversation } = guard
  if (message.senderId !== caller.id) return { ok: false, status: 403, error: 'not_message_owner' }
  if (message.type !== 'text') return { ok: false, status: 400, error: 'invalid_type' }
  if (message.deletedForAll) return { ok: false, status: 400, error: 'message_deleted' }

  const content = input.content?.trim()
  if (!content) return { ok: false, status: 400, error: 'empty_message' }
  if (content.length > 4000) return { ok: false, status: 400, error: 'message_too_long' }

  message.content = content
  message.editedAt = new Date()
  await message.save()

  const conversationSource = conversation.toObject({ flattenMaps: true }) as ConversationSource
  const readReceiptsAllowed = await resolveReadReceiptsAllowed(conversationSource.participantIds ?? [])
  return {
    ok: true,
    message: toMessageView(message.toObject({ flattenMaps: true }) as MessageSource, {
      callerId: caller.id,
      conversation: conversationSource,
      readReceiptsAllowed,
    }),
  }
}
