export type SendableType = 'text' | 'image' | 'voice' | 'catalog_item' | 'event'

export const SENDABLE_TYPES = ['text', 'image', 'voice', 'catalog_item', 'event'] as const
export const MAX_TEXT_MESSAGE_LENGTH = 4000
export const MAX_MEDIA_MESSAGE_LENGTH = 2000
export const MAX_CATALOG_DESCRIPTION_LENGTH = 400

export function isSendableType(type: string): type is SendableType {
  return SENDABLE_TYPES.includes(type as SendableType)
}

export function clampCatalogDescription(description: string | null | undefined): string {
  const rawDescription = description ?? ''
  return rawDescription.length > MAX_CATALOG_DESCRIPTION_LENGTH
    ? `${rawDescription.slice(0, MAX_CATALOG_DESCRIPTION_LENGTH)}…`
    : rawDescription
}

export function buildCatalogItemMessageContent(input: {
  providerId: string | undefined
  providerName: string | null | undefined
  item: {
    id: string
    name: string
    description?: string | null
    price?: number | null
    unit?: string | null
    category?: string | null
    media?: Array<{ url: string; type?: string | null }> | null
  }
}): string {
  const media = input.item.media?.find((item) => item.type !== 'video') ?? input.item.media?.[0]
  return JSON.stringify({
    providerId: input.providerId,
    providerName: input.providerName || '',
    itemId: input.item.id,
    name: input.item.name,
    description: clampCatalogDescription(input.item.description),
    price: input.item.price ?? null,
    unit: input.item.unit || '',
    category: input.item.category || '',
    image: media?.url ?? null,
  })
}

export function buildEventMessageContent(event: {
  _id: unknown
  name: string
  dateDisplay?: string | null
  date?: string | null
  imageUrl?: string | null
  places?: Array<{ price?: number | null }> | null
}): string {
  const price = event.places && event.places.length > 0 ? Math.min(...event.places.map((place) => place.price ?? 0)) : 0
  return JSON.stringify({
    id: String(event._id),
    name: event.name,
    date: event.dateDisplay || event.date || '',
    price,
    image: event.imageUrl ?? null,
  })
}

export function validateMessageContentLength(type: SendableType, content: string): { ok: true } | { ok: false; error: 'empty_message' | 'message_too_long' } {
  if (!content) return { ok: false, error: 'empty_message' }
  if (type === 'text' && content.length > MAX_TEXT_MESSAGE_LENGTH) return { ok: false, error: 'message_too_long' }
  if (type !== 'text' && content.length > MAX_MEDIA_MESSAGE_LENGTH) return { ok: false, error: 'message_too_long' }
  return { ok: true }
}

export function resolveLastMessageLabel(type: SendableType, content: string): string {
  if (type === 'text') return content
  if (type === 'image') return 'Photo'
  if (type === 'voice') return 'Message vocal'
  if (type === 'event') return 'Événement'
  if (type === 'catalog_item') return 'Offre prestataire'
  return 'Message'
}
