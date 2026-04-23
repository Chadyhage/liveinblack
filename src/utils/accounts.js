// ─── Account Management ────────────────────────────────────────────────────
// Centralise la gestion des comptes utilisateurs
// Pour le vrai lancement : remplacer localStorage par Firestore

const USERS_KEY       = 'lib_registered_users'
const PENDING_KEY     = 'lib_pending_validations'
const ROLE_REQ_KEY    = 'lib_role_requests'

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

// Returns all accounts (all roles) registered under the same email
export function getAllAccountsByEmail(email) {
  return getAllAccounts().filter(u => u.email?.toLowerCase() === email?.toLowerCase())
}

// Returns the account for a specific email+role combination
export function getAccountByEmailAndRole(email, role) {
  return getAllAccounts().find(
    u => u.email?.toLowerCase() === email?.toLowerCase() && u.role === role
  ) || null
}

export function getAccountById(uid) {
  return getAllAccounts().find(u => u.uid === uid) || null
}

// Normalise un numéro de téléphone pour comparaison (garde uniquement les chiffres)
function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

// Vérifie si un numéro est déjà utilisé par un compte existant (optionnellement en excluant un uid)
export function getAccountByPhone(phone, excludeUid = null) {
  const norm = normalizePhone(phone)
  if (norm.length < 6) return null
  return getAllAccounts().find(u =>
    u.uid !== excludeUid && normalizePhone(u.phone) === norm
  ) || null
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
  // Also remove from Firestore
  import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
    if (!USE_REAL_FIREBASE) return
    import('firebase/firestore').then(({ doc, deleteDoc }) => {
      deleteDoc(doc(db, 'users', uid)).catch(() => {})
    }).catch(() => {})
  }).catch(() => {})
}

// ─── Pending validations (prestataires + agents) ───────────────────────────

export function getPendingValidations() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') } catch { return [] }
}

export function addPendingValidation(userObj) {
  const list = getPendingValidations()
  const entry = { ...userObj, requestedAt: Date.now(), type: 'validation' }
  list.push(entry)
  localStorage.setItem(PENDING_KEY, JSON.stringify(list))
  // Fire-and-forget sync to Firestore so admin sees it cross-device
  import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
    if (!USE_REAL_FIREBASE) return
    import('firebase/firestore').then(({ doc, setDoc }) => {
      setDoc(doc(db, 'pending_validations', userObj.uid), entry).catch(() => {})
    }).catch(() => {})
  }).catch(() => {})
}

export function removePendingValidation(uid) {
  const list = getPendingValidations().filter(u => u.uid !== uid)
  localStorage.setItem(PENDING_KEY, JSON.stringify(list))
}

export async function approveValidation(uid) {
  const pending = getPendingValidations().find(u => u.uid === uid)
  if (!pending) return null

  // Derive the real role — Firebase-path pending docs use `requestedRole`, local ones use `role`
  const resolvedRole = pending.role || pending.requestedRole
  const approved = {
    ...pending,
    role: resolvedRole,
    activeRole: resolvedRole,
    enabledRoles: pending.enabledRoles?.length ? pending.enabledRoles : [resolvedRole],
    status: 'active',
    approvedAt: Date.now(),
  }
  saveAccount(approved)
  removePendingValidation(uid)

  // Sync to Firestore if Firebase is active
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore')
      // Use setDoc with merge to preserve existing fields AND create doc if missing
      await setDoc(doc(db, 'users', uid), {
        status: 'active',
        approvedAt: Date.now(),
        role: resolvedRole,
        activeRole: resolvedRole,
        enabledRoles: approved.enabledRoles,
      }, { merge: true })
      // _docId = vrai ID Firestore du document (ajouté par loadCollection), sinon fallback sur pending.id ou uid
      const pendingDocId = pending._docId || pending.id || uid
      // Marquer comme approuvé avant de supprimer (si delete échoue, le filtre le masquera)
      try { await setDoc(doc(db, 'pending_validations', pendingDocId), { status: 'approved' }, { merge: true }) } catch {}
      await deleteDoc(doc(db, 'pending_validations', pendingDocId))
    }
  } catch {}

  // Mark in session if it's the current user
  try {
    const current = JSON.parse(localStorage.getItem('lib_user') || 'null')
    if (current?.uid === uid) {
      localStorage.setItem('lib_user', JSON.stringify(approved))
    }
  } catch {}
  return approved
}

export async function rejectValidation(uid, reason = '') {
  const pending = getPendingValidations().find(u => u.uid === uid)
  if (!pending) return
  const rejected = { ...pending, status: 'rejected', rejectedAt: Date.now(), rejectionReason: reason }
  saveAccount(rejected)
  removePendingValidation(uid)

  // Sync to Firestore
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'users', uid), { status: 'rejected', rejectedAt: Date.now(), rejectionReason: reason }, { merge: true })
      const pendingDocId = pending._docId || pending.id || uid
      try { await setDoc(doc(db, 'pending_validations', pendingDocId), { status: 'rejected' }, { merge: true }) } catch {}
      await deleteDoc(doc(db, 'pending_validations', pendingDocId))
    }
  } catch {}
}

// ─── Multi-role architecture ───────────────────────────────────────────────
// One Firebase UID → one account with enabledRoles array
// role / activeRole = currently displayed interface
// orgStatus / prestStatus = 'none' | 'pending' | 'active' | 'rejected'

/**
 * Returns all unlocked interfaces for a user.
 * Falls back gracefully for old single-role accounts.
 */
export function getEnabledRoles(user) {
  if (!user) return []
  if (Array.isArray(user.enabledRoles) && user.enabledRoles.length > 0) {
    return user.enabledRoles
  }
  // Backwards compat: derive from role field
  const base = ['client']
  const r = user.role
  if (r && r !== 'client' && r !== 'user' && r !== 'agent') {
    if (!base.includes(r)) base.push(r)
  }
  return base
}

/**
 * Submit a request to unlock an additional role for an existing account.
 * Writes to lib_role_requests (local) + optionally Firestore pending_validations.
 */
export async function requestAdditionalRole(user, role, prestataireType = null) {
  // Prevent duplicates
  const existing = getPendingRoleRequests().find(
    r => r.uid === user.uid && r.requestedRole === role && r.status === 'pending'
  )
  if (existing) return existing

  const request = {
    id: 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    uid: user.uid,
    email: user.email,
    name: user.name,
    requestedRole: role,
    prestataireType: prestataireType || null,
    requestedAt: Date.now(),
    status: 'pending',
  }

  const all = getPendingRoleRequests()
  all.push(request)
  localStorage.setItem(ROLE_REQ_KEY, JSON.stringify(all))

  // Mark status on the account
  const patch = role === 'organisateur'
    ? { orgStatus: 'pending', orgRequestedAt: Date.now() }
    : { prestStatus: 'pending', prestataireType, prestRequestedAt: Date.now() }
  updateAccount(user.uid, patch)

  // Sync to Firestore if Firebase active
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'pending_validations', request.id), {
        ...request,
        type: 'role_request',
      })
      // Update user doc
      const { setDoc: setUserDoc } = await import('firebase/firestore')
      await setUserDoc(doc(db, 'users', user.uid), patch, { merge: true })
    }
  } catch {}

  return request
}

export function getPendingRoleRequests() {
  try { return JSON.parse(localStorage.getItem(ROLE_REQ_KEY) || '[]') } catch { return [] }
}

export function getAllRoleRequests() {
  return getPendingRoleRequests()
}

/**
 * Admin approves a role request.
 * Adds role to enabledRoles, sets status to 'active'.
 */
export async function approveRoleRequest(requestId) {
  const requests = getPendingRoleRequests()
  const req = requests.find(r => r.id === requestId)
  if (!req) return null

  // Update request status
  const updatedRequests = requests.map(r =>
    r.id === requestId ? { ...r, status: 'approved', approvedAt: Date.now() } : r
  )
  localStorage.setItem(ROLE_REQ_KEY, JSON.stringify(updatedRequests))

  // Update user account
  const account = getAccountById(req.uid)
  if (!account) return null

  const enabledRoles = getEnabledRoles(account)
  if (!enabledRoles.includes(req.requestedRole)) enabledRoles.push(req.requestedRole)

  const patch = {
    enabledRoles,
    ...(req.requestedRole === 'organisateur'
      ? { orgStatus: 'active', orgValidatedAt: Date.now() }
      : { prestStatus: 'active', prestataireType: req.prestataireType, prestValidatedAt: Date.now() }
    ),
  }
  const updatedAccount = updateAccount(req.uid, patch)

  // Sync Firestore
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'users', req.uid), patch, { merge: true })
      await deleteDoc(doc(db, 'pending_validations', requestId))
    }
  } catch {}

  // Update session user if it's them
  try {
    const current = JSON.parse(localStorage.getItem('lib_user') || 'null')
    if (current?.uid === req.uid) {
      localStorage.setItem('lib_user', JSON.stringify({ ...current, ...patch }))
    }
  } catch {}

  return updatedAccount
}

/**
 * Admin rejects a role request.
 */
export async function rejectRoleRequest(requestId, reason = '') {
  const requests = getPendingRoleRequests()
  const req = requests.find(r => r.id === requestId)
  if (!req) return

  const updatedRequests = requests.map(r =>
    r.id === requestId ? { ...r, status: 'rejected', rejectedAt: Date.now(), rejectionReason: reason } : r
  )
  localStorage.setItem(ROLE_REQ_KEY, JSON.stringify(updatedRequests))

  const patch = req.requestedRole === 'organisateur'
    ? { orgStatus: 'rejected' }
    : { prestStatus: 'rejected' }
  updateAccount(req.uid, patch)

  // Sync Firestore
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'users', req.uid), patch, { merge: true })
      await deleteDoc(doc(db, 'pending_validations', requestId))
    }
  } catch {}
}

/**
 * User cancels their own pending role request.
 * Supprime la demande de lib_role_requests ET remet le statut à 'none' sur le compte.
 */
export async function cancelRoleRequest(uid, role) {
  const requests = getPendingRoleRequests()
  const req = requests.find(r => r.uid === uid && r.requestedRole === role && r.status === 'pending')
  if (!req) return

  // Supprimer de la liste locale
  const updated = requests.filter(r => r.id !== req.id)
  localStorage.setItem(ROLE_REQ_KEY, JSON.stringify(updated))

  // Remettre le statut à 'none' sur le compte
  const patch = role === 'organisateur'
    ? { orgStatus: 'none', orgRequestedAt: null }
    : { prestStatus: 'none', prestRequestedAt: null }
  updateAccount(uid, patch)

  // Mettre à jour la session si c'est l'utilisateur courant
  try {
    const current = JSON.parse(localStorage.getItem('lib_user') || 'null')
    if (current?.uid === uid) {
      localStorage.setItem('lib_user', JSON.stringify({ ...current, ...patch }))
    }
  } catch {}

  // Sync Firestore
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, deleteDoc, setDoc } = await import('firebase/firestore')
      await deleteDoc(doc(db, 'pending_validations', req.id))
      await setDoc(doc(db, 'users', uid), patch, { merge: true })
    }
  } catch {}
}

/**
 * Switch the user's active interface/role.
 * Updates localStorage session + Firestore.
 */
export async function switchActiveRole(user, newRole) {
  const enabledRoles = getEnabledRoles(user)
  if (!enabledRoles.includes(newRole) && newRole !== 'agent') return user

  const patch = { role: newRole, activeRole: newRole }
  updateAccount(user.uid, patch)

  // Update session
  try {
    const current = JSON.parse(localStorage.getItem('lib_user') || 'null')
    if (current?.uid === user.uid) {
      localStorage.setItem('lib_user', JSON.stringify({ ...current, ...patch }))
    }
  } catch {}

  // Sync Firestore
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'users', user.uid), patch, { merge: true })
    }
  } catch {}

  return { ...user, ...patch }
}

/**
 * Count total pending validations (accounts + role requests).
 */
export function getTotalPendingCount() {
  return getPendingValidations().length + getPendingRoleRequests().filter(r => r.status === 'pending').length
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
  client:       { label: 'Client',       icon: '🎫', color: '#22c55e' },
  user:         { label: 'Client',       icon: '🎫', color: '#22c55e' },
  prestataire:  { label: 'Prestataire',  icon: '🎤', color: '#8b5cf6' },
  organisateur: { label: 'Organisateur', icon: '🎪', color: '#3b82f6' },
  agent:        { label: 'Admin',        icon: '🔑', color: '#d4af37' },
}

export const PRESTATAIRE_TYPES = [
  { key: 'salle',       label: 'Salle / Lieu',       icon: '🏛' },
  { key: 'prestation',  label: 'Artiste / DJ',        icon: '🎤' },
  { key: 'materiel',    label: 'Matériel',             icon: '🔊' },
  { key: 'supermarche', label: 'Supermarché / Traiteur', icon: '🛒' },
]
