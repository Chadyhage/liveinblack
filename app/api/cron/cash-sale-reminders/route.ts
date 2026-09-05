import { runVercelCron } from '@/lib/server/observability'
import { sendPendingCashSaleReminders } from '@/lib/server/agent/agentSales'

// Rappel agent "règlement en attente depuis 2 jours" — même garde secret que
// les autres crons (échec fermé si absent).
export async function GET(req: Request) {
  return runVercelCron(req, { route: '/api/cron/cash-sale-reminders' }, async () => sendPendingCashSaleReminders())
}
