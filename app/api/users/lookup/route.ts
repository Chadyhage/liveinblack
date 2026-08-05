import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'

// Résout un email EXACT vers {id, name} — utilisé par l'UI messagerie pour
// démarrer une conversation ou envoyer une demande d'ami sans qu'aucun
// endpoint de recherche floue n'existe (volontairement absent de ce
// périmètre) : on retrouve un compte connu, jamais on ne parcourt/liste des
// comptes. Ne renvoie que des champs d'affichage, jamais de données
// sensibles (mot de passe, rôles, etc.).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const email = new URL(req.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })

  await getDb()
  const user = await User.findOne({ email }).select('firstName lastName email').lean()
  if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })

  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
  return NextResponse.json({ ok: true, user: { id: String(user._id), name, email: user.email } })
}
