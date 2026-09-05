import { runVercelCron } from '@/lib/server/observability'
import { sendSeatHoldExpiryReminders } from '@/lib/server/events/seatHolds'

// Rappel "ta place expire bientôt" (fenêtre J-2h/J-1h) — tourne plus souvent
// que /api/cron/seat-holds (sweep quotidien d'expiration réelle) puisqu'une
// fenêtre de 1h est trop étroite pour un cron une fois par jour. Même garde
// secret que les autres crons (échec fermé si absent).
export async function GET(req: Request) {
  return runVercelCron(req, { route: '/api/cron/seat-hold-reminders' }, async () => sendSeatHoldExpiryReminders())
}
