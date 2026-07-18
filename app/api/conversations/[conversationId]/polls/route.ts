import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createPoll, createEventPoll } from '@/lib/server/polls'

// Création d'un sondage ('poll') ou d'un sondage-événement ('event_poll')
// dans une conversation. Union discriminée sur `kind` — chaque branche
// délègue à la fonction serveur dédiée, qui porte TOUTE la logique de
// validation métier (compte de participants, mute, question/options,
// existence de l'événement). Le schéma zod ici ne fait qu'une validation
// d'ENVELOPPE (formes/types) : les règles fines (2 à 6 options, longueur,
// doublons...) sont volontairement laissées à lib/server/polls.ts pour ne
// jamais dupliquer/diverger d'une seule source de vérité.
const bodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('poll'),
    question: z.string(),
    options: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('event_poll'),
    eventId: z.string().min(1),
  }),
])

export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const caller = { id: session.user.id }
  const result =
    parsed.data.kind === 'poll'
      ? await createPoll(caller, { conversationId, question: parsed.data.question, options: parsed.data.options })
      : await createEventPoll(caller, { conversationId, eventId: parsed.data.eventId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, message: result.message })
}
