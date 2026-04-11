// ─── Applications / Candidatures ─────────────────────────────────────────────
// Gestion des dossiers d'onboarding organisateurs et prestataires
// Données stockées dans Firestore (prod) ou localStorage (démo)

const APPS_KEY = 'lib_applications'

// ─── Statuts ──────────────────────────────────────────────────────────────────

export const APPLICATION_STATUSES = {
  draft:          { label: 'Brouillon',             color: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.04)' },
  submitted:      { label: 'Soumis',                color: '#4ee8c8',               bg: 'rgba(78,232,200,0.06)' },
  under_review:   { label: 'En cours de révision',  color: '#3b82f6',               bg: 'rgba(59,130,246,0.06)' },
  needs_changes:  { label: 'Corrections requises',  color: '#f59e0b',               bg: 'rgba(245,158,11,0.06)' },
  approved:       { label: 'Approuvé',              color: '#22c55e',               bg: 'rgba(34,197,94,0.06)'  },
  rejected:       { label: 'Refusé',                color: '#e05aaa',               bg: 'rgba(224,90,170,0.06)' },
  suspended:      { label: 'Suspendu',              color: '#ef4444',               bg: 'rgba(239,68,68,0.06)'  },
}

// ─── Documents requis par type ────────────────────────────────────────────────

export const DOCUMENT_LABELS = {
  identity:          { label: 'Pièce d\'identité du responsable',                    required: true  },
  business_doc:      { label: 'Document officiel de l\'entreprise (KBIS, statuts, récépissé INSEE…)', required: false },
  alcohol_license:   { label: 'Licence / Justificatif de débit de boissons',         required: false },
  activity_proof:    { label: 'Justificatif d\'activité',                            required: true  },
  insurance:         { label: 'Attestation d\'assurance',                            required: false },
  exploitation_proof:{ label: 'Document exploitation du lieu',                       required: false },
  billing_proof:     { label: 'Statut de facturation / SIRET',                       required: false },
  rc_pro:            { label: 'Attestation RC Pro',                                   required: false },
}

export function getRequiredDocs(type, prestataireType = null) {
  if (type === 'organisateur') {
    return ['identity']   // Stripe gère les coords bancaires — on ne demande que l'identité
  }
  if (type === 'prestataire') {
    const base = ['identity', 'rib', 'activity_proof']
    if (prestataireType === 'salle')      return [...base, 'exploitation_proof', 'insurance']
    if (prestataireType === 'artiste')    return [...base, 'billing_proof']
    if (prestataireType === 'materiel')   return [...base, 'insurance']
    if (prestataireType === 'food')       return [...base, 'insurance']
    return base
  }
  return ['identity', 'rib']
}

// ─── CRUD local ───────────────────────────────────────────────────────────────

function _getAll() {
  try { return JSON.parse(localStorage.getItem(APPS_KEY) || '[]') } catch { return [] }
}
function _saveAll(apps) {
  localStorage.setItem(APPS_KEY, JSON.stringify(apps))
}

export function getAllApplications() {
  return _getAll()
}

export function getApplicationById(id) {
  return _getAll().find(a => a.id === id) || null
}

export function getApplicationByUser(uid, type) {
  return _getAll().find(a => a.uid === uid && a.type === type) || null
}

// ─── Suppression dossier ──────────────────────────────────────────────────────

export async function deleteApplication(id) {
  const all = _getAll()
  const filtered = all.filter(a => a.id !== id)
  _saveAll(filtered)

  // Sync Firestore
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, deleteDoc } = await import('firebase/firestore')
      await deleteDoc(doc(db, 'applications', id))
    }
  } catch {}

  return true
}

// ─── Stripe Connect fields (structure prête, non implémentée) ─────────────────

function stripeDefaults() {
  return {
    account_id:           null,
    onboarding_status:    null,   // 'not_started' | 'pending' | 'complete'
    payouts_enabled:      false,
    charges_enabled:      false,
    last_stripe_sync_at:  null,
  }
}

// ─── Création dossier ─────────────────────────────────────────────────────────

export function createApplication(uid, email, name, type) {
  const existing = getApplicationByUser(uid, type)
  if (existing) return existing

  const app = {
    id: 'app-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    uid,
    email,
    name,
    type,                 // 'organisateur' | 'prestataire'
    status: 'draft',
    formData: {},
    documents: {},        // { [docKey]: { name, url, size, uploadedAt } }
    auditLog: [
      { action: 'created', by: uid, byName: name, at: Date.now(), note: 'Dossier créé' }
    ],
    adminNote: '',
    requestedChanges: '',
    rejectionReason: '',
    stripe: stripeDefaults(),
    createdAt:   Date.now(),
    submittedAt: null,
    reviewedAt:  null,
    approvedAt:  null,
    rejectedAt:  null,
    updatedAt:   Date.now(),
  }

  const all = _getAll()
  all.push(app)
  _saveAll(all)
  return app
}

// ─── Sauvegarde brouillon ─────────────────────────────────────────────────────

export function saveDraft(id, formData) {
  const all = _getAll()
  const idx = all.findIndex(a => a.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], formData: { ...all[idx].formData, ...formData }, updatedAt: Date.now() }
  _saveAll(all)
  return all[idx]
}

// ─── Soumettre dossier ────────────────────────────────────────────────────────

export async function submitApplication(id, formData) {
  const all = _getAll()
  const idx = all.findIndex(a => a.id === id)
  if (idx < 0) return null

  const now = Date.now()
  const app = {
    ...all[idx],
    formData: { ...all[idx].formData, ...formData },
    status: 'submitted',
    submittedAt: now,
    updatedAt: now,
    auditLog: [
      ...all[idx].auditLog,
      { action: 'submitted', by: all[idx].uid, byName: all[idx].name, at: now, note: 'Dossier soumis pour validation' },
    ],
  }
  all[idx] = app
  _saveAll(all)

  // Sync Firestore
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'applications', id), app)
    }
  } catch {}

  return app
}

// ─── Upload document ──────────────────────────────────────────────────────────
// En prod : upload Firebase Storage → renvoie l'URL signée
// En local : stocke uniquement le nom + date (pas de vrai upload)

export async function uploadDocument(appId, docKey, file) {
  try {
    const { USE_REAL_FIREBASE } = await import('../firebase')

    if (USE_REAL_FIREBASE) {
      const { storage, db } = await import('../firebase')
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
      const { doc, updateDoc } = await import('firebase/firestore')

      const path = `applications/${appId}/${docKey}/${file.name}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)

      const docEntry = { name: file.name, url, size: file.size, uploadedAt: Date.now() }

      // Update Firestore
      await updateDoc(doc(db, 'applications', appId), {
        [`documents.${docKey}`]: docEntry,
        updatedAt: Date.now(),
      })

      // Update local
      recordDocumentUpload(appId, docKey, docEntry)
      return { ok: true, url }
    } else {
      // Demo mode: just record name
      const docEntry = { name: file.name, url: null, size: file.size, uploadedAt: Date.now() }
      recordDocumentUpload(appId, docKey, docEntry)
      return { ok: true, url: null }
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export function recordDocumentUpload(appId, docKey, entry) {
  const all = _getAll()
  const idx = all.findIndex(a => a.id === appId)
  if (idx < 0) return null
  all[idx] = {
    ...all[idx],
    documents: { ...all[idx].documents, [docKey]: entry },
    updatedAt: Date.now(),
  }
  _saveAll(all)
  return all[idx]
}

// ─── Actions admin ────────────────────────────────────────────────────────────

export async function updateApplicationStatus(id, status, adminUid, adminName, note = '') {
  const all = _getAll()
  const idx = all.findIndex(a => a.id === id)
  if (idx < 0) return null

  const now = Date.now()
  const patch = {
    status,
    updatedAt: now,
    reviewedAt: now,
    auditLog: [
      ...all[idx].auditLog,
      { action: status, by: adminUid, byName: adminName, at: now, note },
    ],
  }

  if (status === 'approved')       { patch.approvedAt = now }
  if (status === 'rejected')       { patch.rejectedAt = now; patch.rejectionReason = note }
  if (status === 'needs_changes')  { patch.requestedChanges = note }
  if (status === 'under_review')   { patch.adminNote = note }
  if (status === 'suspended')      { patch.adminNote = note }

  all[idx] = { ...all[idx], ...patch }
  _saveAll(all)

  // ── Approbation : upgrader le rôle + copier les permissions dans le profil ──
  if (status === 'approved') {
    const app = all[idx]
    try {
      const { updateAccount } = await import('./accounts')
      const { syncDoc } = await import('./firestore-sync')

      // Permissions dérivées du formulaire
      const perms = {
        role: app.type === 'organisateur' ? 'organisateur' : 'prestataire',
        canSellAlcohol:   !!(app.formData?.alcool),
        approvedAt:       now,
        approvedBy:       adminName,
      }
      if (app.type === 'prestataire') {
        perms.prestataireType = app.formData?.prestataireType || null
      }

      // Mettre à jour localStorage (lib_registered_users)
      updateAccount(app.uid, perms)

      // Sync Firestore profil utilisateur
      syncDoc(`users/${app.uid}`, perms)
    } catch {}
  }

  // Sync Firestore application
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, updateDoc } = await import('firebase/firestore')
      await updateDoc(doc(db, 'applications', id), patch)
    }
  } catch {}

  return all[idx]
}

// ─── Calcul complétude ────────────────────────────────────────────────────────

export function getCompleteness(app) {
  const form = app.formData || {}
  const type = app.type

  const coreFields = type === 'organisateur'
    ? ['nomCommercial', 'emailPro', 'telephonePro', 'responsableNom', 'responsablePrenom', 'responsableEmail']
    : ['nomCommercial', 'emailPro', 'telephonePro', 'responsableNom', 'responsablePrenom']

  const fieldScore = coreFields.filter(f => form[f] && String(form[f]).trim()).length / coreFields.length

  const requiredDocs = getRequiredDocs(type, form.prestataireType)
  const uploadedDocs = Object.keys(app.documents || {})
  const docScore = requiredDocs.length > 0
    ? uploadedDocs.filter(d => requiredDocs.includes(d)).length / requiredDocs.length
    : 1

  return Math.round((fieldScore * 0.5 + docScore * 0.5) * 100)
}

// ─── Chargement depuis Firestore (au montage côté agent) ──────────────────────

export async function fetchApplicationsFromFirestore() {
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (!USE_REAL_FIREBASE) return _getAll()
    const { collection, getDocs } = await import('firebase/firestore')
    const snap = await getDocs(collection(db, 'applications'))
    const apps = snap.docs.map(d => d.data())
    // Merge into local cache
    const existing = _getAll()
    const merged = [...existing]
    apps.forEach(app => {
      const idx = merged.findIndex(a => a.id === app.id)
      if (idx >= 0) merged[idx] = app
      else merged.push(app)
    })
    _saveAll(merged)
    return merged
  } catch {
    return _getAll()
  }
}
