import { v2 as cloudinary } from 'cloudinary'

// Remplace Firebase Storage. Point d'entrée unique pour tout upload média
// (photos d'événements, avatars, catalogues, et — depuis #50 — photos/notes
// vocales de messagerie + avatar de groupe).
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

export default cloudinary

// Encodée en base64 dans le corps JSON (jamais de multipart) — même
// convention que le reste de cette API (zod + JSON partout). ~8 Mo de base64
// couvre largement une photo compressée côté client (legacy : maxSize 900px,
// qualité 0.78) ou une note vocale de quelques minutes ; au-delà, on refuse
// plutôt que de laisser un appelant pousser un fichier arbitrairement gros à
// travers une route JSON.
const MAX_DATA_URI_LENGTH = 13_500_000
const DEFAULT_MAX_BYTES = 6_000_000

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const
export const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav'] as const
export const DOCUMENT_MIME_TYPES = ['application/pdf', ...IMAGE_MIME_TYPES] as const

export type CloudinaryResourceType = 'image' | 'video' | 'raw'

export interface UploadPolicy {
  allowedMimeTypes?: readonly string[]
  maxBytes?: number
  deliveryType?: 'upload' | 'authenticated'
}

export type ValidatedDataUri = {
  mimeType: string
  bytes: number
  resourceType: CloudinaryResourceType
}

export function validateDataUri(dataUri: string, policy: UploadPolicy = {}): ValidatedDataUri | null {
  if (dataUri.length > MAX_DATA_URI_LENGTH) return null
  const match = /^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUri)
  if (!match) return null

  const mimeType = match[1].toLowerCase()
  const allowedMimeTypes = policy.allowedMimeTypes ?? IMAGE_MIME_TYPES
  if (!allowedMimeTypes.includes(mimeType)) return null

  const payload = match[2]
  if (payload.length % 4 !== 0) return null
  const bytes = Buffer.byteLength(payload, 'base64')
  if (bytes <= 0 || bytes > (policy.maxBytes ?? DEFAULT_MAX_BYTES)) return null

  const resourceType: CloudinaryResourceType = mimeType.startsWith('video/') || mimeType.startsWith('audio/')
    ? 'video'
    : mimeType === 'application/pdf' ? 'raw' : 'image'
  return { mimeType, bytes, resourceType }
}

export type UploadDataUriResult =
  | {
      ok: true
      url: string
      publicId: string
      format: string
      resourceType: CloudinaryResourceType
      deliveryType: 'upload' | 'authenticated'
      version: number
      bytes: number
    }
  | { ok: false; error: 'invalid_data_uri' | 'file_too_large' | 'upload_failed' }

export async function uploadDataUri(dataUri: string, folder: string, policy: UploadPolicy = {}): Promise<UploadDataUriResult> {
  if (dataUri.length > MAX_DATA_URI_LENGTH) return { ok: false, error: 'file_too_large' }
  const validated = validateDataUri(dataUri, policy)
  if (!validated) return { ok: false, error: 'invalid_data_uri' }

  try {
    const deliveryType = policy.deliveryType ?? 'upload'
    const res = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: validated.resourceType,
      type: deliveryType,
    })
    const fallbackFormat = validated.mimeType === 'image/jpeg' ? 'jpg' : validated.mimeType.split('/')[1]
    return {
      ok: true,
      url: res.secure_url,
      publicId: res.public_id,
      format: res.format || fallbackFormat,
      resourceType: res.resource_type === 'image' || res.resource_type === 'video' || res.resource_type === 'raw'
        ? res.resource_type
        : validated.resourceType,
      deliveryType,
      version: res.version,
      bytes: res.bytes || validated.bytes,
    }
  } catch {
    return { ok: false, error: 'upload_failed' }
  }
}
