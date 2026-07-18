import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { setGroupAvatar } from '@/lib/server/groups'

// Change la photo d'un groupe — réservé aux admins, upload Cloudinary fait
// SERVEUR (voir lib/server/cloudinary.ts uploadDataUri) à partir d'un data:
// URI encodé côté client, jamais d'appel Cloudinary direct depuis le navigateur.
const bodySchema = z.object({ dataUri: z.string().min(1) })

export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await setGroupAvatar({ id: session.user.id }, { conversationId, ...parsed.data })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, avatar: result.avatar })
}
