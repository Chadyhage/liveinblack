import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'
import { deleteAccount } from '@/lib/server/profile'
import { createDeletionRequest } from '@/lib/server/agentDeletion'

const bodySchema = z.object({ currentPassword: z.string().min(1) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  await getDb()
  const user = await User.findById(session.user.id)
  if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })

  const validPassword = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)
  if (!validPassword) return NextResponse.json({ error: 'invalid_password' }, { status: 403 })

  // Organisateur/prestataire dont le dossier est approuvé (événements,
  // abonnement, vitrine publique en cours) : la suppression passe par une
  // revue agent (lib/server/agentDeletion.ts) au lieu d'une anonymisation
  // immédiate — voir la note de fidélité dans lib/models/DeletionRequest.ts.
  const approvedOrg = user.activeRole === 'organisateur' && user.orgStatus === 'active'
  const approvedPrest = user.activeRole === 'prestataire' && user.prestStatus === 'active'
  if (approvedOrg || approvedPrest) {
    const result = await createDeletionRequest({ id: session.user.id }, 'Suppression demandée depuis le profil.')
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true, pending: true, request: result.request })
  }

  const result = await deleteAccount({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
