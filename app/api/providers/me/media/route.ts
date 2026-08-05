import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { canProposeServices } from '@/lib/server/permissions'
import { uploadProviderProfileMedia } from '@/lib/server/providerProfile'

const uploadSchema = z.object({
  kind: z.enum(['avatar', 'cover']),
  dataUri: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!canProposeServices(session.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = uploadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await uploadProviderProfileMedia({ id: session.user.id }, parsed.data.kind, parsed.data.dataUri)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}
