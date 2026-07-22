import { z } from 'zod'

export const PUBLIC_MEDIA_IMAGE_MAX_BYTES = 10_000_000
export const PUBLIC_MEDIA_VIDEO_MAX_BYTES = 30_000_000
export const PUBLIC_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const
export const PUBLIC_MEDIA_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm', 'mov'] as const
export const PUBLIC_MEDIA_PURPOSES = ['event', 'organizer-gallery', 'provider-catalog'] as const

export const publicMediaUploadReferenceSchema = z.object({
  publicId: z.string().min(1).max(500),
  format: z.enum(PUBLIC_MEDIA_FORMATS),
  resourceType: z.enum(['image', 'video']),
  deliveryType: z.literal('upload'),
  bytes: z.number().int().positive().max(PUBLIC_MEDIA_VIDEO_MAX_BYTES),
  version: z.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{40}$/i),
  intentToken: z.string().min(40).max(2000),
})

export type PublicMediaPurpose = (typeof PUBLIC_MEDIA_PURPOSES)[number]
export type PublicMediaUploadReference = z.infer<typeof publicMediaUploadReferenceSchema>
