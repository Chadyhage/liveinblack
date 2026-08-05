import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { updatePreferences } from '@/lib/server/profile'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await updatePreferences({ id: session.user.id }, body as Record<string, unknown>)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, preferences: result.preferences })
}
