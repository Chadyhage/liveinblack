import crypto from 'node:crypto'
import cloudinary from './cloudinary'
import {
  APPLICATION_DOCUMENT_MAX_BYTES,
  APPLICATION_DOCUMENT_FORMATS,
  type ApplicationDocumentUploadReference,
} from '../shared/applicationDocuments'

const INTENT_TTL_SECONDS = 24 * 60 * 60
const UPLOAD_FOLDER_PREFIX = 'applications/pending'
const ALLOWED_FORMATS_PARAM = APPLICATION_DOCUMENT_FORMATS.join(',')

type UploadIntentPayload = {
  v: 1
  owner: string
  folder: string
  exp: number
}

type CloudinaryCredentials = {
  cloudName: string
  apiKey: string
  apiSecret: string
  uploadPreset: string
}

export type ApplicationUploadSignatureResult =
  | { ok: false; error: 'upload_not_configured' }
  | {
      ok: true
      uploadUrl: string
      apiKey: string
      timestamp: number
      folder: string
      deliveryType: 'authenticated'
      allowedFormats: string
      uploadPreset: string
      signature: string
      intentToken: string
    }

function credentials(): CloudinaryCredentials | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || ''
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || ''
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || ''
  const uploadPreset = process.env.CLOUDINARY_PRIVATE_UPLOAD_PRESET?.trim() || ''
  if (!cloudName || !apiKey || !apiSecret || !uploadPreset) return null
  return { cloudName, apiKey, apiSecret, uploadPreset }
}

function tokenSecret(): string | null {
  return process.env.AUTH_SECRET?.trim() || null
}

function signPayload(encodedPayload: string, secret: string): string {
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
  return `${encoded}.${signPayload(encoded, secret)}`
}

function readIntentToken(token: string): UploadIntentPayload | null {
  const secret = tokenSecret()
  if (!secret) return null
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra || !equalSecret(signature, signPayload(encoded, secret))) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<UploadIntentPayload>
    if (payload.v !== 1 || !payload.owner || !payload.folder || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    if (!payload.folder.startsWith(`${UPLOAD_FOLDER_PREFIX}/`)) return null
    return payload as UploadIntentPayload
  } catch {
    return null
  }
}

export function applicationUploadOwner(userId?: string | null): string {
  return userId ? `user:${userId}` : 'anonymous'
}

export function createApplicationUploadSignature(owner: string): ApplicationUploadSignatureResult {
  const config = credentials()
  if (!config || !tokenSecret()) return { ok: false, error: 'upload_not_configured' }

  const timestamp = Math.floor(Date.now() / 1000)
  const folder = `${UPLOAD_FOLDER_PREFIX}/${crypto.randomBytes(18).toString('hex')}`
  const deliveryType = 'authenticated' as const
  const intentToken = issueIntentToken({ v: 1, owner, folder, exp: timestamp + INTENT_TTL_SECONDS })
  if (!intentToken) return { ok: false, error: 'upload_not_configured' }

  const signature = cloudinary.utils.api_sign_request(
    {
      allowed_formats: ALLOWED_FORMATS_PARAM,
      folder,
      timestamp,
      type: deliveryType,
      upload_preset: config.uploadPreset,
    },
    config.apiSecret
  )

  return {
    ok: true,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    apiKey: config.apiKey,
    timestamp,
    folder,
    deliveryType,
    allowedFormats: ALLOWED_FORMATS_PARAM,
    uploadPreset: config.uploadPreset,
    signature,
    intentToken,
  }
}

export async function verifyApplicationUploadReference(
  reference: ApplicationDocumentUploadReference,
  expectedOwner: string
): Promise<boolean> {
  const config = credentials()
  const intent = readIntentToken(reference.intentToken)
  if (!config || !intent || intent.owner !== expectedOwner) return false
  if (!reference.publicId.startsWith(`${intent.folder}/`)) return false

  const expectedSignature = cloudinary.utils.api_sign_request(
    { public_id: reference.publicId, version: reference.version },
    config.apiSecret
  )
  if (!equalSecret(reference.signature.toLowerCase(), expectedSignature.toLowerCase())) return false

  try {
    const resource = await cloudinary.api.resource(reference.publicId, {
      resource_type: 'image',
      type: 'authenticated',
    })
    return (
      resource.public_id === reference.publicId &&
      resource.resource_type === 'image' &&
      resource.type === 'authenticated' &&
      Number(resource.version) === reference.version &&
      Number(resource.bytes) === reference.bytes &&
      Number(resource.bytes) > 0 &&
      Number(resource.bytes) <= APPLICATION_DOCUMENT_MAX_BYTES &&
      String(resource.format || '').toLowerCase() === reference.format
    )
  } catch {
    return false
  }
}

export function createApplicationDocumentDownloadUrl(document: {
  publicId: string
  format: string
  resourceType?: string | null
  deliveryType?: string | null
}): string | null {
  if (!credentials() || document.deliveryType !== 'authenticated') return null
  if (!APPLICATION_DOCUMENT_FORMATS.includes(document.format as (typeof APPLICATION_DOCUMENT_FORMATS)[number])) return null

  return cloudinary.utils.private_download_url(document.publicId, document.format, {
    resource_type: document.resourceType === 'raw' ? 'raw' : 'image',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
    attachment: false,
  })
}
