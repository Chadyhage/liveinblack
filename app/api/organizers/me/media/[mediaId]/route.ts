import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { updateOrganizerMediaItem, removeOrganizerMedia } from '@/lib/server/organizerProfile'

const patchSchema = z.object({
  title: z.string().optional(),
  eventId: z.string().nullable().optional(),
  visibility: z.enum(['public', 'hidden']).optional(),
})

function requireOrganizerRole(role: string | undefined) {
  return role === 'organisateur' || role === 'agent'
}

export async function PATCH(req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireOrganizerRole(session.user.activeRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { mediaId } = await params
  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await updateOrganizerMediaItem({ id: session.user.id }, mediaId, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireOrganizerRole(session.user.activeRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { mediaId } = await params
  const result = await removeOrganizerMedia({ id: session.user.id }, mediaId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}
