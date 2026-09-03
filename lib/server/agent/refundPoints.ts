import mongoose from 'mongoose'
import { getDb } from '@/lib/db/mongoose'
import RefundPoint from '@/lib/models/RefundPoint'

export interface RefundPointInput {
  name: string
  address: string
  city?: string | null
  active?: boolean
  agentIds?: string[]
}

export interface AgentRefundPointView {
  id: string
  name: string
  address: string
  city: string
  country: 'BJ'
  active: boolean
  agentIds: string[]
  cashDisbursedXOF: number
  cashDisbursementCount: number
  createdAt: string | null
  updatedAt: string | null
}

type RefundPointResult = { ok: false; status: number; error: string } | { ok: true; point: AgentRefundPointView }
type NormalizedRefundPointInput = {
  name: string
  address: string
  city: string
  active: boolean
  agentIds: string[]
}

function sanitizeAgentIds(agentIds: string[] | undefined): string[] {
  return [...new Set((agentIds || []).map((id) => id.trim()).filter(Boolean))]
}

function mapRefundPoint(point: {
  _id: unknown
  name: string
  address: string
  city?: string | null
  country?: string | null
  active?: boolean | null
  agentIds?: string[] | null
  cashDisbursedMinor?: number | null
  cashDisbursementCount?: number | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}): AgentRefundPointView {
  return {
    id: String(point._id),
    name: point.name,
    address: point.address,
    city: point.city || '',
    country: 'BJ',
    active: point.active !== false,
    agentIds: point.agentIds || [],
    cashDisbursedXOF: Math.max(0, Math.round(Number(point.cashDisbursedMinor || 0))),
    cashDisbursementCount: Math.max(0, Math.round(Number(point.cashDisbursementCount || 0))),
    createdAt: point.createdAt ? new Date(point.createdAt).toISOString() : null,
    updatedAt: point.updatedAt ? new Date(point.updatedAt).toISOString() : null,
  }
}

function normalizeRefundPointInput(input: RefundPointInput): NormalizedRefundPointInput | null {
  const name = input.name.trim()
  const address = input.address.trim()
  if (!name || !address) return null
  return {
    name,
    address,
    city: input.city?.trim() || '',
    active: input.active !== false,
    agentIds: sanitizeAgentIds(input.agentIds),
  }
}

export async function listAgentRefundPoints(): Promise<AgentRefundPointView[]> {
  await getDb()
  const points = await RefundPoint.find({ country: 'BJ' }).sort({ active: -1, city: 1, name: 1 }).lean()
  return points.map(mapRefundPoint)
}

export async function createAgentRefundPoint(input: RefundPointInput): Promise<RefundPointResult> {
  await getDb()
  const clean = normalizeRefundPointInput(input)
  if (!clean) return { ok: false, status: 400, error: 'invalid_refund_point' }

  const point = await RefundPoint.create({
    name: clean.name,
    address: clean.address,
    city: clean.city,
    country: 'BJ',
    active: clean.active,
    agentIds: clean.agentIds,
  })
  return { ok: true, point: mapRefundPoint(point) }
}

export async function updateAgentRefundPoint(pointId: string, input: RefundPointInput): Promise<RefundPointResult> {
  await getDb()
  if (!mongoose.isValidObjectId(pointId)) return { ok: false, status: 404, error: 'not_found' }
  const clean = normalizeRefundPointInput(input)
  if (!clean) return { ok: false, status: 400, error: 'invalid_refund_point' }

  const point = await RefundPoint.findOneAndUpdate(
    { _id: pointId, country: 'BJ' },
    {
      $set: {
        name: clean.name,
        address: clean.address,
        city: clean.city,
        active: clean.active,
        agentIds: clean.agentIds,
      },
    },
    { new: true },
  )
  if (!point) return { ok: false, status: 404, error: 'not_found' }
  return { ok: true, point: mapRefundPoint(point) }
}
