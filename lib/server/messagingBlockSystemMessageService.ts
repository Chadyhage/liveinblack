import Conversation from '../models/Conversation'
import Message from '../models/Message'

export async function postBlockSystemMessage(
  byId: string,
  targetId: string,
  kind: 'block' | 'unblock',
  resolveDisplayName: (userId: string) => Promise<string>,
): Promise<void> {
  const conversation = await Conversation.findOne({
    type: 'direct',
    participantIds: { $all: [byId, targetId], $size: 2 },
  })
  if (!conversation) return

  const [byName, targetName] = await Promise.all([resolveDisplayName(byId), resolveDisplayName(targetId)])
  const content = `SYS::${JSON.stringify({ kind, by: byId, byName, target: targetId, targetName })}`

  const created = await Message.create({
    conversationId: String(conversation._id),
    senderId: byId,
    senderName: 'Système',
    type: 'system',
    content,
  })

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: kind === 'block' ? 'Contact bloqué' : 'Contact débloqué',
        lastMessageAt: created.createdAt,
        lastSenderId: byId,
      },
    }
  )
}
