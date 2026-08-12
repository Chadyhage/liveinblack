import { NextResponse } from 'next/server'
import { sendPendingCashSaleReminders } from '@/lib/server/agentSales'

// Batch qui peut grandir avec le volume de données (organisateurs, blocages,
// reventes...) — maxDuration configuré explicitement plutôt que de compter
// sur le défaut de la plateforme (#perf, 12/08/2026).
export const maxDuration = 60

// Rappel agent "règlement en attente depuis 2 jours" — même garde secret que
// les autres crons (échec fermé si absent).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/cash-sale-reminders] CRON_SECRET manquant — refus par défaut (échec fermé)')
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await sendPendingCashSaleReminders()
  return NextResponse.json({ ok: true, ...result })
}
