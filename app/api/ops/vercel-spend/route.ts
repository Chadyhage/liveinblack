import { createHash } from 'node:crypto'
import { getDb } from '@/lib/db/mongoose'
import VercelSpendEvent from '@/lib/models/VercelSpendEvent'
import { verifyVercelSignature } from '@/lib/server/vercelSignature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

const RETENTION_DAYS = 90
const MAX_BODY_CHARS = 32_000

function parseEdgeConfigId() {
  const connection = process.env.EDGE_CONFIG || ''
  try {
    const url = new URL(connection)
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id || process.env.VERCEL_EDGE_CONFIG_ID || ''
  } catch {
    const match = connection.match(/id=([^&]+)/)
    return match?.[1] || process.env.VERCEL_EDGE_CONFIG_ID || ''
  }
}

async function triggerMaintenanceMode() {
  if (process.env.VERCEL_SPEND_AUTO_MAINTENANCE !== '1') return false
  const token = process.env.VERCEL_API_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID
  const edgeConfigId = parseEdgeConfigId()
  if (!token || !teamId || !edgeConfigId) return false

  const res = await fetch(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items?teamId=${teamId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        { operation: 'upsert', key: 'maintenance_mode', value: true },
        { operation: 'upsert', key: 'checkout_enabled', value: false },
      ],
    }),
  })

  return res.ok
}

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const secret = process.env.VERCEL_SPEND_WEBHOOK_SECRET || process.env.VERCEL_WEBHOOK_SECRET

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

  const thresholdPercent = toNumber(payload.thresholdPercent)
  const autoMaintenanceTriggered = thresholdPercent === 100 ? await triggerMaintenanceMode() : false
  const signatureHash = createHash('sha256').update(rawBody).digest('hex')
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000)

  await getDb()
  await VercelSpendEvent.updateOne(
    { signatureHash },
    {
      $setOnInsert: {
        teamId: typeof payload.teamId === 'string' ? payload.teamId : 'unknown',
        type: typeof payload.type === 'string' ? payload.type : null,
        budgetAmount: toNumber(payload.budgetAmount),
        currentSpend: toNumber(payload.currentSpend),
        thresholdPercent,
        autoMaintenanceTriggered,
        bodySample: rawBody.slice(0, MAX_BODY_CHARS),
        signatureHash,
        expiresAt,
      },
    },
    { upsert: true }
  )

  return Response.json({ ok: true, autoMaintenanceTriggered })
}
