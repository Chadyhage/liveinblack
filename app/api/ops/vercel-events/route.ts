import { createHash } from 'node:crypto'
import { getDb } from '@/lib/db/mongoose'
import VercelPlatformEvent from '@/lib/models/VercelPlatformEvent'
import { verifyVercelSignature } from '@/lib/server/vercelSignature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

const RETENTION_DAYS = 90
const MAX_BODY_CHARS = 32_000

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.slice(0, 240)
  }
  return null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const secret = process.env.VERCEL_ACCOUNT_WEBHOOK_SECRET || process.env.VERCEL_WEBHOOK_SECRET

  if (!secret) {
    return new Response('Webhook secret missing', { status: 503 })
  }

  if (!verifyVercelSignature(rawBody, req.headers.get('x-vercel-signature'), secret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(rawBody)
  } catch {
    payload = {}
  }

  const nested = asRecord(payload.payload)
  const deployment = asRecord(nested.deployment)
  const project = asRecord(nested.project)
  const team = asRecord(nested.team)
  const fallbackHash = createHash('sha256').update(rawBody).digest('hex')
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000)

  await getDb()
  await VercelPlatformEvent.updateOne(
    { eventId: firstString(payload.id) ?? fallbackHash },
    {
      $setOnInsert: {
        eventId: firstString(payload.id) ?? fallbackHash,
        type: firstString(payload.type) ?? 'unknown',
        teamId: firstString(payload.teamId, nested.teamId, team.id),
        projectId: firstString(payload.projectId, nested.projectId, project.id, deployment.projectId),
        deploymentId: firstString(nested.deploymentId, deployment.id, deployment.uid),
        region: firstString(payload.region, nested.region),
        createdAtMs: firstNumber(payload.createdAt, nested.createdAt),
        bodySample: rawBody.slice(0, MAX_BODY_CHARS),
        expiresAt,
      },
    },
    { upsert: true }
  )

  return Response.json({ ok: true })
}
