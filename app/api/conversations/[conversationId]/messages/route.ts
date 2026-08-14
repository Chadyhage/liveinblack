import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getMessages, sendMessage } from '@/lib/server/messaging'
import { canOrderServices } from '@/lib/server/permissions'

// GET : pagination par curseur (`?before=<messageId>&limit=`) — voir
// lib/server/messaging.ts (getMessages) pour la sémantique exacte du
// curseur. POST : envoi d'un message texte/image/voix/item-catalogue — la
// validation (vide, >4000 caractères, type, mute, blocage, et pour
// 'catalog_item' l'appartenance réelle de `catalogItemId` au catalogue du
// destinataire) vit entièrement côté serveur (sendMessage).
const bodySchema = z.object({
  type: z.enum(['text', 'image', 'voice', 'catalog_item', 'event']),
  content: z.string(),
  // Encodée en base64 — présente pour un envoi photo/vocal depuis le
  // composeur (upload Cloudinary fait SERVEUR, voir sendMessage). Absente si
  // `content` est déjà une URL (transfert, compat).
  mediaDataUri: z.string().optional(),
  replyToMessageId: z.string().min(1).optional(),
  // 'catalog_item' UNIQUEMENT : `content` est ignoré côté serveur pour ce
  // type, le payload réel est reconstruit depuis ce seul id — voir sendMessage.
  catalogItemId: z.string().min(1).optional(),
  // 'event' UNIQUEMENT : même principe, voir sendMessage.
  eventId: z.string().min(1).optional(),
})

export async function GET(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const url = new URL(req.url)
  const before = url.searchParams.get('before') ?? undefined
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : undefined

  const result = await getMessages({ id: session.user.id }, { conversationId, before, limit })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, messages: result.messages, hasMore: result.hasMore })
}

export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  // 'catalog_item' = demander un service à un prestataire — un prestataire
  // ne commande pas de services à un autre prestataire (canOrderServices).
  // Vérifié ici plutôt que dans sendMessage() : sendMessage reste générique
  // à tous les types de message, ce garde est spécifique au cas d'usage
  // "demande de devis catalogue", pas à la messagerie en général.
  if (parsed.data.type === 'catalog_item' && !canOrderServices(session.user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const result = await sendMessage(
    { id: session.user.id },
    { conversationId, ...parsed.data },
    {
      deferSideEffects: (work) => {
        try {
          after(work)
        } catch (error) {
          // Les tests d'intégration appellent directement le Route Handler,
          // sans le contexte de requête que Next fournit en production. Dans
          // ce seul cas, exécuter le travail normalement garde le handler
          // testable sans masquer une autre erreur de `after()`.
          if (error instanceof Error && error.message.includes('outside a request scope')) return work()
          throw error
        }
      },
    }
  )
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, message: result.message })
}
