import { NextResponse } from 'next/server'
import { getCachedPublicEvents as listPublicEvents, getCachedSearchPublicEvents as searchPublicEvents } from '@/lib/server/publicCache'

// Route JSON publique de listing d'événements — n'existait pas jusqu'ici car
// app/(public)/events/page.tsx appelle lib/server/events.ts directement
// depuis un composant serveur (pas besoin de hop API pour le web). LIB_Mobile
// (React Native) n'a pas accès aux composants serveur Next.js : cette route
// lui donne le même accès en JSON, sans dupliquer la moindre règle métier
// (réutilise listPublicEvents/searchPublicEvents tels quels).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() || ''
  const events = q ? await searchPublicEvents(q) : await listPublicEvents()
  return NextResponse.json({ ok: true, events })
}
