import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { updateAvatar } from '@/lib/server/profile'
import { publicMediaUploadReferenceSchema } from '@/lib/shared/publicMediaUploads'

// Union dataUri (legacy, encore utilisé par l'app mobile) / upload (direct
// signé, voir lib/server/profile.ts::updateAvatar) — même convention que
// app/api/organizer-events/media/route.ts.
const bodySchema = z.union([
  z.object({ dataUri: z.string().min(1) }),
  z.object({ upload: publicMediaUploadReferenceSchema }),
])

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await updateAvatar({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, avatarUrl: result.avatarUrl })
}
