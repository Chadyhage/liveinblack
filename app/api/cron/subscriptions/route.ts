import { NextResponse } from 'next/server'
import { runSubscriptionReminderCron } from '@/lib/server/providerSubscriptions'

// Remplace la partie "abonnements" de api/cron-subscriptions.js (rappels
// J-7/J-3/J-1/J0/grâce/masquage, rail XOF uniquement). Même garde-fou que
// /api/cron/payouts : CRON_SECRET absent → échec fermé (audit C09), jamais
// une route publique ne doit pouvoir déclencher ce cron.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/subscriptions] CRON_SECRET manquant — refus par défaut (échec fermé, audit C09)')
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await runSubscriptionReminderCron()
  return NextResponse.json({ ok: true, ...result })
}
