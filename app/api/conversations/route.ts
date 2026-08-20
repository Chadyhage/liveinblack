import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createDirectConversation, listMyConversations } from '@/lib/server/messaging'

// POST : ouvre (ou retrouve) une conversation directe avec `otherUserId` —
// voir lib/server/messaging.ts pour le find-or-create et le check de
// blocage à la création. GET : liste des conversations de l'appelant, avec
// unreadCount par conversation.
const bodySchema = z.object({ otherUserId: z.string().min(1) })

const getListSchema = z.object({
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await createDirectConversation({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, conversation: result.conversation })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const url = new URL(req.url)
  // Ne transmet pas `null` à z.coerce.number() : `Number(null) === 0`, ce
  // qui contournait les `.default()` et faisait échouer la requête mobile
  // `/api/conversations` sans paramètres avec `page` trop petit. Les
  // paramètres absents doivent réellement laisser Zod appliquer 1/20.
  const query: Record<string, string> = {}
  const page = url.searchParams.get('page')
  const pageSize = url.searchParams.get('pageSize')
  if (page !== null) query.page = page
  if (pageSize !== null) query.pageSize = pageSize
  const parsed = getListSchema.safeParse(query)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_query', details: parsed.error.flatten() }, { status: 400 })
  }

  const result = await listMyConversations({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({
    ok: true,
    conversations: result.conversations,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    hasMore: result.hasMore,
  })
}
