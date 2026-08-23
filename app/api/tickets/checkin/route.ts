import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { checkinTicket } from '@/lib/server/events/ticketCheckin'

// Remplace api/tickets.js (action 'checkin'). Le scanner envoie SOIT le jeton
// décodé depuis l'URL du QR (`token`), SOIT un code saisi manuellement
// (`ticketCode`) — jamais les deux : voir lib/server/ticketCheckin.ts pour la
// logique de fraîcheur/autorisation, qui diffère selon le cas.
const bodySchema = z
  .object({
    token: z.string().min(1).optional(),
    ticketCode: z.string().min(1).optional(),
    // Événement du scanner APPELANT — sans ce champ, un billet de
    // l'événement B se check-in avec succès depuis le scanner de
    // l'événement A (bug de sécurité confirmé par audit) : voir la
    // comparaison ticket.eventId !== eventId dans checkinTicket.
    eventId: z.string().min(1),
  })
  .refine((v) => Boolean(v.token) !== Boolean(v.ticketCode), { message: 'token ou ticketCode requis (un seul des deux)' })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const input = parsed.data.token
    ? { token: parsed.data.token, eventId: parsed.data.eventId }
    : { ticketCode: parsed.data.ticketCode!, eventId: parsed.data.eventId }
  const result = await checkinTicket({ id: session.user.id, roles: session.user.roles }, input)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, alreadyCheckedIn: result.alreadyCheckedIn, pointAwarded: result.pointAwarded, ticket: result.ticket })
}
