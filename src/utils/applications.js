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
  resubmitted:    { label: 'Re-soumis',             color: '#a78bfa',               bg: 'rgba(167,139,250,0.06)' },
  approved:       { label: 'Approuvé',              color: '#22c55e',               bg: 'rgba(34,197,94,0.06)'  },
  rejected:       { label: 'Refusé',                color: '#e05aaa',               bg: 'rgba(224,90,170,0.06)' },
  suspended:      { label: 'Suspendu',              color: '#ef4444',               bg: 'rgba(239,68,68,0.06)'  },
}

// ─── Documents requis par type ────────────────────────────────────────────────

export const DOCUMENT_LABELS = {
  identity:          { label: 'Pièce d\'identité du responsable',                    required: true  },
  rib:               { label: 'RIB (Relevé d\'identité bancaire)',                   required: true  },
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

// Détecte un dossier re-soumis après corrections (migration rétro-compatible)
// Un dossier "submitted" qui a un "needs_changes" dans son auditLog = "resubmitted"
function _migrateStatus(app) {
  if (app.status === 'submitted' && app.auditLog?.some(e => e.action === 'needs_changes')) {
    return { ...app, status: 'resubmitted' }
  }
  return app
}

export function getAllApplications() {
  const apps = _getAll()
  const migrated = apps.map(_migrateStatus)
  const changed = migrated.some((a, i) => a !== apps[i])
  if (changed) _saveAll(migrated)
  return migrated
}

export function getApplicationById(id) {
  return getAllApplications().find(a => a.id === id) || null
}

export function getApplicationByUser(uid, type) {
  return getAllApplications().find(a => a.uid === uid && a.type === type) || null
}

export function updateApplication(appId, patch) {
  const all = _getAll()
  const idx = all.findIndex(a => a.id === appId)
  if (idx < 0) return null
  all[idx] = { ...all[idx], ...patch, updatedAt: Date.now() }
  _saveAll(all)
  const updated = all[idx]

  // Fire-and-forget Firestore sync for critical field changes (uid, status, etc.)
  import('./firestore-sync').then(({ syncDoc }) => {
    syncDoc(`applications/${appId}`, patch)
  }).catch(() => {})

  return updated
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
    documents: {},        // { [docKey]: [{ name, url, size, uploadedAt }] }
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

  // Fire-and-forget Firestore sync
  import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
    if (!USE_REAL_FIREBASE) return
    import('firebase/firestore').then(({ doc, setDoc }) => {
      setDoc(doc(db, 'applications', app.id), app).catch(() => {})
    }).catch(() => {})
  }).catch(() => {})

  return app
}

// ─── Sauvegarde brouillon ─────────────────────────────────────────────────────

export function saveDraft(id, formData) {
  const all = _getAll()
  const idx = all.findIndex(a => a.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], formData: { ...all[idx].formData, ...formData }, updatedAt: Date.now() }
  _saveAll(all)
  const updated = all[idx]

  // Fire-and-forget Firestore sync (only formData + updatedAt to avoid overwriting docs)
  import('./firestore-sync').then(({ syncDoc }) => {
    syncDoc(`applications/${id}`, { formData: updated.formData, updatedAt: updated.updatedAt })
  }).catch(() => {})

  return updated
}

// ─── Soumettre dossier ────────────────────────────────────────────────────────

export async function submitApplication(id, formData, candidateNote = '') {
  const all = _getAll()
  const idx = all.findIndex(a => a.id === id)
  if (idx < 0) return null

  const now = Date.now()
  const wasCorrection = all[idx].status === 'needs_changes'
  const newStatus = wasCorrection ? 'resubmitted' : 'submitted'
  const defaultNote = wasCorrection ? 'Dossier corrigé et re-soumis' : 'Dossier soumis pour validation'

  const app = {
    ...all[idx],
    formData: { ...all[idx].formData, ...formData },
    status: newStatus,
    submittedAt: now,
    updatedAt: now,
    candidateNote: candidateNote.trim() || all[idx].candidateNote || '',
    auditLog: [
      ...all[idx].auditLog,
      { action: newStatus, by: all[idx].uid, byName: all[idx].name, at: now, note: candidateNote.trim() || defaultNote },
    ],
  }
  all[idx] = app
  _saveAll(all)

  // Mettre le compte en 'pending' dans localStorage + Firestore
  // NB: on n'écrit plus dans pending_validations — le suivi passe uniquement par applications
  try {
    const { updateAccount } = await import('./accounts')
    updateAccount(app.uid, { status: 'pending' })
  } catch {}

  // Sync Firestore
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'applications', id), app)
      await setDoc(doc(db, 'users', app.uid), { status: 'pending' }, { merge: true })
    }
  } catch {}

  return app
}

// ─── Upload document ──────────────────────────────────────────────────────────
// En prod : upload Firebase Storage → renvoie l'URL signée
// En local : stocke uniquement le nom + date (pas de vrai upload)

export async function uploadDocument(appId, docKey, file) {
  const docEntry = { name: file.name, url: null, size: file.size, uploadedAt: Date.now() }

  try {
    const { USE_REAL_FIREBASE } = await import('../firebase')

    if (USE_REAL_FIREBASE) {
      try {
        const { storage, db } = await import('../firebase')
        const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
        const { doc, setDoc } = await import('firebase/firestore')

        const path = `applications/${appId}/${docKey}/${Date.now()}_${file.name}`
        const storageRef = ref(storage, path)

        // 30s timeout — PDF can be heavy
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('storage_timeout')), 30000)
        )
        await Promise.race([uploadBytes(storageRef, file), timeout])
        const url = await Promise.race([getDownloadURL(storageRef), timeout])
        docEntry.url = url

        // Save locally first, then sync full app object to Firestore
        // (avoids dotted-key bug with setDoc+merge and arrayUnion)
        recordDocumentUpload(appId, docKey, docEntry)
        const updatedApp = _getAll().find(a => a.id === appId)
        if (updatedApp) {
          await setDoc(doc(db, 'applications', appId), updatedApp)
        }
        return { ok: true, url }
      } catch (uploadErr) {
        // Firebase Storage unavailable, permission denied, or timeout
        return { ok: false, error: uploadErr?.message || 'upload_failed' }
      }
    }

    // Local mode (no Firebase) — save without URL, it's just a draft
    recordDocumentUpload(appId, docKey, docEntry)
    return { ok: true, url: null }

  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// hasDoc — vérifie qu'au moins un fichier est présent pour ce slot (supporte ancien format objet + nouveau format tableau)
export function hasDoc(app, key) {
  const d = app?.documents?.[key]
  if (!d) return false
  return Array.isArray(d) ? d.length > 0 : true
}

// getDocFiles — renvoie toujours un tableau (compat ancien format)
export function getDocFiles(app, key) {
  const d = app?.documents?.[key]
  if (!d) return []
  return Array.isArray(d) ? d : [d]
}

export function recordDocumentUpload(appId, docKey, entry) {
  const all = _getAll()
  const idx = all.findIndex(a => a.id === appId)
  if (idx < 0) return null
  const existing = all[idx].documents?.[docKey]
  const prev = Array.isArray(existing) ? existing : (existing ? [existing] : [])
  all[idx] = {
    ...all[idx],
    documents: { ...all[idx].documents, [docKey]: [...prev, entry] },
    updatedAt: Date.now(),
  }
  _saveAll(all)
  return all[idx]
}

export async function removeDocumentFile(appId, docKey, index) {
  const all = _getAll()
  const idx = all.findIndex(a => a.id === appId)
  if (idx < 0) return null
  const existing = all[idx].documents?.[docKey]
  const arr = Array.isArray(existing) ? existing : (existing ? [existing] : [])
  const updated = arr.filter((_, i) => i !== index)
  all[idx] = {
    ...all[idx],
    documents: {
      ...all[idx].documents,
      [docKey]: updated.length > 0 ? updated : undefined,
    },
    updatedAt: Date.now(),
  }
  _saveAll(all)

  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'applications', appId), {
        documents: all[idx].documents || {},
        updatedAt: Date.now(),
      }, { merge: true })
    }
  } catch {}

  return all[idx]
}

// ─── Actions admin ────────────────────────────────────────────────────────────

export async function updateApplicationStatus(id, status, adminUid, adminName, note = '', adminNoteStr = '') {
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
  if (adminNoteStr)                { patch.adminNote = adminNoteStr }

  all[idx] = { ...all[idx], ...patch }
  _saveAll(all)

  // Clear pending_validations to avoid showing same user in both Validations + Dossiers tabs
  if (status === 'approved' || status === 'rejected') {
    try {
      const { removePendingValidation } = await import('./accounts')
      removePendingValidation(all[idx].uid)
    } catch {}
  }

  // ── Approbation : upgrader le rôle + copier les permissions dans le profil ──
  if (status === 'approved') {
    const app = all[idx]
    try {
      const { updateAccount } = await import('./accounts')
      const { syncDoc } = await import('./firestore-sync')

      // Permissions dérivées du formulaire
      const perms = {
        role: app.type === 'organisateur' ? 'organisateur' : 'prestataire',
        status: 'active',
        emailVerified: true,   // validé par l'admin = email vérifié
        canSellAlcohol:   !!(app.formData?.alcool),
        approvedAt:       now,
        approvedBy:       adminName,
      }
      if (app.type === 'prestataire') {
        perms.prestataireType = app.formData?.prestataireType || null
        // Set display name: stage name for artistes, otherwise commercial name
        const fd = app.formData || {}
        let displayName = ''
        if (fd.prestataireType === 'artiste' && fd.nomScene?.trim()) {
          displayName = fd.nomScene.trim()
        } else if (fd.nomCommercial?.trim()) {
          displayName = fd.nomCommercial.trim()
        } else {
          displayName = [fd.responsablePrenom, fd.responsableNom]
            .filter(Boolean).map(s => s.trim()).join(' ')
        }
        if (displayName) perms.name = displayName
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
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'applications', id), patch, { merge: true })
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
    if (!USE_REAL_FIREBASE) return getAllApplications()
    const { collection, getDocs, doc, setDoc } = await import('firebase/firestore')
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
    // Migrate resubmitted status (rétro-compatibilité)
    const toFixInFirestore = []
    const finalMerged = merged.map(app => {
      const migrated = _migrateStatus(app)
      if (migrated.status !== app.status) toFixInFirestore.push(migrated)
      return migrated
    })
    _saveAll(finalMerged)
    // Pousse la correction vers Firestore pour les anciens dossiers mal classés
    toFixInFirestore.forEach(app => {
      setDoc(doc(db, 'applications', app.id), { status: 'resubmitted' }, { merge: true }).catch(() => {})
    })
    return finalMerged
  } catch {
    return getAllApplications()
  }
}
