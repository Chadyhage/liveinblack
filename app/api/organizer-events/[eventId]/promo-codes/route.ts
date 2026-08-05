import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createPromoCode, listPromoCodes, togglePromoCodeActive, deletePromoCode } from '@/lib/server/organizerPromoCodes'

const createSchema = z.object({
  code: z.string().trim().min(1),
  type: z.enum(['percent', 'fixed']),
  value: z.number(),
  maxUses: z.number().min(0).optional(),
  expiresAt: z.string().nullable().optional(),
})
const codeSchema = z.object({ code: z.string().trim().min(1) })

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await listPromoCodes({ id: session.user.id }, eventId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, promos: result.promos })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { eventId } = await params
  const result = await createPromoCode({ id: session.user.id }, eventId, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, promo: result.promo }, { status: 201 })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = codeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const { eventId } = await params
  const result = await togglePromoCodeActive({ id: session.user.id }, eventId, parsed.data.code)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, active: result.active })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = codeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const { eventId } = await params
  const result = await deletePromoCode({ id: session.user.id }, eventId, parsed.data.code)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
