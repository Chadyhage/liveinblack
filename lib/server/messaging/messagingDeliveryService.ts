import Conversation from '@/lib/models/Conversation'
import Message from '@/lib/models/Message'
import User from '@/lib/models/User'
import type { ConversationSource, MessageSource } from './messagingViews'
import type { HydratedDocument } from 'mongoose'
import type { ConversationDoc } from '@/lib/models/Conversation'
import type { Email } from '@/lib/server/emails/types'
import type { SendableType } from './messagingSendUtils'
import { resolveLastMessageLabel } from './messagingSendUtils'
import {
  buildConversationMessagePath,
  buildConversationMessageUrl,
  buildMessagePushPayload,
  selectOfflineRecipientIds,
} from './messagingNotificationUtils'

export interface DeliverMessageCaller {
  id: string
}

export interface DeliverMessageInput {
  type: SendableType
  content: string
  replyToMessageId: string | null
  senderName: string
}

export interface DeliverMessageOptions {
  site: string
  deferSideEffects?: (work: () => Promise<void>) => void | Promise<void>
}

export interface DeliverMessageDependencies<TMessageView> {
  upsertMessageNotification: (
    recipientId: string,
    conversationId: string,
    preview: string,
    link: string,
  ) => Promise<void>
  notifyUserById: (
    userId: string,
    buildEmail: () => Email,
  ) => Promise<void>
  newMessageDigestEmail: (
    senderName: string,
    preview: string,
    conversationUrl: string,
    site: string,
  ) => Email
  sendPushToUser: (
    userId: string,
    payload: { title: string; body: string; url: string },
  ) => Promise<void>
  toMessageView: (
    message: MessageSource,
    ctx: {
      callerId: string
      conversation: ConversationSource
      readReceiptsAllowed: Map<string, boolean>
    },
  ) => TMessageView
}

export async function deliverMessageForConversation<TMessageView>(
  caller: DeliverMessageCaller,
  conversation: HydratedDocument<ConversationDoc>,
  input: DeliverMessageInput,
  options: DeliverMessageOptions,
  {
    upsertMessageNotification,
    notifyUserById,
    newMessageDigestEmail,
    sendPushToUser,
    toMessageView,
  }: DeliverMessageDependencies<TMessageView>,
): Promise<{ ok: true; message: TMessageView }> {
  const created = await Message.create({
    conversationId: String(conversation._id),
    senderId: caller.id,
    senderName: input.senderName,
    type: input.type,
    content: input.content,
    replyToMessageId: input.replyToMessageId,
  })

  const lastMessageLabel = resolveLastMessageLabel(input.type, input.content)
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessage: lastMessageLabel, lastMessageAt: created.createdAt, lastSenderId: caller.id } },
  )

  const conversationIdStr = String(conversation._id)
  const recipientIds = conversation.participantIds.filter((id) => id !== caller.id)
  const conversationPath = buildConversationMessagePath(conversationIdStr)
  await Promise.all(
    recipientIds.map((recipientId) =>
      upsertMessageNotification(recipientId, conversationIdStr, lastMessageLabel, conversationPath),
    ),
  )

  if (recipientIds.length) {
    const recipients = await User.find({ _id: { $in: recipientIds } }).select('lastSeenAt').lean()
    const conversationUrl = buildConversationMessageUrl(options.site, conversationIdStr)
    const offlineRecipientIds = selectOfflineRecipientIds(recipients)
    const notifyOfflineRecipients = () =>
      Promise.all(
        offlineRecipientIds.map(async (recipientId) => {
          await notifyUserById(recipientId, () =>
            newMessageDigestEmail(input.senderName, lastMessageLabel, conversationUrl, options.site),
          )
          await sendPushToUser(
            recipientId,
            buildMessagePushPayload(input.senderName, lastMessageLabel, conversationUrl),
          )
        }),
      ).then(() => undefined)

    if (options.deferSideEffects) await options.deferSideEffects(notifyOfflineRecipients)
    else await notifyOfflineRecipients()
  }

  const conversationSource = conversation.toObject({ flattenMaps: true }) as ConversationSource
  return {
    ok: true,
    message: toMessageView(created.toObject({ flattenMaps: true }) as MessageSource, {
      callerId: caller.id,
      conversation: conversationSource,
      readReceiptsAllowed: new Map(),
    }),
  }
}
