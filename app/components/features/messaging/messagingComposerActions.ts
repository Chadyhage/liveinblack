import type { ApiFetchLike } from './messagingData'
import type { MessageView } from './types'

export function normalizeRecordedAudioMime(mimeType: string | undefined): string {
  const normalized = (mimeType || 'audio/webm').split(';')[0].trim()
  return normalized || 'audio/webm'
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function compressImage(dataUrl: string, maxSize = 1000, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return resolve(dataUrl)
      context.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

interface ConversationMessagePayload {
  type: 'text' | 'image' | 'voice' | 'event'
  content: string
  mediaDataUri?: string
  eventId?: string
  replyToMessageId?: string
}

export async function sendConversationMessage(
  apiFetch: ApiFetchLike,
  conversationId: string,
  payload: ConversationMessagePayload
) {
  return apiFetch<{ message: MessageView }>(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
