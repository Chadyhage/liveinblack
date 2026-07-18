import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { saveApplicationDraft } from '@/lib/server/applications'

// Autosave du dossier prestataire en mode connecté — même convention que
// /api/applications/organisateur/draft (pas de validation stricte ici, la
// validation réelle a lieu à la soumission, voir /submit).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await saveApplicationDraft({ id: session.user.id }, 'prestataire', body as Record<string, unknown>)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
