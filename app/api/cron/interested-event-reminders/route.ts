import { runVercelCron } from '@/lib/server/observability'
import { sendInterestedEventReminders } from '@/lib/server/events/eventInterests'

// E22 : rappel J-1/J-2 pour chaque événement marqué "intéressé" par un
// utilisateur. Même garde secret que les autres crons (fail-closed si
// CRON_SECRET absent).
export async function GET(req: Request) {
  return runVercelCron(req, { route: '/api/cron/interested-event-reminders' }, async () => sendInterestedEventReminders())
}
