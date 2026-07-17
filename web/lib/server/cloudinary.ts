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
const MAX_DATA_URI_LENGTH = 8_000_000

export type UploadDataUriResult = { ok: true; url: string } | { ok: false; error: 'invalid_data_uri' | 'file_too_large' | 'upload_failed' }

export async function uploadDataUri(dataUri: string, folder: string): Promise<UploadDataUriResult> {
  if (!dataUri.startsWith('data:')) return { ok: false, error: 'invalid_data_uri' }
  if (dataUri.length > MAX_DATA_URI_LENGTH) return { ok: false, error: 'file_too_large' }

  try {
    const res = await cloudinary.uploader.upload(dataUri, { folder, resource_type: 'auto' })
    return { ok: true, url: res.secure_url }
  } catch {
    return { ok: false, error: 'upload_failed' }
  }
}
