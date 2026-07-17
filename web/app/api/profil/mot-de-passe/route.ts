import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { changePassword } from '@/lib/server/profile'

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await changePassword({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
