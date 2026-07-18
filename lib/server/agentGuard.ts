import { canAdminister, type Role, type AccountStatus } from './permissions'

// Garde partagée pour les Route Handlers /api/agent/* (#9 phase agent/admin).
// Port de lib/adminGuard.js — MAIS sans l'échappatoire "email super-admin"
// (allowlist env) du legacy : cette migration n'a pas besoin de ce
// contournement permanent, puisque `roles: string[]` accepte déjà 'agent'
// comme n'importe quel autre rôle (voir lib/server/permissions.ts). Le tout
// premier compte agent se crée par écriture directe en base (script
// d'exploitation, comme scripts/seed-dev.ts), pas par un bypass qui
// resterait actif à vie dans le code — cohérent avec l'esprit de fermeture
// de failles de cette migration plutôt que de reproduire un contournement.
//
// `proxy.ts` gate déjà /agent/:path* côté page (activeRole==='agent') ; ce
// helper est le pendant Route Handler, jamais la seule ligne de défense côté
// mutation (chaque fonction serveur revérifie aussi caller.id, comme partout
// ailleurs dans ce port).
export interface AgentCallerSession {
  activeRole?: Role
  status?: AccountStatus
}

export function requireAgent(user: AgentCallerSession | null | undefined): boolean {
  if (!user) return false
  return canAdminister({ activeRole: user.activeRole ?? 'client', status: user.status ?? 'active' })
}
