import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { listActiveBoostsForAgent } from '@/lib/server/agentBoosts'

// Panneau agent « Boosts » — LECTURE SEULE (#106 phase agent/admin), voir
// lib/server/agentBoosts.ts. Pas de PATCH/POST : le legacy n'a aucune action
// de mutation sur cet écran (les remboursements de conflit sont automatiques,
// voir lib/server/finalizeBoost.ts).
export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const boosts = await listActiveBoostsForAgent()
  return NextResponse.json({ ok: true, ...boosts })
}
