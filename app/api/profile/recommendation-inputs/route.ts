import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getMyProfile } from '@/lib/server/profile'
import { listActiveInterestSignals } from '@/lib/server/eventInterests'
import { getCachedBoostedEventIds as getBoostedEventIds } from '@/lib/server/publicCache'

// Route JSON dédiée à LIB_Mobile — les 3 signaux nécessaires à
// lib/shared/recommendations.ts::getRecommendedEvents (préférences, historique
// "Intéressé", ids boostés) sont aujourd'hui résolus côté web directement dans
// le composant serveur de /evenements (pas de hop API). Un seul appel plutôt
// que 3 routes séparées : ces 3 signaux sont TOUJOURS consommés ensemble, et
// pour le même appelant.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const [profile, interestHistory, boostedIds] = await Promise.all([
    getMyProfile({ id: session.user.id }),
    listActiveInterestSignals({ id: session.user.id }),
    getBoostedEventIds(),
  ])

  return NextResponse.json({
    ok: true,
    preferences: profile?.preferences ?? null,
    interestHistory,
    boostedEventIds: Array.from(boostedIds),
  })
}
