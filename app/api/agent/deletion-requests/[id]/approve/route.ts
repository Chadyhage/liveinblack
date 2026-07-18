import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { approveDeletion } from '@/lib/server/agentDeletion'

const bodySchema = z.object({ note: z.string().trim().max(2000).optional() })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { id } = await params
  const agentName = [session!.user!.name].filter(Boolean).join(' ') || session!.user!.email || 'Agent'
  const result = await approveDeletion({ id: session!.user!.id, name: agentName }, id, parsed.data.note)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
