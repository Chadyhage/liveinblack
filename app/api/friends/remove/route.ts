import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { removeFriend } from '@/lib/server/friends'

// Retrait d'une amitié existante — voir lib/server/friends.ts (#43). Idempotent
// dans l'intention mais pas dans la réponse : appeler cette route alors
// qu'aucune amitié n'existe déjà renvoie 400 `not_friends` (signal
// significatif, pas un no-op silencieux).
const bodySchema = z.object({
  friendUserId: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await removeFriend({ id: session.user.id }, { friendUserId: parsed.data.friendUserId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
