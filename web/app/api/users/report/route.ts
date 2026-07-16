import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { reportUser } from '@/lib/server/messaging'

// max(1000) aligné sur le cap métier réel appliqué par reportUser
// (lib/server/messaging.ts) — un schéma de route plus permissif que la
// fonction qu'il protège est trompeur : il laisse croire que la couche API
// borne déjà la requête alors que seule la fonction le fait.
const bodySchema = z.object({ targetUserId: z.string().min(1), reason: z.string().max(1000) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await reportUser({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
