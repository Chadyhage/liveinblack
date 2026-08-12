import { NextResponse } from 'next/server'
import { expireStaleResaleListings } from '@/lib/server/resale'

// Batch qui peut grandir avec le volume de données (organisateurs, blocages,
// reventes...) — maxDuration configuré explicitement plutôt que de compter
// sur le défaut de la plateforme (#perf, 12/08/2026).
export const maxDuration = 60

// Ferme les annonces de revente dont la fenêtre est passée (closesAt) sans
// trouver d'acheteur — jusqu'ici jamais basculé en base (vérifié : seule une
// vérification à la volée en lecture existait). Même garde secret que les
// autres crons.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/resale-expiry] CRON_SECRET manquant — refus par défaut (échec fermé)')
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await expireStaleResaleListings()
  return NextResponse.json({ ok: true, ...result })
}
