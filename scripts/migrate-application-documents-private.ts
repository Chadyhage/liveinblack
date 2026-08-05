import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const apply = process.argv.includes('--apply')
const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME manquant')

const [{ getDb }, { default: Application }, { default: cloudinary }, { parseLegacyCloudinaryAssetUrl }] = await Promise.all([
  import('../lib/db/mongoose'),
  import('../lib/models/Application'),
  import('../lib/server/cloudinary'),
  import('../lib/server/cloudinaryLegacyUrl'),
])

type StoredDocument = {
  name?: string
  url?: string
  publicId?: string | null
  format?: string | null
  resourceType?: string | null
  deliveryType?: string | null
  version?: number | null
  size?: number
}

type CloudinaryAsset = {
  public_id: string
  format?: string
  resource_type: 'image' | 'raw'
  type: string
  version: number
  bytes?: number
}

function isNotFound(error: unknown): boolean {
  return (error as { http_code?: number }).http_code === 404
}

async function findAsset(
  candidates: string[],
  resourceType: 'image' | 'raw',
  deliveryType: 'upload' | 'authenticated'
): Promise<CloudinaryAsset | null> {
  for (const publicId of candidates) {
    try {
      return await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
        type: deliveryType,
      }) as CloudinaryAsset
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  return null
}

await getDb()

let scanned = 0
let candidates = 0
let migrated = 0
let skipped = 0
let missing = 0

for await (const application of Application.find({}).cursor()) {
  scanned++
  let changed = false
  const documents = application.documents as unknown as Map<string, StoredDocument[]>

  for (const [, entries] of documents.entries()) {
    for (const document of entries || []) {
      if (document.deliveryType === 'authenticated' && document.publicId) {
        skipped++
        continue
      }

      const parsed = parseLegacyCloudinaryAssetUrl(document.url || '', cloudName)
      if (!parsed) {
        skipped++
        continue
      }
      candidates++

      if (!apply) {
        console.log(`[DRY-RUN] ${String(application._id)} · ${document.name || parsed.publicIdCandidates[0]}`)
        continue
      }

      let asset = await findAsset(parsed.publicIdCandidates, parsed.resourceType, 'authenticated')
      if (!asset) {
        const publicAsset = await findAsset(parsed.publicIdCandidates, parsed.resourceType, 'upload')
        if (!publicAsset) {
          missing++
          console.warn(`[MANQUANT] ${String(application._id)} · ${document.name || parsed.publicIdCandidates[0]}`)
          continue
        }
        asset = await cloudinary.uploader.rename(publicAsset.public_id, publicAsset.public_id, {
          resource_type: parsed.resourceType,
          type: 'upload',
          to_type: 'authenticated',
          overwrite: false,
          invalidate: true,
        }) as CloudinaryAsset
      }

      document.url = ''
      document.publicId = asset.public_id
      document.format = String(asset.format || parsed.format).toLowerCase()
      document.resourceType = asset.resource_type
      document.deliveryType = 'authenticated'
      document.version = Number(asset.version)
      document.size = Number(asset.bytes || document.size || 0)
      changed = true
      migrated++
    }
  }

  if (changed) {
    application.markModified('documents')
    await application.save()
  }
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', scanned, candidates, migrated, skipped, missing }, null, 2))
await Application.db.close()
