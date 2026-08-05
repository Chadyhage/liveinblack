import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { addGuestlistEntry, listGuestlistEntries, removeGuestlistEntry } from '@/lib/server/guestlist'

const addSchema = z.object({ placeId: z.string().trim().min(1), guestName: z.string().trim().min(1) })
const removeSchema = z.object({ ticketCode: z.string().trim().min(1) })

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await listGuestlistEntries({ id: session.user.id }, eventId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, entries: result.entries })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = addSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { eventId } = await params
  const result = await addGuestlistEntry({ id: session.user.id }, { eventId, ...parsed.data })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, entry: result.entry }, { status: 201 })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = removeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { eventId } = await params
  const result = await removeGuestlistEntry({ id: session.user.id }, { eventId, ticketCode: parsed.data.ticketCode })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
