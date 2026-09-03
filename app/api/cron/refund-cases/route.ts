import { getDb } from '@/lib/db/mongoose'
import { runVercelCron } from '@/lib/server/observability'
import { processPendingEventCancellationRefundBatches } from '@/lib/server/refunds/refundCases'

// Reprise de fond des générations de dossiers après annulation d'événement :
// idempotente, batchée et protégée par CRON_SECRET comme les autres crons.
export async function GET(req: Request) {
  return runVercelCron(req, { route: '/api/cron/refund-cases' }, async () => {
    await getDb()
    return processPendingEventCancellationRefundBatches('cron:refund-cases', { batchSize: 250 })
  })
}
