import { runVercelCron } from '@/lib/server/observability'
import { expireStaleResaleListings } from '@/lib/server/events/resale'

// Ferme les annonces de revente dont la fenêtre est passée (closesAt) sans
// trouver d'acheteur — jusqu'ici jamais basculé en base (vérifié : seule une
// vérification à la volée en lecture existait). Même garde secret que les
// autres crons.
export async function GET(req: Request) {
  return runVercelCron(req, { route: '/api/cron/resale-expiry' }, async () => expireStaleResaleListings())
}
