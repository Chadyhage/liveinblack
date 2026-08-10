import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'

const bodySchema = z.object({ endpoint: z.string().min(1) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  await getDb()
  await User.updateOne({ _id: session.user.id }, { $pull: { pushSubscriptions: { endpoint: parsed.data.endpoint } } })

  return NextResponse.json({ ok: true })
}
