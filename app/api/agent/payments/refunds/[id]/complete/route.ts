import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { completeManualRefund } from '@/lib/server/agent/agentPayments'
import { auditContextFromRequest } from '@/lib/server/refunds/refundCases'
import { verifyPublicMediaUploadReference } from '@/lib/server/publicMediaUpload'
import { publicMediaUploadReferenceSchema } from '@/lib/shared/publicMediaUploads'

const bodySchema = z.object({
  code: z.string().trim().min(8),
  signatureUrl: z.string().trim().min(1).max(2000).optional(),
  signatureUpload: publicMediaUploadReferenceSchema.optional(),
}).refine((value) => Boolean(value.signatureUrl?.trim() || value.signatureUpload), { path: ['signatureUrl'], message: 'signature_required' })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { id } = await params
  let signatureUrl = parsed.data.signatureUrl?.trim() || ''
  if (parsed.data.signatureUpload) {
    const verified = await verifyPublicMediaUploadReference(parsed.data.signatureUpload, session!.user!.id, 'refund-proof')
    if (!verified.ok) return NextResponse.json({ error: 'invalid_signature_upload' }, { status: 400 })
    signatureUrl = verified.url
  }
  const agentName = [session!.user!.name].filter(Boolean).join(' ') || session!.user!.email || 'Agent'
  const result = await completeManualRefund({ id: session!.user!.id, name: agentName }, id, { code: parsed.data.code, signatureUrl }, auditContextFromRequest(req))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
