import {
  PUBLIC_MEDIA_IMAGE_MAX_BYTES,
  PUBLIC_MEDIA_MIME_TYPES,
  PUBLIC_MEDIA_VIDEO_MAX_BYTES,
  PUBLIC_MEDIA_FORMATS,
  type PublicMediaPurpose,
  type PublicMediaUploadReference,
} from '../shared/publicMediaUploads'

type SignatureResponse = {
  ok: true
  upload: {
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

// Ajouté suite à l'audit de scalabilité du 12/08/2026 — plusieurs écrans
// (avatar profil, affiche événement, avatar/couverture prestataire...)
// produisent l'image finale via un canvas de recadrage (`canvas.toDataURL`),
// jamais un vrai `File` — ce helper convertit ce data URI en `File` pour
// pouvoir passer par uploadPublicMedia() (upload direct signé) au lieu du
// transit base64 par le serveur Next. Généraliser progressivement ce
// pattern aux autres écrans de recadrage est le prolongement naturel de
// cette migration (non fait dans ce lot pour tous les écrans, voir
// commentaires des fonctions serveur concernées).
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',')
  const mimeMatch = /data:(.*?);base64/.exec(header)
  const mime = mimeMatch?.[1] || 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}

export async function uploadPublicMedia(file: File, purpose: PublicMediaPurpose): Promise<PublicMediaUploadReference> {
  if (!PUBLIC_MEDIA_MIME_TYPES.includes(file.type as (typeof PUBLIC_MEDIA_MIME_TYPES)[number])) {
    throw new Error('Format de média non accepté.')
  }
  const maxBytes = file.type.startsWith('video/') ? PUBLIC_MEDIA_VIDEO_MAX_BYTES : PUBLIC_MEDIA_IMAGE_MAX_BYTES
  if (file.size <= 0 || file.size > maxBytes) {
    throw new Error(file.type.startsWith('video/') ? 'La vidéo dépasse 30 Mo.' : 'L’image dépasse 10 Mo.')
  }

  const signResponse = await fetch('/api/uploads/media/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose, contentType: file.type, size: file.size }),
  })
  const signed = (await signResponse.json().catch(() => null)) as SignatureResponse | null
  if (!signResponse.ok || !signed?.ok) throw new Error('Impossible de préparer l’envoi du média.')

  const body = new FormData()
  body.append('file', file)
  body.append('api_key', signed.upload.apiKey)
  body.append('timestamp', String(signed.upload.timestamp))
  body.append('folder', signed.upload.folder)
  body.append('type', signed.upload.deliveryType)
  body.append('allowed_formats', signed.upload.allowedFormats)
  body.append('upload_preset', signed.upload.uploadPreset)
  body.append('signature', signed.upload.signature)

  const uploadResponse = await fetch(signed.upload.uploadUrl, { method: 'POST', body })
  const uploaded = (await uploadResponse.json().catch(() => null)) as CloudinaryUploadResponse | null
  if (!uploadResponse.ok || !uploaded) throw new Error(uploaded?.error?.message || 'Échec de l’envoi du média.')

  const format = uploaded.format?.toLowerCase()
  if (
    !uploaded.public_id ||
    !format ||
    !PUBLIC_MEDIA_FORMATS.includes(format as (typeof PUBLIC_MEDIA_FORMATS)[number]) ||
    uploaded.resource_type !== signed.upload.resourceType ||
    uploaded.type !== 'upload' ||
    !uploaded.bytes ||
    uploaded.bytes > maxBytes ||
    !uploaded.version ||
    !uploaded.signature
  ) {
    throw new Error('Réponse de stockage invalide.')
  }

  return {
    publicId: uploaded.public_id,
    format: format as PublicMediaUploadReference['format'],
    resourceType: signed.upload.resourceType,
    deliveryType: 'upload',
    bytes: uploaded.bytes,
    version: uploaded.version,
    signature: uploaded.signature,
    intentToken: signed.upload.intentToken,
  }
}
