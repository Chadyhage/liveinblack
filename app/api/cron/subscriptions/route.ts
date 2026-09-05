import { runVercelCron } from '@/lib/server/observability'
import { runSubscriptionReminderCron } from '@/lib/server/provider/providerSubscriptions'
import { cleanupAbandonedApplicationUploads } from '@/lib/server/provider/applicationUploadCleanup'

// Remplace la partie "abonnements" de api/cron-subscriptions.js (rappels
// J-7/J-3/J-1/J0/grâce/masquage, rail XOF uniquement). Même garde-fou que
// /api/cron/payouts : CRON_SECRET absent → échec fermé (audit C09), jamais
// une route publique ne doit pouvoir déclencher ce cron.
export async function GET(req: Request) {
  return runVercelCron(req, { route: '/api/cron/subscriptions' }, async () => {
    const result = await runSubscriptionReminderCron()
    let applicationUploads
    try {
      applicationUploads = await cleanupAbandonedApplicationUploads()
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        service: 'live-in-black-web',
        msg: 'subscription_upload_cleanup_failed',
        route: '/api/cron/subscriptions',
        error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
      }))
      applicationUploads = { scanned: 0, deleted: 0, skipped: 0, configured: true, truncated: false, error: true }
    }
    return { ...result, applicationUploads }
  })
}
