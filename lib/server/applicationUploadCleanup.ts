import Application from '../models/Application'
import cloudinary from './cloudinary'
import { getDb } from '../db/mongoose'

const ABANDONED_UPLOAD_AGE_MS = 48 * 60 * 60 * 1000
const MAX_PAGES_PER_RUN = 10

type StoredDocument = { publicId?: string | null }
type CloudinaryResource = { public_id?: string; created_at?: string }

function referencedPublicIds(applications: Array<{ documents?: unknown }>): Set<string> {
  const ids = new Set<string>()
  for (const application of applications) {
    const documents = application.documents as Map<string, StoredDocument[]> | Record<string, StoredDocument[]> | undefined
    if (!documents) continue
    const groups = documents instanceof Map ? documents.values() : Object.values(documents)
    for (const group of groups) {
      for (const document of group || []) {
        if (document.publicId) ids.add(document.publicId)
      }
    }
  }
  return ids
}

export type ApplicationUploadCleanupResult = {
  scanned: number
  deleted: number
  skipped: number
  configured: boolean
  truncated: boolean
}

export async function cleanupAbandonedApplicationUploads(now: number = Date.now()): Promise<ApplicationUploadCleanupResult> {
  const configured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  )
  const result: ApplicationUploadCleanupResult = { scanned: 0, deleted: 0, skipped: 0, configured, truncated: false }
  if (!configured) return result

  await getDb()
  const applications = await Application.find({}).select('documents').lean()
  const referenced = referencedPublicIds(applications as Array<{ documents?: unknown }>)
  const cutoff = now - ABANDONED_UPLOAD_AGE_MS
  let nextCursor: string | undefined

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const response = await cloudinary.api.resources({
      resource_type: 'image',
      type: 'authenticated',
      prefix: 'applications/pending/',
      max_results: 100,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    }) as { resources?: CloudinaryResource[]; next_cursor?: string }

    for (const resource of response.resources || []) {
      result.scanned++
      const publicId = resource.public_id || ''
      const createdAt = Date.parse(resource.created_at || '')
      if (!publicId || !Number.isFinite(createdAt) || createdAt > cutoff || referenced.has(publicId)) {
        result.skipped++
        continue
      }

      const deletion = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true,
      })
      if (deletion.result === 'ok' || deletion.result === 'not found') result.deleted++
      else result.skipped++
    }

    nextCursor = response.next_cursor
    if (!nextCursor) return result
  }

  result.truncated = Boolean(nextCursor)
  return result
}
