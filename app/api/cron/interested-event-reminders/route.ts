import { NextResponse } from 'next/server'
import { sendInterestedEventReminders } from '@/lib/server/eventInterests'

// Batch qui peut grandir avec le volume de données (organisateurs, blocages,
// reventes...) — maxDuration configuré explicitement plutôt que de compter
// sur le défaut de la plateforme (#perf, 12/08/2026).
export const maxDuration = 60

// E22 : rappel J-1/J-2 pour chaque événement marqué "intéressé" par un
// utilisateur. Même garde secret que les autres crons (fail-closed si
// CRON_SECRET absent).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/interested-event-reminders] CRON_SECRET manquant — refus par défaut (échec fermé)')
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await sendInterestedEventReminders()
  return NextResponse.json({ ok: true, ...result })
}
