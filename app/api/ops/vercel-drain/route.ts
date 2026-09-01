import { createHash } from 'node:crypto'
import { getDb } from '@/lib/db/mongoose'
import VercelDrainEvent from '@/lib/models/VercelDrainEvent'
import { verifyVercelSignature } from '@/lib/server/vercelSignature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

const MAX_BODY_CHARS = 64_000
const RETENTION_DAYS = 14

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.slice(0, 600)
  }
  return ''
}

function summarizePayload(parsed: unknown) {
  const events = Array.isArray(parsed) ? parsed : [parsed]
  const first = asRecord(events[0])
  const text = asRecord(first.text)

  return {
    source: firstString(first.source, first.type),
    level: firstString(first.level),
    projectId: firstString(first.projectId, first.project_id),
    deploymentId: firstString(first.deploymentId, first.deployment_id),
    requestId: firstString(first.requestId, first.request_id, text.requestId),
    message: firstString(first.message, first.msg, first.text, text.msg, text.message),
    eventCount: Math.max(1, events.length),
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const secret = process.env.DRAIN_SECRET

  if (!secret) {
    return new Response('Drain secret missing', { status: 503 })
  }

  if (!verifyVercelSignature(rawBody, req.headers.get('x-vercel-signature'), secret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    parsed = {}
  }

  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const signatureHash = createHash('sha256').update(rawBody).digest('hex')
  const summary = summarizePayload(parsed)

  await getDb()
  await VercelDrainEvent.updateOne(
    { signatureHash },
    {
      $setOnInsert: {
        ...summary,
        signatureHash,
        bodySample: rawBody.slice(0, MAX_BODY_CHARS),
        expiresAt,
      },
    },
    { upsert: true }
  )

  return new Response('OK', { status: 200 })
}
