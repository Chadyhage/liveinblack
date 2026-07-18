import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createGroup } from '@/lib/server/groups'

// Crée une conversation de groupe — voir lib/server/groups.ts (createGroup)
// pour la validation complète (nom, bornes/déduplication des membres,
// résolution des noms depuis de vrais documents User).
const bodySchema = z.object({
  name: z.string().min(1),
  memberUserIds: z.array(z.string().min(1)),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await createGroup({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, conversation: result.conversation })
}
