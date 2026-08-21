export type MessagingErrorResult = {
  ok: false
  status: number
  error: string
}

export type ConversationGuardResultLike<TConversation> =
  | MessagingErrorResult
  | {
      ok: true
      conversation: TConversation
    }

export type LoadParticipantConversationLike<TConversation> = (
  conversationId: string,
  callerId: string,
) => Promise<ConversationGuardResultLike<TConversation>>

export type ParticipantMessageGuardResultLike<TMessage, TConversation> =
  | MessagingErrorResult
  | {
      ok: true
      message: TMessage
      conversation: TConversation
    }

export type LoadParticipantMessageLike<TMessage, TConversation> = (
  messageId: string,
  callerId: string,
) => Promise<ParticipantMessageGuardResultLike<TMessage, TConversation>>
