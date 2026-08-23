import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listStarredMessages } from '@/lib/server/messaging/messaging'
import { parsePage, parsePageSize } from '@/lib/shared/pagination'

// Liste transversale des messages marqués "important" par l'appelant, toutes
// conversations confondues — pagination pour rester stable en montée en charge.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const url = new URL(req.url)
  const page = parsePage(url.searchParams.get('page'), 1, { min: 1, max: 4_000 })
  const pageSize = parsePageSize(url.searchParams.get('pageSize'), 50, { min: 10, max: 100 })

  const result = await listStarredMessages(
    { id: session.user.id },
    { page, pageSize },
  )
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({
    ok: true,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    hasMore: result.hasMore,
    messages: result.messages,
  })
}
