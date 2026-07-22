import {
  APPLICATION_DOCUMENT_MAX_BYTES,
  APPLICATION_DOCUMENT_FORMATS,
  APPLICATION_DOCUMENT_MIME_TYPES,
  type ApplicationDocumentUploadReference,
} from '../shared/applicationDocuments'

type SignatureResponse = {
  ok: true
  upload: {
    uploadUrl: string
    apiKey: string
    timestamp: number
    folder: string
    deliveryType: 'authenticated'
    allowedFormats: string
    signature: string
    intentToken: string
  }
}

type CloudinaryUploadResponse = {
  public_id?: string
  format?: string
  resource_type?: string
  type?: string
  bytes?: number
  version?: number
  signature?: string
  error?: { message?: string }
}

export async function uploadApplicationDocument(file: File): Promise<ApplicationDocumentUploadReference> {
  if (!APPLICATION_DOCUMENT_MIME_TYPES.includes(file.type as (typeof APPLICATION_DOCUMENT_MIME_TYPES)[number])) {
    throw new Error('Format non accepté. Utilise PDF, JPG ou PNG.')
  }
  if (file.size <= 0 || file.size > APPLICATION_DOCUMENT_MAX_BYTES) {
    throw new Error('Le fichier dépasse la limite de 10 Mo.')
  }

  const signResponse = await fetch('/api/applications/documents/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, contentType: file.type, size: file.size }),
  })
  const signed = (await signResponse.json().catch(() => null)) as SignatureResponse | null
  if (!signResponse.ok || !signed?.ok) throw new Error('Impossible de préparer l’envoi du document.')

  const body = new FormData()
  body.append('file', file)
  body.append('api_key', signed.upload.apiKey)
  body.append('timestamp', String(signed.upload.timestamp))
  body.append('folder', signed.upload.folder)
  body.append('type', signed.upload.deliveryType)
  body.append('allowed_formats', signed.upload.allowedFormats)
  body.append('signature', signed.upload.signature)

  const uploadResponse = await fetch(signed.upload.uploadUrl, { method: 'POST', body })
  const uploaded = (await uploadResponse.json().catch(() => null)) as CloudinaryUploadResponse | null
  if (!uploadResponse.ok || !uploaded) {
    throw new Error(uploaded?.error?.message || 'Échec de l’envoi du document.')
  }

  if (
    !uploaded.public_id ||
    !uploaded.format ||
    !APPLICATION_DOCUMENT_FORMATS.includes(uploaded.format.toLowerCase() as (typeof APPLICATION_DOCUMENT_FORMATS)[number]) ||
    uploaded.resource_type !== 'image' ||
    uploaded.type !== 'authenticated' ||
    !uploaded.bytes ||
    !uploaded.version ||
    !uploaded.signature
  ) {
    throw new Error('Réponse de stockage invalide.')
  }

  return {
    name: file.name,
    publicId: uploaded.public_id,
    format: uploaded.format.toLowerCase() as ApplicationDocumentUploadReference['format'],
    resourceType: 'image',
    deliveryType: 'authenticated',
    bytes: uploaded.bytes,
    version: uploaded.version,
    signature: uploaded.signature,
    intentToken: signed.upload.intentToken,
  }
}
