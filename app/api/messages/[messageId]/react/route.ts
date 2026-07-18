import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { reactToMessage } from '@/lib/server/messaging'

// Bascule single-select (toggle) d'une réaction emoji — voir
// lib/server/messaging.ts (reactToMessage) pour la mise à jour atomique par
// pipeline d'agrégation sur le champ Map `reactions`.
// max(32) : large marge au-delà de la séquence emoji la plus longue
// plausible (ZWJ + variation selectors + modificateurs de peau empilés),
// mais borne quand même la taille — sans ce cap, une chaîne de plusieurs
// méga-octets passerait `min(1)` telle quelle et deviendrait une clé
// permanente de `Message.reactions`, lue par tous les participants
// (voir aussi le cap défensif dans reactToMessage lui-même).
const bodySchema = z.object({ emoji: z.string().min(1).max(32) })

export async function POST(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { messageId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await reactToMessage({ id: session.user.id }, { messageId, emoji: parsed.data.emoji })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, reactions: result.reactions })
}
