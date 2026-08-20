export const OFFLINE_MESSAGE_DIGEST_THRESHOLD_MS = 30 * 60 * 1000

export function buildConversationMessagePath(conversationId: string): string {
  return `/messages?conversationId=${conversationId}`
}

export function buildConversationMessageUrl(site: string, conversationId: string): string {
  return `${site}${buildConversationMessagePath(conversationId)}`
}

export function buildMessagePushPayload(senderName: string, preview: string, conversationUrl: string) {
  return {
    title: `${senderName} t'a envoyé un message`,
    body: preview,
    url: conversationUrl,
  }
}

export function selectOfflineRecipientIds(
  recipients: Array<{ _id: unknown; lastSeenAt?: Date | string | null }>,
  nowMs = Date.now(),
  thresholdMs = OFFLINE_MESSAGE_DIGEST_THRESHOLD_MS,
): string[] {
  return recipients
    .filter((recipient) => {
      if (!recipient.lastSeenAt) return true
      const lastSeenMs = new Date(recipient.lastSeenAt).getTime()
      return !Number.isFinite(lastSeenMs) || nowMs - lastSeenMs > thresholdMs
    })
    .map((recipient) => String(recipient._id))
}
