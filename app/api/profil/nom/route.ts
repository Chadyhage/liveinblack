import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { updateName } from '@/lib/server/profile'

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await updateName({ id: session.user.id }, parsed.data)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...('nextChangeAllowedAt' in result ? { nextChangeAllowedAt: result.nextChangeAllowedAt } : {}) },
      { status: result.status }
    )
  }
  return NextResponse.json({ ok: true, firstName: result.firstName, lastName: result.lastName, nextChangeAllowedAt: result.nextChangeAllowedAt })
}
