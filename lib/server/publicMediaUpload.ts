import crypto from 'node:crypto'
import cloudinary from './cloudinary'
import {
  PUBLIC_MEDIA_FORMATS,
  PUBLIC_MEDIA_IMAGE_MAX_BYTES,
  PUBLIC_MEDIA_VIDEO_MAX_BYTES,
  type PublicMediaPurpose,
  type PublicMediaUploadReference,
} from '../shared/publicMediaUploads'

const INTENT_TTL_SECONDS = 60 * 60
const UPLOAD_FOLDER_PREFIX = 'media/pending'

const MIME_CONFIG: Record<string, { resourceType: 'image' | 'video'; format: (typeof PUBLIC_MEDIA_FORMATS)[number]; maxBytes: number }> = {
  'image/jpeg': { resourceType: 'image', format: 'jpg', maxBytes: PUBLIC_MEDIA_IMAGE_MAX_BYTES },
  'image/png': { resourceType: 'image', format: 'png', maxBytes: PUBLIC_MEDIA_IMAGE_MAX_BYTES },
  'image/webp': { resourceType: 'image', format: 'webp', maxBytes: PUBLIC_MEDIA_IMAGE_MAX_BYTES },
  'video/mp4': { resourceType: 'video', format: 'mp4', maxBytes: PUBLIC_MEDIA_VIDEO_MAX_BYTES },
  'video/webm': { resourceType: 'video', format: 'webm', maxBytes: PUBLIC_MEDIA_VIDEO_MAX_BYTES },
  'video/quicktime': { resourceType: 'video', format: 'mov', maxBytes: PUBLIC_MEDIA_VIDEO_MAX_BYTES },
}

type UploadIntentPayload = {
  v: 1
  owner: string
  purpose: PublicMediaPurpose
  folder: string
  resourceType: 'image' | 'video'
  format: (typeof PUBLIC_MEDIA_FORMATS)[number]
  maxBytes: number
  exp: number
}

type Credentials = { cloudName: string; apiKey: string; apiSecret: string; uploadPreset: string }

export type PublicMediaUploadSignatureResult =
  | { ok: false; error: 'upload_not_configured' | 'invalid_media' }
  | {
      ok: true
      uploadUrl: string
      apiKey: string
      timestamp: number
      folder: string
      deliveryType: 'upload'
      allowedFormats: string
      uploadPreset: string
      resourceType: 'image' | 'video'
      signature: string
      intentToken: string
    }

function credentials(): Credentials | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || ''
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || ''
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || ''
  const uploadPreset = process.env.CLOUDINARY_PUBLIC_UPLOAD_PRESET?.trim() || ''
  if (!cloudName || !apiKey || !apiSecret || !uploadPreset) return null
  return { cloudName, apiKey, apiSecret, uploadPreset }
}

function tokenSecret(): string | null {
  return process.env.AUTH_SECRET?.trim() || null
}

function signTokenPayload(encodedPayload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function equalSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function issueIntentToken(payload: UploadIntentPayload): string | null {
  const secret = tokenSecret()
  if (!secret) return null
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signTokenPayload(encoded, secret)}`
}

function readIntentToken(token: string): UploadIntentPayload | null {
  const secret = tokenSecret()
  if (!secret) return null
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra || !equalSecret(signature, signTokenPayload(encoded, secret))) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<UploadIntentPayload>
    if (payload.v !== 1 || !payload.owner || !payload.purpose || !payload.folder || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000) || !payload.folder.startsWith(`${UPLOAD_FOLDER_PREFIX}/`)) return null
    if ((payload.resourceType !== 'image' && payload.resourceType !== 'video') || !payload.format || !payload.maxBytes) return null
    return payload as UploadIntentPayload
  } catch {
    return null
  }
}

export function createPublicMediaUploadSignature(input: {
  owner: string
  purpose: PublicMediaPurpose
  contentType: string
  size: number
}): PublicMediaUploadSignatureResult {
  const config = credentials()
  const media = MIME_CONFIG[input.contentType]
  if (!config || !tokenSecret()) return { ok: false, error: 'upload_not_configured' }
  if (!media || !Number.isInteger(input.size) || input.size <= 0 || input.size > media.maxBytes) {
    return { ok: false, error: 'invalid_media' }
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const folder = `${UPLOAD_FOLDER_PREFIX}/${crypto.randomBytes(18).toString('hex')}`
  const deliveryType = 'upload' as const
  const intentToken = issueIntentToken({
    v: 1,
    owner: input.owner,
    purpose: input.purpose,
    folder,
    resourceType: media.resourceType,
    format: media.format,
    maxBytes: media.maxBytes,
    exp: timestamp + INTENT_TTL_SECONDS,
  })
  if (!intentToken) return { ok: false, error: 'upload_not_configured' }

  const signature = cloudinary.utils.api_sign_request(
    {
      allowed_formats: media.format,
      folder,
      timestamp,
      type: deliveryType,
      upload_preset: config.uploadPreset,
    },
    config.apiSecret
  )

  return {
    ok: true,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${media.resourceType}/upload`,
    apiKey: config.apiKey,
    timestamp,
    folder,
    deliveryType,
    allowedFormats: media.format,
    uploadPreset: config.uploadPreset,
    resourceType: media.resourceType,
    signature,
    intentToken,
  }
}

export async function verifyPublicMediaUploadReference(
  reference: PublicMediaUploadReference,
  expectedOwner: string,
  expectedPurpose: PublicMediaPurpose
): Promise<{ ok: true; url: string; resourceType: 'image' | 'video' } | { ok: false }> {
  const config = credentials()
  const intent = readIntentToken(reference.intentToken)
  if (!config || !intent || intent.owner !== expectedOwner || intent.purpose !== expectedPurpose) return { ok: false }
  if (!reference.publicId.startsWith(`${intent.folder}/`)) return { ok: false }
  if (reference.resourceType !== intent.resourceType || reference.format !== intent.format || reference.bytes > intent.maxBytes) return { ok: false }

  const expectedSignature = cloudinary.utils.api_sign_request(
    { public_id: reference.publicId, version: reference.version },
    config.apiSecret
  )
  if (!equalSecret(reference.signature.toLowerCase(), expectedSignature.toLowerCase())) return { ok: false }

  try {
    const resource = await cloudinary.api.resource(reference.publicId, {
      resource_type: reference.resourceType,
      type: 'upload',
    })
    if (
      resource.public_id !== reference.publicId ||
      resource.resource_type !== reference.resourceType ||
      resource.type !== 'upload' ||
      Number(resource.version) !== reference.version ||
      Number(resource.bytes) !== reference.bytes ||
      Number(resource.bytes) <= 0 ||
      Number(resource.bytes) > intent.maxBytes ||
      String(resource.format || '').toLowerCase() !== reference.format ||
      typeof resource.secure_url !== 'string'
    ) {
      return { ok: false }
    }
    return { ok: true, url: resource.secure_url, resourceType: reference.resourceType }
  } catch {
    return { ok: false }
  }
}
