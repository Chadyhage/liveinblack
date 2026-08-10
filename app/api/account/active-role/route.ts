import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import User, { ROLES } from '@/lib/models/User'
import { notifyUserById } from '@/lib/server/emails/notify'
import { roleActivatedEmail } from '@/lib/server/emails'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'
const ROLE_LABELS: Record<string, string> = { client: 'client', organisateur: 'organisateur', prestataire: 'prestataire', agent: 'agent' }
const ROLE_DASHBOARD: Record<string, string> = { client: '/profile', organisateur: '/my-events', prestataire: '/offer-services', agent: '/agent' }

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
  const user = await User.findById(session.user.id).select('roles activeRole').lean()
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!user.roles.includes(parsed.data.role)) {
    return NextResponse.json({ error: 'role_not_owned' }, { status: 403 })
  }

  const previousRole = user.activeRole
  await User.updateOne({ _id: session.user.id }, { $set: { activeRole: parsed.data.role } })

  // E46 : uniquement au VRAI changement d'espace, jamais si on rappelle la
  // même route avec le rôle déjà actif (évite un email à chaque poll/retry).
  if (previousRole !== parsed.data.role) {
    const label = ROLE_LABELS[parsed.data.role] || parsed.data.role
    const dashboardUrl = `${SITE}${ROLE_DASHBOARD[parsed.data.role] || '/profile'}`
    await notifyUserById(session.user.id, () => roleActivatedEmail(label, dashboardUrl, SITE))
  }

  return NextResponse.json({ ok: true, activeRole: parsed.data.role })
}
