import { NextResponse } from 'next/server'
import { sendEventRecapReminders } from '@/lib/server/organizer/organizerEvents'

// Récap organisateur "c'est dans 2 jours" — même garde secret que les
// autres crons (échec fermé si absent).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/event-recap] CRON_SECRET manquant — refus par défaut (échec fermé)')
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await sendEventRecapReminders()
  return NextResponse.json({ ok: true, ...result })
}
