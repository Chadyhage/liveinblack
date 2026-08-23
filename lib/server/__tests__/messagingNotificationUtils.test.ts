import { describe, expect, it } from 'vitest'
import {
  buildConversationMessagePath,
  buildConversationMessageUrl,
  buildMessagePushPayload,
  OFFLINE_MESSAGE_DIGEST_THRESHOLD_MS,
  selectOfflineRecipientIds,
} from '../messaging/messagingNotificationUtils'

describe('messagingNotificationUtils', () => {
  it('construit le chemin et l’URL de conversation', () => {
    expect(buildConversationMessagePath('conv-1')).toBe('/messages?conversationId=conv-1')
    expect(buildConversationMessageUrl('https://liveinblack.com', 'conv-1')).toBe('https://liveinblack.com/messages?conversationId=conv-1')
  })

  it('construit la charge utile push attendue', () => {
    expect(buildMessagePushPayload('Alice', 'Salut', 'https://liveinblack.com/messages?conversationId=conv-1')).toEqual({
      title: "Alice t'a envoyé un message",
      body: 'Salut',
      url: 'https://liveinblack.com/messages?conversationId=conv-1',
    })
  })

  it('sélectionne seulement les destinataires offline ou jamais vus', () => {
    const now = new Date('2026-08-20T17:10:00.000Z').getTime()
    expect(
      selectOfflineRecipientIds(
        [
          { _id: 'u1', lastSeenAt: null },
          { _id: 'u2', lastSeenAt: '2026-08-20T16:00:00.000Z' },
          { _id: 'u3', lastSeenAt: new Date(now - OFFLINE_MESSAGE_DIGEST_THRESHOLD_MS + 1_000) },
          { _id: 'u4', lastSeenAt: 'not-a-date' },
        ],
        now,
      ),
    ).toEqual(['u1', 'u2', 'u4'])
  })
})
