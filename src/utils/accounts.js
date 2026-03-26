// ─── Account Management ────────────────────────────────────────────────────
// Centralise la gestion des comptes utilisateurs
// Pour le vrai lancement : remplacer localStorage par Firestore

const USERS_KEY = 'lib_registered_users'
const PENDING_KEY = 'lib_pending_validations'

export function getAllAccounts() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]') } catch { return [] }
}

export function saveAccount(userObj) {
  const all = getAllAccounts()
  const idx = all.findIndex(u => u.uid === userObj.uid)
  if (idx >= 0) all[idx] = userObj
  else all.push(userObj)
  localStorage.setItem(USERS_KEY, JSON.stringify(all))
}

export function getAccountByEmail(email) {
  return getAllAccounts().find(u => u.email?.toLowerCase() === email?.toLowerCase()) || null
}

export function getAccountById(uid) {
  return getAllAccounts().find(u => u.uid === uid) || null
}

export function updateAccount(uid, patch) {
  const all = getAllAccounts()
  const idx = all.findIndex(u => u.uid === uid)
  if (idx < 0) return null
  all[idx] = { ...all[idx], ...patch }
  localStorage.setItem(USERS_KEY, JSON.stringify(all))
  return all[idx]
}

export function deleteAccount(uid) {
  const all = getAllAccounts().filter(u => u.uid !== uid)
  localStorage.setItem(USERS_KEY, JSON.stringify(all))
}

// ─── Pending validations (prestataires + agents) ───────────────────────────

export function getPendingValidations() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') } catch { return [] }
}

export function addPendingValidation(userObj) {
  const list = getPendingValidations()
  list.push({ ...userObj, requestedAt: Date.now() })
  localStorage.setItem(PENDING_KEY, JSON.stringify(list))
}

export function removePendingValidation(uid) {
  const list = getPendingValidations().filter(u => u.uid !== uid)
  localStorage.setItem(PENDING_KEY, JSON.stringify(list))
}

export function approveValidation(uid) {
  const pending = getPendingValidations().find(u => u.uid === uid)
  if (!pending) return null
  const approved = { ...pending, status: 'active', approvedAt: Date.now() }
  saveAccount(approved)
  removePendingValidation(uid)
  // Mark in session if it's the current user
  try {
    const current = JSON.parse(localStorage.getItem('lib_user') || 'null')
    if (current?.uid === uid) {
      localStorage.setItem('lib_user', JSON.stringify(approved))
    }
  } catch {}
  return approved
}

export function rejectValidation(uid, reason = '') {
  const pending = getPendingValidations().find(u => u.uid === uid)
  if (!pending) return
  const rejected = { ...pending, status: 'rejected', rejectedAt: Date.now(), rejectionReason: reason }
  saveAccount(rejected)
  removePendingValidation(uid)
}

// ─── Password helpers ─────────────────────────────────────────────────────

export function checkPasswordStrength(pwd) {
  if (!pwd || pwd.length < 6) return { score: 0, label: 'Trop court', color: '#ef4444' }
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  if (score <= 1) return { score, label: 'Faible', color: '#ef4444' }
  if (score === 2) return { score, label: 'Moyen', color: '#f59e0b' }
  if (score === 3) return { score, label: 'Bon', color: '#84cc16' }
  return { score, label: 'Fort', color: '#22c55e' }
}

export function validatePassword(pwd) {
  const errors = []
  if (!pwd || pwd.length < 8) errors.push('Au moins 8 caractères')
  if (!/[A-Z]/.test(pwd)) errors.push('Au moins une majuscule')
  if (!/[0-9]/.test(pwd)) errors.push('Au moins un chiffre')
  return errors
}

// ─── Role labels ──────────────────────────────────────────────────────────

export const ROLES = {
  user:         { label: 'Utilisateur',  icon: '👤', color: '#6b7280' },
  prestataire:  { label: 'Prestataire',  icon: '🎤', color: '#8b5cf6' },
  organisateur: { label: 'Organisateur', icon: '🎪', color: '#3b82f6' },
  agent:        { label: 'Agent',        icon: '🔑', color: '#d4af37' },
}

export const PRESTATAIRE_TYPES = [
  { key: 'salle',       label: 'Salle / Lieu',       icon: '🏛' },
  { key: 'prestation',  label: 'Artiste / DJ',        icon: '🎤' },
  { key: 'materiel',    label: 'Matériel',             icon: '🔊' },
  { key: 'supermarche', label: 'Supermarché / Traiteur', icon: '🛒' },
]
