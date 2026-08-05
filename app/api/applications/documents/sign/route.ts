import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'
import {
  APPLICATION_DOCUMENT_MAX_BYTES,
  APPLICATION_DOCUMENT_MIME_TYPES,
} from '@/lib/shared/applicationDocuments'
import {
  applicationUploadOwner,
  createApplicationUploadSignature,
} from '@/lib/server/applicationUpload'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(180),
  contentType: z.enum(APPLICATION_DOCUMENT_MIME_TYPES),
  size: z.number().int().positive().max(APPLICATION_DOCUMENT_MAX_BYTES),
})

export async function POST(req: Request) {
  const session = await auth()
  const identifier = session?.user?.id || getRequestIp(req)
  const limit = await checkRateLimit({
    scope: 'application-document-signature',
    identifier,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } }
    )
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_document' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const result = createApplicationUploadSignature(applicationUploadOwner(session?.user?.id))
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json(
    { ok: true, upload: result },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
