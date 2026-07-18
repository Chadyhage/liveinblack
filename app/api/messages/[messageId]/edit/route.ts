import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { editMessage } from '@/lib/server/messaging'

// Édition d'un message texte — propriétaire seul, voir lib/server/messaging.ts
// (editMessage).
const bodySchema = z.object({ content: z.string().min(1).max(4000) })

export async function POST(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { messageId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await editMessage({ id: session.user.id }, { messageId, ...parsed.data })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, message: result.message })
}
