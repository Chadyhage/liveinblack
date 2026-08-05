import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { updatePhone } from '@/lib/server/profile'

const bodySchema = z.object({
  dialCode: z.string().trim().min(1).max(6),
  phone: z.string().trim().min(1).max(30),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await updatePhone({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, phone: result.phone })
}
