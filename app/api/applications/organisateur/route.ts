import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getMyApplication } from '@/lib/server/applications'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const application = await getMyApplication({ id: session.user.id }, 'organisateur')
  return NextResponse.json({ ok: true, application })
}
