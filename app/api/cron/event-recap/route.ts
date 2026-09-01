import { runVercelCron } from '@/lib/server/observability'
import { sendEventRecapReminders } from '@/lib/server/organizer/organizerEvents'

// Récap organisateur "c'est dans 2 jours" — même garde secret que les
// autres crons (échec fermé si absent).
export async function GET(req: Request) {
  return runVercelCron(req, { route: '/api/cron/event-recap' }, async () => sendEventRecapReminders())
}
