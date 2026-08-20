import type { ConversationSource, ConversationView } from './messagingViews'

export function collectDirectParticipantIds(conversations: Array<Pick<ConversationSource, 'type' | 'participantIds'>>): string[] {
  return Array.from(
    new Set(
      conversations
        .filter((conversation) => conversation.type === 'direct')
        .flatMap((conversation) => conversation.participantIds ?? [])
    )
  )
}

export function withDirectConversationMembers(
  conversation: ConversationView,
  names: ReadonlyMap<string, string>
): ConversationView {
  return {
    ...conversation,
    members: conversation.participantIds.map((userId) => ({
      userId,
      name: names.get(userId) ?? '',
      role: 'member' as const,
    })),
  }
}
