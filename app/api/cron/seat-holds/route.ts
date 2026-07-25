import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/mongoose'
import { releaseExpiredSeatHolds } from '@/lib/server/seatHolds'

// Sweep des blocages de place ('active') dont le solde n'a jamais été payé
// avant expiresAt — relâche la place, acompte non remboursé (décision
// produit). Même garde secret que les autres crons (échec fermé si absent).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/seat-holds] CRON_SECRET manquant — refus par défaut (échec fermé)')
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  await getDb()
  const result = await releaseExpiredSeatHolds()
  return NextResponse.json(result)
}
