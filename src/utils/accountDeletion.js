// ─── accountDeletion.js ───────────────────────────────────────────────────────
// Gestion des demandes de suppression de compte (organisateurs / prestataires).
// Flux : l'utilisateur soumet une demande → l'admin valide ou refuse dans AgentPage.
// Sur approbation : données personnelles anonymisées, transactions archivées (RGPD).

const KEY = 'lib_deletion_requests'

function _getAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function _saveAll(arr) {
  localStorage.setItem(KEY, JSON.stringify(arr))
}

// ─── Audit : analyse les éléments bloquants / à signaler ─────────────────────
// Ne bloque PAS la soumission de la demande — informe l'admin pour décision éclairée.
export function auditAccountForDeletion(uid, userRole) {
  const blockers = []  // éléments que l'admin devra vérifier avant d'approuver
  const warnings = []  // éléments informatifs (archivage, etc.)

  // ── Événements (organisateur) ──
  if (userRole === 'organisateur') {
    try {
      const allEvents = JSON.parse(localStorage.getItem('lib_created_events') || '[]')
      const myEvents  = allEvents.filter(e =>
        e.organizerId === uid || e.createdBy === uid || e.uid === uid
      )
      const now = Date.now()

      myEvents.forEach(ev => {
        const evDate      = ev.date ? new Date(ev.date).getTime() : 0
        const isFuture    = evDate > now
        const title       = ev.title || ev.name || ev.id

        // Bookings pour cet événement
        let activeBookings = 0
        try {
          const bk = JSON.parse(localStorage.getItem(`lib_bookings_${ev.id}`) || '[]')
          activeBookings = bk.filter(b => b.status !== 'cancelled' && b.status !== 'refunded').length
        } catch {}
        // Fallback: check user_bookings global
        if (!activeBookings) {
          try {
            const users = JSON.parse(localStorage.getItem('lib_registered_users') || '[]')
            users.forEach(u => {
              try {
                const ub = JSON.parse(localStorage.getItem(`lib_user_bookings_${u.uid}`) || '[]')
                activeBookings += ub.filter(b => b.eventId === ev.id && b.status !== 'cancelled').length
              } catch {}
            })
          } catch {}
        }

        if (isFuture && activeBookings > 0) {
          blockers.push({
            type:  'future_event_with_bookings',
            label: `Événement à venir "${title}" (${ev.date || '?'}) — ${activeBookings} réservation(s) active(s)`,
            eventId: ev.id,
          })
        } else if (isFuture) {
          warnings.push({
            type:  'future_event_no_bookings',
            label: `Événement à venir "${title}" — aucune réservation (sera annulé)`,
            eventId: ev.id,
          })
        } else {
          warnings.push({
            type:  'past_event_archived',
            label: `Événement passé "${title}" — sera archivé (billets conservés pour les acheteurs)`,
            eventId: ev.id,
          })
        }
      })
    } catch {}
  }

  // ── Commandes de service (prestataire) ──
  if (userRole === 'prestataire') {
    try {
      const orders  = JSON.parse(localStorage.getItem('lib_service_orders') || '[]')
      const active  = orders.filter(o =>
        o.providerId === uid &&
        ['pending', 'accepted', 'in_progress'].includes(o.status)
      )
      if (active.length > 0) {
        blockers.push({
          type:  'active_service_orders',
          label: `${active.length} commande(s) de service en cours — à finaliser ou annuler avant suppression`,
        })
      }
    } catch {}
  }

  return { blockers, warnings }
}

// ─── CRUD demandes ────────────────────────────────────────────────────────────

export function getDeletionRequestByUser(uid) {
  return _getAll().find(r => r.uid === uid && ['pending', 'approved'].includes(r.status)) || null
}

export function getAllDeletionRequests() {
  // Retourne toutes les demandes en attente, triées par date décroissante
  return _getAll()
    .filter(r => r.status === 'pending')
    .sort((a, b) => b.requestedAt - a.requestedAt)
}

export function createDeletionRequest({
  uid, userName, userEmail, userRole,
  applicationId, applicationType,
  reason, audit,
}) {
  const all      = _getAll()
  const existing = all.find(r => r.uid === uid && r.status === 'pending')
  if (existing) return existing   // déjà une demande en cours

  const req = {
    id:              'del_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    uid,
    userName:        userName || 'Inconnu',
    userEmail:       userEmail || '',
    userRole:        userRole  || '',
    applicationId:   applicationId  || '',
    applicationType: applicationType || '',
    reason:          (reason || '').trim(),
    audit,           // { blockers: [], warnings: [] }
    status:          'pending',   // pending | approved | rejected | cancelled
    requestedAt:     Date.now(),
    resolvedAt:      null,
    resolvedBy:      null,
    resolvedByName:  null,
    adminNote:       '',
  }

  _saveAll([...all, req])

  // Sync Firestore (fire-and-forget)
  import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
    if (!USE_REAL_FIREBASE) return
    import('firebase/firestore').then(({ doc, setDoc }) => {
      setDoc(doc(db, 'deletion_requests', req.id), req).catch(() => {})
    })
  }).catch(() => {})

  return req
}

export function cancelDeletionRequest(requestId) {
  const all = _getAll()
  const idx = all.findIndex(r => r.id === requestId)
  if (idx < 0) return
  const now = Date.now()
  all[idx]  = { ...all[idx], status: 'cancelled', cancelledAt: now }
  _saveAll(all)

  import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
    if (!USE_REAL_FIREBASE) return
    import('firebase/firestore').then(({ doc, updateDoc }) => {
      updateDoc(doc(db, 'deletion_requests', requestId), { status: 'cancelled', cancelledAt: now }).catch(() => {})
    })
  }).catch(() => {})
}

export async function resolveDeletionRequest(requestId, decision, adminUid, adminName, adminNote = '') {
  const all = _getAll()
  const idx = all.findIndex(r => r.id === requestId)
  if (idx < 0) return null

  const now   = Date.now()
  const patch = {
    status:         decision,   // 'approved' | 'rejected'
    resolvedAt:     now,
    resolvedBy:     adminUid,
    resolvedByName: adminName,
    adminNote:      adminNote.trim(),
  }
  all[idx] = { ...all[idx], ...patch }
  _saveAll(all)

  // Si approuvé : anonymiser le compte
  if (decision === 'approved') {
    await _anonymizeAccount(all[idx])
  }

  // Sync Firestore
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, updateDoc } = await import('firebase/firestore')
      await updateDoc(doc(db, 'deletion_requests', requestId), patch)
    }
  } catch {}

  return all[idx]
}

export async function fetchDeletionRequestsFromFirestore() {
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (!USE_REAL_FIREBASE) return []
    const { collection, getDocs, query, where } = await import('firebase/firestore')
    const snap  = await getDocs(query(collection(db, 'deletion_requests'), where('status', '==', 'pending')))
    const remote = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    // Fusionner avec localStorage
    const local  = _getAll()
    const merged = [...local]
    remote.forEach(r => {
      const i = merged.findIndex(l => l.id === r.id)
      if (i >= 0) merged[i] = { ...merged[i], ...r }
      else merged.push(r)
    })
    _saveAll(merged)
    return merged.filter(r => r.status === 'pending')
  } catch {
    return getAllDeletionRequests()
  }
}

// ─── Anonymisation (appelée sur approbation admin) ───────────────────────────
// RGPD Art. 17 : suppression des données personnelles
// Art. 17(3)(b) : exception légale → données transactionnelles conservées anonymisées
async function _anonymizeAccount(req) {
  const { uid, applicationId } = req
  const now = Date.now()

  // 1. Anonymiser l'application
  try {
    const apps  = JSON.parse(localStorage.getItem('lib_applications') || '[]')
    const aIdx  = apps.findIndex(a => a.id === applicationId)
    if (aIdx >= 0) {
      const kept = apps[aIdx].formData?.nomCommercial || 'Compte supprimé'
      apps[aIdx] = {
        ...apps[aIdx],
        status:    'deleted',
        formData:  { nomCommercial: kept },   // conservé pour archivage événements
        documents: {},
        uid:       '[supprimé]',
        deletedAt: now,
      }
      localStorage.setItem('lib_applications', JSON.stringify(apps))
    }
  } catch {}

  // 2. Anonymiser le compte utilisateur (localStorage)
  try {
    const { updateAccount } = await import('./accounts')
    updateAccount(uid, {
      name:      'Compte supprimé',
      email:     `deleted_${uid.slice(0, 8)}@noreply.local`,
      role:      'deleted',
      status:    'deleted',
      deletedAt: now,
    })
  } catch {}

  // 3. Sync Firestore profil + application
  try {
    const { syncDoc } = await import('./firestore-sync')
    syncDoc(`users/${uid}`, {
      name:      'Compte supprimé',
      email:     `deleted_${uid.slice(0, 8)}@noreply.local`,
      role:      'deleted',
      status:    'deleted',
      deletedAt: now,
    })
    if (applicationId) {
      const apps = JSON.parse(localStorage.getItem('lib_applications') || '[]')
      const app  = apps.find(a => a.id === applicationId)
      if (app) {
        syncDoc(`applications/${applicationId}`, {
          status:    'deleted',
          formData:  app.formData,
          documents: {},
          uid:       '[supprimé]',
          deletedAt: now,
        })
      }
    }
  } catch {}
}
