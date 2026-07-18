import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { moderateApplication, type AgentApplicationAction } from '@/lib/server/applications'

const ACTIONS: AgentApplicationAction[] = ['under_review', 'approve', 'request_changes', 'reject', 'suspend', 'reactivate']

const bodySchema = z.object({
  action: z.enum(ACTIONS as [AgentApplicationAction, ...AgentApplicationAction[]]),
  note: z.string().trim().max(2000).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { id } = await params
  const agentName = [session!.user!.name].filter(Boolean).join(' ') || session!.user!.email || 'Agent'
  const result = await moderateApplication({ id: session!.user!.id, name: agentName }, id, parsed.data.action, parsed.data.note)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, application: result.application })
}
