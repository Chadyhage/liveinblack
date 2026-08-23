import ProviderProfile from '@/lib/models/ProviderProfile'
import Event from '@/lib/models/Event'
import type { ConversationDoc } from '@/lib/models/Conversation'
import type { HydratedDocument } from 'mongoose'
import type { SendableType } from './messagingSendUtils'
import { buildCatalogItemMessageContent, buildEventMessageContent } from './messagingSendUtils'

export interface ResolveSendContentInput {
  type: SendableType
  content: string
  mediaDataUri?: string
  catalogItemId?: string
  eventId?: string
}

export interface UploadedMediaResult {
  ok: true
  url: string
}

export type UploadMediaFailure = { ok: false; error: string }

export interface ResolveSendContentDependencies {
  uploadDataUri: (
    dataUri: string,
    folder: string,
    options: { allowedMimeTypes: readonly string[] | string[] },
  ) => Promise<UploadedMediaResult | UploadMediaFailure>
  imageMimeTypes: readonly string[] | string[]
  audioMimeTypes: readonly string[] | string[]
}

export async function resolveSendMessageContent(
  callerId: string,
  conversation: HydratedDocument<ConversationDoc>,
  input: ResolveSendContentInput,
  {
    uploadDataUri,
    imageMimeTypes,
    audioMimeTypes,
  }: ResolveSendContentDependencies,
): Promise<{ ok: true; content: string } | { ok: false; status: number; error: string }> {
  let content = (input.content ?? '').trim()

  if (input.type === 'catalog_item') {
    if (conversation.type !== 'direct') return { ok: false, status: 400, error: 'invalid_type' }
    const catalogItemId = input.catalogItemId?.trim()
    if (!catalogItemId) return { ok: false, status: 400, error: 'invalid_input' }

    const otherId = conversation.participantIds.find((id) => id !== callerId)
    const provider = otherId ? await ProviderProfile.findOne({ userId: otherId }).lean() : null
    const item = provider?.catalog?.find((catalogItem) => catalogItem.id === catalogItemId && catalogItem.available !== false)
    if (!provider || !item) return { ok: false, status: 404, error: 'catalog_item_not_found' }

    content = buildCatalogItemMessageContent({
      providerId: otherId,
      providerName: provider.name || '',
      item,
    })

    return { ok: true, content }
  }

  if (input.type === 'event') {
    const eventId = input.eventId?.trim()
    if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }
    const event = await Event.findById(eventId).lean()
    if (!event) return { ok: false, status: 404, error: 'event_not_found' }
    content = buildEventMessageContent(event)
    return { ok: true, content }
  }

  if (input.type !== 'text' && !content && input.mediaDataUri) {
    const uploaded = await uploadDataUri(input.mediaDataUri, `messages/${String(conversation._id)}`, {
      allowedMimeTypes: input.type === 'voice' ? audioMimeTypes : imageMimeTypes,
    })
    if (!uploaded.ok) return { ok: false, status: 400, error: uploaded.error }
    content = uploaded.url
  }

  return { ok: true, content }
}
