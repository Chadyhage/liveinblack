import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'

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

const UPLOAD_ATTEMPTS = 3
let cloudinaryConfigurationUnavailableInDevelopment = false

function uploadBuffer(
  buffer: Buffer,
  options: { folder: string; resource_type: CloudinaryResourceType; type: 'upload' | 'authenticated'; timeout: number }
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error)
      else if (result) resolve(result)
      else reject(new Error('Cloudinary upload returned no result'))
    })
    stream.on('error', reject)
    stream.end(buffer)
  })
}

const LOCAL_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
}

async function persistDevelopmentUpload(
  fileBuffer: Buffer,
  validated: ValidatedDataUri,
  deliveryType: 'upload' | 'authenticated'
): Promise<UploadDataUriResult | null> {
  // Jamais de repli public pour un justificatif `authenticated` (identité,
  // dossier KYC). Ces documents doivent échouer fermé si Cloudinary privé
  // n'est pas configuré, même en développement.
  if (process.env.NODE_ENV !== 'development' || deliveryType !== 'upload') return null
  const extension = LOCAL_EXTENSION_BY_MIME[validated.mimeType]
  if (!extension) return null
  const fileName = `${randomUUID()}.${extension}`
  const directory = path.join(process.cwd(), 'public', 'uploads-dev')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, fileName), fileBuffer, { flag: 'wx' })
  return {
    ok: true,
    url: `/uploads-dev/${fileName}`,
    publicId: `uploads-dev/${fileName}`,
    format: extension,
    resourceType: validated.resourceType,
    deliveryType,
    version: Date.now(),
    bytes: validated.bytes,
  }
}

function isRetryableUploadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const value = err as {
    name?: unknown
    message?: unknown
    http_code?: unknown
    error?: { name?: unknown; message?: unknown; http_code?: unknown }
  }
  const nested = value.error
  const name = String(nested?.name ?? value.name ?? '').toLowerCase()
  const message = String(nested?.message ?? value.message ?? '').toLowerCase()
  const httpCode = Number(nested?.http_code ?? value.http_code ?? 0)
  return name.includes('timeout')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('econnreset')
    || httpCode === 408
    || httpCode === 429
    || httpCode === 499
    || httpCode >= 500
}

function isConfigurationUploadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const value = err as { message?: unknown; http_code?: unknown; error?: { message?: unknown; http_code?: unknown } }
  const message = String(value.error?.message ?? value.message ?? '').toLowerCase()
  const httpCode = Number(value.error?.http_code ?? value.http_code ?? 0)
  return httpCode === 400 || httpCode === 401 || httpCode === 403
    || message.includes('invalid cloud_name')
    || message.includes('unknown api key')
}

export async function uploadDataUri(dataUri: string, folder: string, policy: UploadPolicy = {}): Promise<UploadDataUriResult> {
  if (dataUri.length > MAX_DATA_URI_LENGTH) return { ok: false, error: 'file_too_large' }
  const validated = validateDataUri(dataUri, policy)
  if (!validated) return { ok: false, error: 'invalid_data_uri' }

  const deliveryType = policy.deliveryType ?? 'upload'
  const base64Payload = dataUri.slice(dataUri.indexOf(',') + 1)
  const fileBuffer = Buffer.from(base64Payload, 'base64')
  if (cloudinaryConfigurationUnavailableInDevelopment) {
    return (await persistDevelopmentUpload(fileBuffer, validated, deliveryType)) ?? { ok: false, error: 'upload_failed' }
  }
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      // Envoyer les octets dans un flux multipart est nettement plus robuste
      // qu'un immense champ texte `data:...;base64` : Cloudinary n'a plus à
      // décoder la data URI dans sa fenêtre de traitement de la requête.
      const res = await uploadBuffer(fileBuffer, {
        folder,
        resource_type: validated.resourceType,
        type: deliveryType,
        // Le SDK autorise 60 s par défaut, mais certains relais réseau ferment
        // une requête inactive plus tôt. Une valeur explicite et des reprises
        // rendent l'envoi fiable lors d'un timeout transitoire (Cloudinary 499).
        timeout: 30_000,
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
    } catch (err) {
      const canRetry = attempt < UPLOAD_ATTEMPTS && isRetryableUploadError(err)
      if (!canRetry) {
        if (process.env.NODE_ENV === 'development' && isConfigurationUploadError(err)) {
          cloudinaryConfigurationUnavailableInDevelopment = true
        }
        const localUpload = await persistDevelopmentUpload(fileBuffer, validated, deliveryType)
        if (localUpload) {
          console.warn('[cloudinary] unavailable; media stored locally for development')
          return localUpload
        }
        console.error('[cloudinary] upload failed:', err)
        return { ok: false, error: 'upload_failed' }
      }
      console.warn(`[cloudinary] upload attempt ${attempt} timed out; retrying`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 300))
    }
  }
  return (await persistDevelopmentUpload(fileBuffer, validated, deliveryType)) ?? { ok: false, error: 'upload_failed' }
}
