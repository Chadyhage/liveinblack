import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { uploadDataUri } from '@/lib/server/cloudinary'

// Upload générique pour le wizard événement (#7 phase organisateur — affiche,
// vidéo d'aperçu, photos de place, images d'articles de menu). Volontairement
// PAS scopé à un eventId : au moment de la CRÉATION, l'événement n'existe pas
// encore (même problème que l'avatar de profil, résolu de la même façon —
// upload d'abord, l'URL Cloudinary est ensuite portée par le payload
// create/update de l'événement, jamais écrite ici).
const bodySchema = z.object({ dataUri: z.string().min(1) })

function requireOrganizerRole(role: string | undefined) {
  return role === 'organisateur' || role === 'agent'
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireOrganizerRole(session.user.activeRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await uploadDataUri(parsed.data.dataUri, `organizer-events/${session.user.id}`)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, url: result.url })
}
