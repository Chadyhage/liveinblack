import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { getDb } from '@/lib/db/mongoose'
import VercelDrainEvent from '@/lib/models/VercelDrainEvent'
import VercelPlatformEvent from '@/lib/models/VercelPlatformEvent'
import VercelSpendEvent from '@/lib/models/VercelSpendEvent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

type Source = 'platform' | 'spend' | 'drain'

function getLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? '30', 10)
  if (!Number.isFinite(parsed)) return 30
  return Math.min(100, Math.max(1, parsed))
}

function getSource(value: string | null): Source | 'all' {
  if (value === 'platform' || value === 'spend' || value === 'drain') return value
  return 'all'
}

function cleanSample(sample: unknown) {
  if (typeof sample !== 'string') return undefined
  return sample
    .replace(/"authorization"\s*:\s*"[^"]+"/gi, '"authorization":"[redacted]"')
    .replace(/"cookie"\s*:\s*"[^"]+"/gi, '"cookie":"[redacted]"')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"[redacted]"')
    .slice(0, 2_000)
}

export async function GET(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const source = getSource(url.searchParams.get('source'))
  const type = url.searchParams.get('type')?.trim()
  const limit = getLimit(url.searchParams.get('limit'))
  const includeSample = url.searchParams.get('includeSample') === '1'

  await getDb()

  const queries: Array<Promise<Array<Record<string, unknown>>>> = []

  if (source === 'all' || source === 'platform') {
    const filter = type ? { type } : {}
    queries.push(
      VercelPlatformEvent.find(filter)
        .sort({ receivedAt: -1 })
        .limit(limit)
        .lean()
        .then((events) =>
          events.map((event) => ({
            source: 'platform',
            id: event.eventId,
            type: event.type,
            teamId: event.teamId,
            projectId: event.projectId,
            deploymentId: event.deploymentId,
            region: event.region,
            createdAtMs: event.createdAtMs,
            receivedAt: event.receivedAt,
            ...(includeSample ? { sample: cleanSample(event.bodySample) } : {}),
          }))
        )
    )
  }

  if (source === 'all' || source === 'spend') {
    queries.push(
      VercelSpendEvent.find({})
        .sort({ receivedAt: -1 })
        .limit(limit)
        .lean()
        .then((events) =>
          events.map((event) => ({
            source: 'spend',
            id: event.signatureHash,
            type: event.type,
            teamId: event.teamId,
            budgetAmount: event.budgetAmount,
            currentSpend: event.currentSpend,
            thresholdPercent: event.thresholdPercent,
            autoMaintenanceTriggered: event.autoMaintenanceTriggered,
            receivedAt: event.receivedAt,
            ...(includeSample ? { sample: cleanSample(event.bodySample) } : {}),
          }))
        )
    )
  }

  if (source === 'all' || source === 'drain') {
    const filter = type ? { level: type } : {}
    queries.push(
      VercelDrainEvent.find(filter)
        .sort({ receivedAt: -1 })
        .limit(limit)
        .lean()
        .then((events) =>
          events.map((event) => ({
            source: 'drain',
            id: event.signatureHash,
            type: event.level,
            projectId: event.projectId,
            deploymentId: event.deploymentId,
            requestId: event.requestId,
            eventCount: event.eventCount,
            message: event.message,
            receivedAt: event.receivedAt,
            ...(includeSample ? { sample: cleanSample(event.bodySample) } : {}),
          }))
        )
    )
  }

  const events = (await Promise.all(queries))
    .flat()
    .sort((a, b) => new Date(String(b.receivedAt)).getTime() - new Date(String(a.receivedAt)).getTime())
    .slice(0, limit)

  return NextResponse.json({ ok: true, events })
}
