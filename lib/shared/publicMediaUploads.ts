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
// 'avatar' ajouté suite à l'audit de scalabilité du 12/08/2026 — premier pas
// de la migration de app/api/profil/avatar/route.ts vers l'upload direct
// signé (voir lib/server/profile.ts::updateAvatar) plutôt que le transit
// base64 par le serveur Next. Réutilisable pour d'autres avatars/couvertures
// (groupe, prestataire, organisateur) — ceux-ci restent en base64 pour
// l'instant, migration future documentée dans les commentaires des fonctions
// concernées.
export const PUBLIC_MEDIA_PURPOSES = ['event', 'organizer-gallery', 'provider-catalog', 'avatar'] as const

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
