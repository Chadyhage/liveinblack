import { NextResponse } from 'next/server'
import { sendEventRecapReminders } from '@/lib/server/organizerEvents'

// Batch qui peut grandir avec le volume de données (organisateurs, blocages,
// reventes...) — maxDuration configuré explicitement plutôt que de compter
// sur le défaut de la plateforme (#perf, 12/08/2026).
export const maxDuration = 60

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
