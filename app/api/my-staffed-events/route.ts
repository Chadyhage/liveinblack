import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listMyStaffedEvents } from '@/lib/server/staffEvents'

// Miroir JSON de app/(app)/my-shifts/page.tsx (« Mes soirées ») — le web
// appelle listMyStaffedEvents directement depuis un composant serveur ; cette
// route donne le même accès à l'app mobile.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const events = await listMyStaffedEvents({ id: session.user.id })
  return NextResponse.json({ ok: true, events })
}
