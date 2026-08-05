import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const presetName = process.env.CLOUDINARY_PRIVATE_UPLOAD_PRESET?.trim()
if (!presetName) throw new Error('CLOUDINARY_PRIVATE_UPLOAD_PRESET manquant')
const publicPresetName = process.env.CLOUDINARY_PUBLIC_UPLOAD_PRESET?.trim()
if (!publicPresetName) throw new Error('CLOUDINARY_PUBLIC_UPLOAD_PRESET manquant')

const { default: cloudinary } = await import('../lib/server/cloudinary')
const { APPLICATION_DOCUMENT_FORMATS, APPLICATION_DOCUMENT_MAX_BYTES } = await import('../lib/shared/applicationDocuments')

const privateOptions = {
  unsigned: false,
  allowed_formats: [...APPLICATION_DOCUMENT_FORMATS],
  max_file_size: APPLICATION_DOCUMENT_MAX_BYTES,
  type: 'authenticated' as const,
  disallow_public_id: true,
  use_filename: false,
  unique_filename: true,
  overwrite: false,
}

async function upsertPreset(name: string, options: Record<string, unknown>): Promise<void> {
  try {
    await cloudinary.api.upload_preset(name)
    await cloudinary.api.update_upload_preset(name, options)
    console.log(`Preset Cloudinary mis à jour : ${name}`)
  } catch (error) {
    const httpCode = (error as { http_code?: number }).http_code
    if (httpCode !== 404) throw error
    await cloudinary.api.create_upload_preset({ name, ...options })
    console.log(`Preset Cloudinary créé : ${name}`)
  }
}

await upsertPreset(presetName, privateOptions)
await upsertPreset(publicPresetName, {
  unsigned: false,
  allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm', 'mov'],
  max_file_size: 30_000_000,
  type: 'upload',
  disallow_public_id: true,
  use_filename: false,
  unique_filename: true,
  overwrite: false,
})
