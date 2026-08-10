import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'

// Enregistre un abonnement Web Push navigateur pour le compte connecté.
// Plafonné à 5 appareils par compte ($push/$slice) — même pattern que
// User.knownDeviceHashes (auth.ts).
const MAX_SUBSCRIPTIONS = 5

const bodySchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  await getDb()
  // Retire d'abord toute entrée déjà existante pour cet endpoint (ré-abonnement
  // après renouvellement de clé côté navigateur), puis ajoute la nouvelle
  // entrée en tête, plafonnée à MAX_SUBSCRIPTIONS.
  await User.updateOne({ _id: session.user.id }, { $pull: { pushSubscriptions: { endpoint: parsed.data.endpoint } } })
  await User.updateOne(
    { _id: session.user.id },
    {
      $push: {
        pushSubscriptions: {
          $each: [{ endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, createdAt: new Date() }],
          $slice: -MAX_SUBSCRIPTIONS,
        },
      },
    }
  )

  return NextResponse.json({ ok: true })
}
