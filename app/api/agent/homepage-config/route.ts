import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import {
  getHomepageConfig,
  updateHomepageConfig,
  listCandidateEventsForActualite,
  resolveActualiteEventLabels,
} from '@/lib/server/agentHomepageConfig'

const ACCENTS = ['teal', 'gold', 'pink'] as const

const bodySchema = z.object({
  active: z.boolean().default(false),
  title: z.string().default(''),
  subtitle: z.string().default(''),
  accent: z.enum(ACCENTS).default('teal'),
  eventIds: z.array(z.string()).default([]),
})

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const config = await getHomepageConfig()
  const [candidateEvents, selectedEventLabels] = await Promise.all([
    listCandidateEventsForActualite(),
    resolveActualiteEventLabels(config.eventIds),
  ])
  return NextResponse.json({ ok: true, config, candidateEvents, selectedEventLabels })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const config = await updateHomepageConfig({ id: session!.user!.id }, parsed.data)
  return NextResponse.json({ ok: true, config })
}
