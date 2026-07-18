import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { starMessage, unstarMessage } from '@/lib/server/messaging'

// Marquer/retirer un message des "Importants" — voir lib/server/messaging.ts.
export async function POST(_req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { messageId } = await params
  const result = await starMessage({ id: session.user.id }, { messageId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, starred: result.starred })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { messageId } = await params
  const result = await unstarMessage({ id: session.user.id }, { messageId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, starred: result.starred })
}
