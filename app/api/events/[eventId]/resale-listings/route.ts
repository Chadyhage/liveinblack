import { NextResponse } from 'next/server'
import { getActiveResaleListingsForEvent } from '@/lib/server/events/resale'

// Public — pas d'auth requise (affiché sur la page événement pour tout
// visiteur, comme les places normales). Ne renvoie jamais l'identité du
// vendeur (lib/server/resale.ts::getActiveResaleListingsForEvent).
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const listings = await getActiveResaleListingsForEvent(eventId)
  return NextResponse.json({ ok: true, listings })
}
