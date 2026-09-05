import { getDb } from '@/lib/db/mongoose'
import { runVercelCron } from '@/lib/server/observability'
import { processEventPayouts } from '@/lib/server/events/eventPayouts'

// Remplace la partie "versements" de api/cron-subscriptions.js. FERME L'AUDIT
// C09 : contrairement au legacy (qui continuait sans secret si la variable
// d'env était absente), ici l'absence de CRON_SECRET fait échouer FERMÉ —
// jamais une route publique ne doit pouvoir déclencher des versements.
export async function GET(req: Request) {
  return runVercelCron(req, { route: '/api/cron/payouts' }, async () => {
    await getDb()
    return processEventPayouts()
  })
}
