// Autorisation admin partagée par les endpoints /api qui agissent sur des
// comptes tiers. UNE seule définition d'« agent » côté serveur : super-admin
// (email env) OU users/{uid} portant le rôle agent sous n'importe quelle
// forme (role, activeRole, enabledRoles). Le panneau admin change d'interface
// via switchActiveRole qui réécrit `role` — un check limité à `role` rend les
// droits admin intermittents.

export function superAdminEmails() {
  return (process.env.VITE_SUPER_ADMIN_EMAILS || process.env.SUPER_ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

export function isSuperAdminEmail(email) {
  return superAdminEmails().includes(String(email || '').toLowerCase())
}

export async function isAdminCaller(db, caller) {
  if (isSuperAdminEmail(caller?.email)) return true
  try {
    const snap = await db.doc(`users/${caller.uid}`).get()
    const u = snap.exists ? snap.data() : null
    return u?.role === 'agent'
      || u?.activeRole === 'agent'
      || (Array.isArray(u?.enabledRoles) && u.enabledRoles.includes('agent'))
  } catch {
    return false
  }
}
