import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getContactPhone } from '@/lib/server/messaging'

// Numéro PRO de l'interlocuteur d'une conversation directe — voir
// lib/server/messaging.ts:getContactPhone. Affiché (lien `tel:`) dans le
// panneau contact de MessagesClient.tsx.
export async function GET(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await getContactPhone({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, phone: result.phone })
}
