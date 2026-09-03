import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { auditContextFromRequest, declareIndividualRefund } from '@/lib/server/refunds/refundCases'
import { verifyPublicMediaUploadReference } from '@/lib/server/publicMediaUpload'
import { publicMediaUploadReferenceSchema } from '@/lib/shared/publicMediaUploads'

const bodySchema = z.object({
  reference: z.string().trim().min(1).max(160),
  channel: z.string().trim().min(1).max(80),
  proofUrl: z.string().trim().max(2000).optional(),
  proofUpload: publicMediaUploadReferenceSchema.optional(),
  declaredAt: z.string().datetime().optional(),
}).refine((value) => Boolean(value.proofUrl?.trim() || value.proofUpload), { path: ['proofUrl'], message: 'proof_required' })

export async function POST(req: Request, { params }: { params: Promise<{ refundCaseId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { refundCaseId } = await params
  let proofUrl = parsed.data.proofUrl?.trim() || ''
  if (parsed.data.proofUpload) {
    const verified = await verifyPublicMediaUploadReference(parsed.data.proofUpload, session.user.id, 'refund-proof')
    if (!verified.ok) return NextResponse.json({ error: 'invalid_proof_upload' }, { status: 400 })
    proofUrl = verified.url
  }

  const result = await declareIndividualRefund(session.user.id, refundCaseId, {
    reference: parsed.data.reference,
    channel: parsed.data.channel,
    proofUrl,
    declaredAt: parsed.data.declaredAt ? new Date(parsed.data.declaredAt) : null,
  }, auditContextFromRequest(req))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
