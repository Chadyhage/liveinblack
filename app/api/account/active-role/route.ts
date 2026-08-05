import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import User, { ROLES } from '@/lib/models/User'

// Bascule l'interface active d'un compte multi-rôle (roles[] + activeRole,
// voir lib/models/User.ts) — n'existait pas jusqu'ici : activeRole n'était
// jamais réécrit après l'inscription. Ne vérifie QUE l'appartenance à
// `user.roles` : les statuts d'approbation par rôle (orgStatus/prestStatus)
// et les redirections qui en découlent restent entièrement gérés par
// proxy.ts (défense en profondeur déjà en place), pas dupliqués ici.
const bodySchema = z.object({ role: z.enum(ROLES) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  await getDb()
  const user = await User.findById(session.user.id).select('roles').lean()
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!user.roles.includes(parsed.data.role)) {
    return NextResponse.json({ error: 'role_not_owned' }, { status: 403 })
  }

  await User.updateOne({ _id: session.user.id }, { $set: { activeRole: parsed.data.role } })
  return NextResponse.json({ ok: true, activeRole: parsed.data.role })
}
