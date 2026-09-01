import { NextResponse } from 'next/server'
import { getActiveResaleListingsForEvent } from '@/lib/server/events/resale'
import { getVercelOpsConfig } from '@/lib/server/vercelEdgeConfig'

// Public — pas d'auth requise (affiché sur la page événement pour tout
// visiteur, comme les places normales). Ne renvoie jamais l'identité du
// vendeur (lib/server/resale.ts::getActiveResaleListingsForEvent).
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const opsConfig = await getVercelOpsConfig()
  if (opsConfig.maintenanceMode || !opsConfig.ticketResaleEnabled) {
    return NextResponse.json({ ok: true, listings: [] })
  }

  const { eventId } = await params
  const listings = await getActiveResaleListingsForEvent(eventId)
  return NextResponse.json({ ok: true, listings })
}
