import { NextResponse } from 'next/server'
import { sendSeatHoldExpiryReminders } from '@/lib/server/events/seatHolds'

// Rappel "ta place expire bientôt" (fenêtre J-2h/J-1h) — tourne plus souvent
// que /api/cron/seat-holds (sweep quotidien d'expiration réelle) puisqu'une
// fenêtre de 1h est trop étroite pour un cron une fois par jour. Même garde
// secret que les autres crons (échec fermé si absent).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/seat-hold-reminders] CRON_SECRET manquant — refus par défaut (échec fermé)')
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await sendSeatHoldExpiryReminders()
  return NextResponse.json({ ok: true, ...result })
}
