import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import {
  PUBLIC_MEDIA_MIME_TYPES,
  PUBLIC_MEDIA_PURPOSES,
  PUBLIC_MEDIA_VIDEO_MAX_BYTES,
} from '@/lib/shared/publicMediaUploads'
import { createPublicMediaUploadSignature } from '@/lib/server/publicMediaUpload'

const bodySchema = z.object({
  purpose: z.enum(PUBLIC_MEDIA_PURPOSES),
  contentType: z.enum(PUBLIC_MEDIA_MIME_TYPES),
  size: z.number().int().positive().max(PUBLIC_MEDIA_VIDEO_MAX_BYTES),
})

function hasPurposeAccess(user: { activeRole?: string; roles?: string[] }, purpose: (typeof PUBLIC_MEDIA_PURPOSES)[number]): boolean {
  if (purpose === 'provider-catalog') return Boolean(user.roles?.includes('prestataire'))
  return user.activeRole === 'organisateur' || user.activeRole === 'agent'
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_media' }, { status: 400 })
  if (!hasPurposeAccess(session.user, parsed.data.purpose)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const limit = await checkRateLimit({
    scope: 'public-media-signature',
    identifier: session.user.id,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } }
    )
  }

  const upload = createPublicMediaUploadSignature({ owner: session.user.id, ...parsed.data })
  if (!upload.ok) return NextResponse.json({ error: upload.error }, { status: upload.error === 'invalid_media' ? 400 : 503 })
  return NextResponse.json({ ok: true, upload }, { headers: { 'Cache-Control': 'no-store' } })
}
