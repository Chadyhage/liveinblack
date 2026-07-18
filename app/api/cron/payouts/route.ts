import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/mongoose'
import { processEventPayouts } from '@/lib/server/eventPayouts'

// Remplace la partie "versements" de api/cron-subscriptions.js. FERME L'AUDIT
// C09 : contrairement au legacy (qui continuait sans secret si la variable
// d'env était absente), ici l'absence de CRON_SECRET fait échouer FERMÉ —
// jamais une route publique ne doit pouvoir déclencher des versements.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/payouts] CRON_SECRET manquant — refus par défaut (échec fermé, audit C09)')
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  await getDb()
  const result = await processEventPayouts()
  return NextResponse.json(result)
}
