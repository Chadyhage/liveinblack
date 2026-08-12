import { auth } from '@/auth'
import { getMessagesSince } from '@/lib/server/messaging'

// Prototype SSE (Server-Sent Events) pour le fil de messages d'UNE
// conversation — remplace le poll client toutes les 3s
// (MessagesClient.tsx::fetchMessages) par une connexion persistante que le
// SERVEUR pousse vers le client dès qu'un nouveau message existe.
//
// Pourquoi SSE et pas un vrai WebSocket (audit de scalabilité du 12/08/2026,
// point "polling messagerie") : ce projet est déployé sur des fonctions
// Vercel classiques (runtime Node, jamais Edge — voir commentaire sur
// `runtime` ci-dessous) ; Mongoose utilise des sockets TCP natifs
// incompatibles avec le runtime Edge, donc l'endpoint DOIT rester en runtime
// Node standard. Un WebSocket persistant nécessiterait une infra à part
// (service tiers type Pusher/Ably, ou un serveur Node dédié hors Vercel) —
// hors périmètre de ce prototype, qui se limite à ce qui tient dans
// l'infrastructure Vercel existante. SSE sur fonction Node convient : la
// réponse reste un flux ouvert jusqu'à `STREAM_DURATION_MS`, `EventSource`
// côté client reconnecte AUTOMATIQUEMENT à la coupure — donc le lecteur
// perçoit une connexion continue même si, en coulisses, elle se renouvelle
// toutes les ~50s.
//
// Ce que ça change concrètement par rapport au poll actuel : le nombre
// d'invocations de fonction serverless/requêtes HTTP distinctes tombe de
// ~20/minute (poll 3s) à ~1,2/minute (une reconnexion toutes les ~50s) par
// utilisateur avec un fil ouvert — le calcul chiffré de l'audit (18
// 500-20 000 req/s à 50 000 utilisateurs actifs) était basé sur CE poll en
// particulier ; cette conversion le fait chuter d'un facteur ~15-20. Le
// serveur continue d'interroger Mongo en interne à intervalle rapproché
// (voir POLL_INTERVAL_MS) — ce prototype ne réduit PAS la charge Mongo
// elle-même, seulement le nombre de requêtes HTTP/invocations de fonction,
// qui était le goulot chiffré dans l'audit.
//
// Portée volontairement limitée à CET écran (le poll le plus agressif,
// 3s) — les autres polls (liste de conversations 4s, présence 20s, badges
// dashboard 15s) restent inchangés, ce prototype sert à valider l'approche
// avant de généraliser.

// Runtime Node explicite (PAS 'edge') — Mongoose/le driver MongoDB natif ne
// fonctionnent pas sous Edge Runtime (dépendance à des sockets TCP Node).
export const runtime = 'nodejs'
// Même ordre de grandeur que les autres routes à connexion longue du repo
// (webhooks Stripe/FedaPay : maxDuration 30, crons : 60) — au-delà, Vercel
// coupe la fonction ; EventSource reconnecte alors de lui-même.
export const maxDuration = 60

const POLL_INTERVAL_MS = 1500
// Marge sous maxDuration=60s pour fermer PROPREMENT le flux avant que Vercel
// ne le coupe brutalement — une fermeture propre laisse EventSource
// reconnecter immédiatement (`onerror`), une coupure brutale peut imposer un
// court délai de backoff côté navigateur.
const STREAM_DURATION_MS = 50_000
const HEARTBEAT_INTERVAL_MS = 15_000

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function GET(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return new Response('unauthorized', { status: 401 })

  const { conversationId } = await params
  const url = new URL(req.url)
  const afterIdParam = url.searchParams.get('afterId')
  if (!afterIdParam) return new Response('missing_afterId', { status: 400 })

  const callerId = session.user.id
  let cursor = afterIdParam

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      let closed = false
      const startedAt = Date.now()

      function send(chunk: string) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Le client a déjà fermé la connexion (navigation, fermeture
          // d'onglet) — enqueue sur un controller fermé lève, jamais
          // remonter cette erreur au poll ci-dessous.
          closed = true
        }
      }

      function close() {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // déjà fermé côté client, rien à faire
        }
      }

      // Signal explicite pour que le client sache qu'il doit se reconnecter
      // PROPREMENT (pas une erreur réseau) quand ce flux atteint sa durée
      // max — évite de faire remonter un état d'erreur transitoire côté UI
      // à chaque renouvellement de connexion (~toutes les 50s).
      req.signal.addEventListener('abort', close)

      let lastSentAt = Date.now()

      while (!closed && Date.now() - startedAt < STREAM_DURATION_MS) {
        try {
          const result = await getMessagesSince({ id: callerId }, { conversationId, afterId: cursor })
          if (!result.ok) {
            send(sseEvent('app-error', { error: result.error }))
            close()
            break
          }
          if (result.messages.length > 0) {
            cursor = result.messages[result.messages.length - 1].id
            send(sseEvent('messages', { messages: result.messages }))
            lastSentAt = Date.now()
          } else if (Date.now() - lastSentAt >= HEARTBEAT_INTERVAL_MS) {
            // Aucun nouveau message depuis un moment : un simple commentaire
            // SSE (ignoré par EventSource) garde la connexion "chaude" pour
            // les intermédiaires (proxy/CDN) qui coupent une connexion
            // inactive avant STREAM_DURATION_MS.
            send(': heartbeat\n\n')
            lastSentAt = Date.now()
          }
        } catch (err) {
          // Erreur inattendue (ex. coupure Mongo transitoire) — jamais faire
          // planter le flux silencieusement, le client retentera à la
          // prochaine reconnexion EventSource.
          console.error('[conversations/stream] poll failed:', err)
          send(sseEvent('app-error', { error: 'stream_failed' }))
          close()
          break
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }

      send(sseEvent('reconnect', { reason: 'max_duration' }))
      close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // désactive le buffering proxy (nginx/Vercel edge) qui retarderait les événements
    },
  })
}
