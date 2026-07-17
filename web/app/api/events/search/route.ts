import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { searchPublicEvents } from '@/lib/server/events'

// Recherche d'événements PUBLICS pour l'EventPickerModal de MessagesClient.tsx
// ('Partager un événement' → sondage 'On y va ?', voir POST
// /api/conversations/[id]/polls avec kind:'event_poll'). Volontairement une
// forme minimale (id/name/date/city/image) : createEventPoll (lib/server/
// polls.ts) recharge de toute façon l'Event complet depuis sa propre
// collection au moment de la création du sondage, jamais depuis ce qui est
// affiché ici dans le picker.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q') ?? ''
  const events = await searchPublicEvents(q)

  return NextResponse.json({
    ok: true,
    events: events.map((e) => ({ id: e.id, name: e.name, date: e.date, city: e.city, image: e.imageUrl ?? null })),
  })
}
