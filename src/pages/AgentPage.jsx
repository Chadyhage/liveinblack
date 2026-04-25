import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getAllAccounts, updateAccount, deleteAccount,
  getPendingValidations, approveValidation, rejectValidation,
  getPendingRoleRequests, approveRoleRequest, rejectRoleRequest,
  ROLES, PRESTATAIRE_TYPES,
} from '../utils/accounts'
import { getBalance, deductFunds, addFunds } from '../utils/wallet'
import {
  getAllApplications, updateApplicationStatus,
  APPLICATION_STATUSES, getCompleteness, DOCUMENT_LABELS,
} from '../utils/applications'
import {
  getAllDeletionRequests,
  fetchDeletionRequestsFromFirestore,
  resolveDeletionRequest,
} from '../utils/accountDeletion'

const ADMIN_EMAIL = 'hagechady4@gmail.com'

// ─── Protect: only agents can access ──────────────────────────────────────
function useAgentGuard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!user || user.role !== 'agent') navigate('/')
  }, [user])
  return user?.role === 'agent'
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Design tokens ────────────────────────────────────────────────────────
const CARD = {
  background: 'rgba(8,10,20,0.55)',
  backdropFilter: 'blur(22px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
}

const FONTS = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
}

const COLORS = {
  teal: '#4ee8c8',
  pink: '#e05aaa',
  gold: '#c8a96e',
  muted: 'rgba(255,255,255,0.42)',
  dim: 'rgba(255,255,255,0.22)',
}

const SECTION_MAP = {
  pending:     { label: 'En attente',  color: '#c8a96e', statuses: ['submitted'] },
  review:      { label: 'En révision', color: '#3b82f6', statuses: ['under_review'] },
  correction:  { label: 'À corriger',  color: '#f59e0b', statuses: ['needs_changes'] },
  resubmitted: { label: 'Re-soumis',   color: '#a78bfa', statuses: ['resubmitted'] },
  validated:   { label: 'Validés',     color: '#22c55e', statuses: ['approved'] },
  refused:     { label: 'Refusés',     color: '#e05aaa', statuses: ['rejected', 'suspended'] },
}

function RoleBadge({ role, small }) {
  const r = ROLES[role] || { label: role, icon: '', color: COLORS.muted }
  const size = small ? { fontSize: 9, padding: '2px 6px' } : { fontSize: 10, padding: '3px 8px' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      borderRadius: 4, border: `1px solid ${r.color}44`,
      background: r.color + '11', color: r.color,
      fontFamily: FONTS.mono, fontWeight: 600, letterSpacing: '0.04em',
      ...size,
    }}>
      {r.label}
    </span>
  )
}

function StatusBadge({ status }) {
  const cfg = {
    active:   { label: 'ACTIF',      color: '#4ee8c8' },
    pending:  { label: 'EN ATTENTE', color: '#c8a96e' },
    rejected: { label: 'REFUSÉ',     color: '#e05aaa' },
    banned:   { label: 'BANNI',      color: COLORS.muted },
  }[status] || { label: status.toUpperCase(), color: COLORS.muted }
  return (
    <span style={{
      fontFamily: FONTS.mono, fontSize: 9, padding: '2px 6px',
      borderRadius: 4, border: `1px solid ${cfg.color}44`,
      background: cfg.color + '11', color: cfg.color,
      fontWeight: 600, letterSpacing: '0.06em',
    }}>
      {cfg.label}
    </span>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
// ── Local storage keys à vider lors d'un reset total ──────────────────────
const LIB_KEYS = [
  'lib_user', 'lib_users', 'lib_registered_users',
  'lib_bookings', 'lib_events', 'lib_created_events',
  'lib_conversations', 'lib_messages', 'lib_wallet', 'lib_social',
  'lib_pending_validations', 'lib_role_requests', 'lib_applications',
  'lib_catalog', 'lib_service_orders', 'lib_notifications',
  'lib_boosts', 'lib_used_tickets', 'lib_deletion_requests',
  'lib_provider_profiles', 'lib_group_bookings', 'lib_last_read',
  'lib_friend_requests', 'lib_friends', 'lib_blocked', 'lib_online',
  'lib_new_contacts', 'lib_event_codes', 'lib_reports', 'lib_typing',
  'lib_photo_cache', 'lib_boite_registration',
]

async function resetAllData() {
  // 1. Vider localStorage
  LIB_KEYS.forEach(k => localStorage.removeItem(k))

  // 2. Vider les collections Firestore (sauf users/admin)
  try {
    const { db } = await import('../firebase')
    const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore')
    const toDelete = [
      'users', 'user_social', 'user_bookings', 'user_events', 'wallets',
      'conversations', 'conv_messages', 'friend_requests',
      'pending_validations', 'catalogs', 'providers', 'service_orders',
      'group_bookings', 'applications',
    ]
    await Promise.all(toDelete.map(async col => {
      const snap = await getDocs(collection(db, col))
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col, d.id))))
    }))
  } catch (e) {
    console.error('Reset Firestore partiel :', e)
  }
}

export default function AgentPage() {
  const isAgent = useAgentGuard()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('dashboard')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [pending, setPending] = useState([])
  const [roleRequests, setRoleRequests] = useState([])
  const [applications, setApplications] = useState([])
  const [selectedApp, setSelectedApp] = useState(null)
  const [appNote, setAppNote] = useState('')
  const [appAdminNote, setAppAdminNote] = useState('')
  const [activeAction, setActiveAction] = useState(null) // 'approve' | 'changes' | 'reject' | null
  const [adminNoteInput, setAdminNoteInput] = useState('')
  const [dossierFilter, setDossierFilter] = useState(null)
  const [dossierSection, setDossierSection] = useState('pending')
  const [dossierSearch, setDossierSearch] = useState('')
  const [roleRejectReason, setRoleRejectReason] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [editField, setEditField] = useState(null)
  const [balanceAdjust, setBalanceAdjust] = useState({ uid: null, amount: '', reason: '' })
  const [toast, setToast] = useState(null)
  const [deletionRequests, setDeletionRequests] = useState([])
  const [delResNote, setDelResNote]             = useState('')  // note admin pour résolution

  function refresh() {
    setAccounts(getAllAccounts())
    setPending(getPendingValidations())
    setRoleRequests(getPendingRoleRequests().filter(r => r.status === 'pending'))
    setApplications(getAllApplications())
    setDeletionRequests(getAllDeletionRequests())
  }

  // Returns the org/business name for organisateurs & prestataires, personal name otherwise
  function getDisplayName(u) {
    if (u?.role === 'organisateur' || u?.role === 'prestataire') {
      const app = applications.find(a => a.uid === (u.uid || u.id))
      if (app?.formData?.nomCommercial) return app.formData.nomCommercial
    }
    return u?.name || '—'
  }

  useEffect(() => {
    refresh() // immediate local data
    // Then pull fresh data from Firestore
    async function fetchFromFirestore() {
      try {
        const { loadCollection } = await import('../utils/firestore-sync')
        const { fetchApplicationsFromFirestore } = await import('../utils/applications')
        const [apps, pendingSnap, usersSnap] = await Promise.all([
          fetchApplicationsFromFirestore(),
          loadCollection('pending_validations'),
          loadCollection('users'),
        ])

        // Sync users from Firestore → localStorage so the Comptes tab is populated
        const existing = getAllAccounts()
        const merged = [...existing]

        // Always include the current admin account (even if Firestore read fails)
        try {
          const currentUser = JSON.parse(localStorage.getItem('lib_user') || 'null')
          if (currentUser?.uid && !merged.find(a => a.uid === currentUser.uid)) {
            merged.push(currentUser)
          }
        } catch {}

        if (usersSnap.length) {
          usersSnap.forEach(u => {
            // Ignorer les docs Firestore fantômes (sans email ni nom — inscriptions abandonnées)
            if (!u.uid || (!u.email && !u.name)) return
            const idx = merged.findIndex(a => a.uid === u.uid)
            if (idx >= 0) merged[idx] = { ...merged[idx], ...u }
            else merged.push(u)
          })
        }
        // Filtrer les entrées invalides avant de sauvegarder
        const cleanMerged = merged.filter(u => u.uid && (u.email || u.name))
        localStorage.setItem('lib_registered_users', JSON.stringify(cleanMerged))

        if (pendingSnap.length) {
          const validations = pendingSnap.filter(p => p.type !== 'role_request')
          const roleReqs = pendingSnap.filter(p => p.type === 'role_request')
          if (validations.length) localStorage.setItem('lib_pending_validations', JSON.stringify(validations))
          if (roleReqs.length) {
            const existing = JSON.parse(localStorage.getItem('lib_role_requests') || '[]')
            const merged = [...roleReqs, ...existing.filter(e => !roleReqs.find(r => r.id === e.id))]
            localStorage.setItem('lib_role_requests', JSON.stringify(merged))
          }
        }
        setApplications(apps)
        setPending(getPendingValidations())
        setRoleRequests(getPendingRoleRequests().filter(r => r.status === 'pending'))
        setAccounts(getAllAccounts())

        // Demandes de suppression depuis Firestore
        const delReqs = await fetchDeletionRequestsFromFirestore()
        setDeletionRequests(delReqs)
      } catch {}
    }
    fetchFromFirestore()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  if (!isAgent) return null

  // ── Presence helper — true if lastSeen within 5 min ──
  function isUserOnline(acc) {
    if (acc?.isOnline && acc?.lastSeen && (Date.now() - acc.lastSeen) < 5 * 60 * 1000) return true
    return !!(acc?.lastSeen && (Date.now() - acc.lastSeen) < 5 * 60 * 1000)
  }

  // Exclure les comptes avec email non vérifié des stats principales
  const verifiedAccounts  = accounts.filter(a => a.emailVerified !== false)
  const totalUsers        = verifiedAccounts.length
  const totalActive       = verifiedAccounts.filter(a => a.status === 'active').length
  const totalPrestataires = verifiedAccounts.filter(a => a.role === 'prestataire').length
  const totalOrgas        = verifiedAccounts.filter(a => a.role === 'organisateur').length
  const totalOnline       = verifiedAccounts.filter(isUserOnline).length

  // ── Emails non vérifiés (clients uniquement — pas les org/prest en onboarding) ──
  const UNVERIFIED_TTL = 7 * 24 * 60 * 60 * 1000 // 7 jours
  const unverifiedAccounts = accounts.filter(a =>
    a.emailVerified === false && (a.role === 'client' || a.role === 'user')
  )
  const expiredUnverified = unverifiedAccounts.filter(a =>
    a.createdAt && (Date.now() - a.createdAt) > UNVERIFIED_TTL
  )

  // ── Doublons (même email, comptes différents) ──
  const emailGroups = {}
  accounts.forEach(a => { if (a.email) { emailGroups[a.email] = [...(emailGroups[a.email] || []), a] } })
  const duplicateGroups = Object.entries(emailGroups).filter(([, group]) => group.length > 1)
  const totalRoleReqs     = roleRequests.length
  const totalAppsSubmitted = applications.filter(a => a.status === 'submitted' || a.status === 'under_review').length
  // Count only applications + role requests to avoid double-counting the same dossier.
  const totalAllPending   = totalAppsSubmitted + totalRoleReqs

  const filtered = accounts.filter(a => {
    const matchSearch = !search ||
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.email?.toLowerCase().includes(search.toLowerCase()) ||
      a.phone?.includes(search)
    const matchRole   = roleFilter === 'all' || a.role === roleFilter
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    return matchSearch && matchRole && matchStatus
  })

  async function handleApprove(uid) {
    await approveValidation(uid)
    refresh()
    showToast('Compte validé')
    setConfirmAction(null)
  }

  async function handleReject(uid) {
    await rejectValidation(uid, rejectReason)
    setRejectReason('')
    refresh()
    showToast('Compte refusé', 'error')
    setConfirmAction(null)
  }

  async function handleBan(uid) {
    const bannedAt = Date.now()
    updateAccount(uid, { status: 'banned', bannedAt })
    try {
      const { db } = await import('../firebase')
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'users', uid), { status: 'banned', bannedAt }, { merge: true })
    } catch {}
    refresh()
    showToast('Compte suspendu')
    setConfirmAction(null)
    setSelectedUser(null)
  }

  async function handleDelete(uid) {
    // 1. Supprimer du localStorage
    deleteAccount(uid)
    // 2. Supprimer Firestore : profil + toutes les collections liées
    try {
      const { db } = await import('../firebase')
      const { doc, deleteDoc } = await import('firebase/firestore')
      const collections = ['users', 'wallets', 'user_bookings', 'user_events', 'user_social', 'catalogs', 'providers']
      await Promise.allSettled(collections.map(col => deleteDoc(doc(db, col, uid))))
    } catch {}
    refresh()
    showToast('Compte supprimé', 'error')
    setConfirmAction(null)
    setSelectedUser(null)
  }

  async function handleVerifyEmail(uid) {
    // Marque emailVerified:true + status:active dans localStorage et Firestore
    updateAccount(uid, { emailVerified: true, status: 'active' })
    try {
      const { db } = await import('../firebase')
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'users', uid), { emailVerified: true, status: 'active' }, { merge: true })
    } catch {}
    refresh()
    showToast('Email vérifié manuellement')
  }

  async function handleDeleteUnverified(uid) {
    deleteAccount(uid)
    try {
      const { db } = await import('../firebase')
      const { doc, deleteDoc } = await import('firebase/firestore')
      const cols = ['users', 'wallets', 'user_bookings', 'user_events', 'user_social']
      await Promise.allSettled(cols.map(c => deleteDoc(doc(db, c, uid))))
    } catch {}
    refresh()
    showToast('Compte non vérifié supprimé')
  }

  async function handleCleanupExpired() {
    const expired = accounts.filter(a =>
      a.emailVerified === false && (a.role === 'client' || a.role === 'user') &&
      a.createdAt && (Date.now() - a.createdAt) > 7 * 24 * 60 * 60 * 1000
    )
    for (const a of expired) await handleDeleteUnverified(a.uid)
    showToast(`${expired.length} compte(s) expirés supprimés`)
  }

  async function handleCleanupDuplicates() {
    // Pour chaque groupe de doublons : garder le plus récent, supprimer les autres
    const emailMap = {}
    accounts.forEach(a => { if (a.email) emailMap[a.email] = [...(emailMap[a.email] || []), a] })
    const dupes = Object.values(emailMap).filter(g => g.length > 1)
    let count = 0
    for (const group of dupes) {
      const sorted = [...group].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      for (const old of sorted.slice(1)) { // garder le [0] (plus récent), supprimer le reste
        await handleDeleteUnverified(old.uid)
        count++
      }
    }
    showToast(`${count} doublon(s) supprimé(s)`)
  }

  async function handleApproveRoleRequest(requestId) {
    await approveRoleRequest(requestId)
    refresh()
    showToast('Accès activé')
    setConfirmAction(null)
  }

  async function handleRejectRoleRequest(requestId) {
    await rejectRoleRequest(requestId, roleRejectReason)
    setRoleRejectReason('')
    refresh()
    showToast('Demande refusée', 'error')
    setConfirmAction(null)
  }

  async function handleReactivate(uid) {
    updateAccount(uid, { status: 'active' })
    try {
      const { db } = await import('../firebase')
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'users', uid), { status: 'active', reactivatedAt: Date.now() }, { merge: true })
    } catch {}
    refresh()
    showToast('Compte réactivé')
    setSelectedUser(u => u?.uid === uid ? { ...u, status: 'active' } : u)
  }

  async function handleSaveEdit() {
    if (!editField) return
    updateAccount(editField.uid, { [editField.field]: editField.value })
    try {
      const { db } = await import('../firebase')
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'users', editField.uid), { [editField.field]: editField.value }, { merge: true })
    } catch {}
    refresh()
    setSelectedUser(u => u?.uid === editField.uid ? { ...u, [editField.field]: editField.value } : u)
    setEditField(null)
    showToast('Mis à jour')
  }

  function handleBalanceAdjust() {
    const amt = parseFloat(balanceAdjust.amount)
    if (!amt || !balanceAdjust.uid) return
    if (amt < 0) {
      deductFunds(balanceAdjust.uid, Math.abs(amt), balanceAdjust.reason || 'Ajustement admin')
    } else {
      addFunds(balanceAdjust.uid, amt, balanceAdjust.reason || 'Ajustement admin')
    }
    showToast('Solde ajusté')
    setBalanceAdjust({ uid: null, amount: '', reason: '' })
  }

  async function handleAppAction(appId, status, note) {
    const adminNoteValue = appAdminNote || ''
    const updatedApp = await updateApplicationStatus(appId, status, user?.uid, user?.name || 'Agent', note, adminNoteValue)
    refresh()
    setSelectedApp(apps => apps ? { ...apps, status, ...(status === 'approved' ? { approvedAt: Date.now() } : {}), ...(status === 'rejected' ? { rejectionReason: note } : {}), ...(status === 'needs_changes' ? { requestedChanges: note } : {}) } : null)
    showToast(status === 'approved' ? 'Dossier approuvé' : status === 'rejected' ? 'Dossier refusé' : status === 'needs_changes' ? 'Corrections demandées' : status === 'under_review' ? 'Dossier en révision' : 'Dossier mis à jour')

    // Fire in-app notification to the applicant
    const applicantUid = updatedApp?.uid
    if (applicantUid) {
      try {
        const { createNotification } = await import('../utils/notifications')
        if (status === 'approved') {
          createNotification(applicantUid, 'application_approved',
            'Dossier approuvé ✅',
            'Ton dossier LIVEINBLACK a été validé. Connecte-toi pour accéder à ton espace.',
            { appId }
          )
        } else if (status === 'rejected') {
          createNotification(applicantUid, 'application_rejected',
            'Dossier refusé',
            note || 'Ton dossier n\'a pas été retenu. Contacte-nous pour plus d\'informations.',
            { appId }
          )
        } else if (status === 'needs_changes') {
          createNotification(applicantUid, 'application_needs_changes',
            'Corrections requises ⚠️',
            note || 'Des modifications sont demandées sur ton dossier. Ouvre Mon Dossier pour voir les détails.',
            { appId }
          )
        }
      } catch {}
    }

    setAppNote('')
    setAppAdminNote('')
    setActiveAction(null)
    setConfirmAction(null)
  }

  // ── Shared input style ──
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(8,10,20,0.7)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 6, color: '#fff',
    fontFamily: FONTS.mono, fontSize: 12,
    padding: '9px 12px',
    outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>

      {/* ── Top bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(4,4,14,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => navigate('/accueil')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.muted, fontSize: 20, lineHeight: 1 }}
        >←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{
            fontFamily: FONTS.display, fontWeight: 300,
            fontSize: 17, letterSpacing: '0.12em', color: '#fff', margin: 0,
            textTransform: 'uppercase',
          }}>
            LIVE<span style={{ color: COLORS.gold }}>IN</span>BLACK
            <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, marginLeft: 8, letterSpacing: '0.08em' }}>
              Interface Agent
            </span>
          </h1>
          <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '2px 0 0' }}>
            {user?.name} · {user?.email}
          </p>
        </div>
        {totalAllPending > 0 && (
          <button
            onClick={() => setTab('dossiers')}
            style={{
              fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em',
              background: 'rgba(200,169,110,0.14)', border: '1px solid rgba(200,169,110,0.45)',
              color: COLORS.gold, borderRadius: 4, padding: '5px 10px',
              cursor: 'pointer', animation: 'pulse 2s infinite',
            }}>
            {totalAllPending} EN ATTENTE
          </button>
        )}
      </div>

      {/* ── Nav tabs ── */}
      <div style={{
        display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)',
        overflowX: 'auto',
      }}>
        {[
          { key: 'dashboard',    label: 'Dashboard' },
          { key: 'users',        label: 'Comptes' },
          { key: 'dossiers',     label: `Dossiers${totalAppsSubmitted > 0 ? ` (${totalAppsSubmitted})` : ''}` },
          { key: 'suppressions', label: `Suppressions${deletionRequests.length > 0 ? ` (${deletionRequests.length})` : ''}` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flexShrink: 0, padding: '12px 20px',
              fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer',
              background: 'none',
              borderBottom: tab === t.key ? `2px solid ${COLORS.gold}` : '2px solid transparent',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              color: tab === t.key ? COLORS.gold : COLORS.dim,
              transition: 'color 0.2s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 16px 8px', maxWidth: 520, margin: '0 auto' }}>

        {/* ══════════════════════════════════════════════
            DASHBOARD
        ══════════════════════════════════════════════ */}
        {tab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>

            {/* Stat grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Comptes total', value: totalUsers,        color: '#4ee8c8',   onClick: () => { setTab('users'); setRoleFilter('all'); setStatusFilter('all'); setSearch('') } },
                { label: 'Connectés',     value: totalOnline,       color: '#22c55e',   onClick: () => { setTab('users'); setRoleFilter('all'); setStatusFilter('all'); setSearch('') } },
                { label: 'Prestataires', value: totalPrestataires,  color: COLORS.gold, onClick: () => { setTab('users'); setRoleFilter('prestataire'); setStatusFilter('all'); setSearch('') } },
                { label: 'En attente',   value: totalAllPending,    color: totalAllPending > 0 ? COLORS.pink : COLORS.muted, alert: totalAllPending > 0, onClick: () => setTab('dossiers') },
              ].map(s => (
                <button key={s.label} onClick={s.onClick} style={{
                  ...CARD,
                  padding: 16,
                  borderColor: s.alert ? `${s.color}55` : 'rgba(255,255,255,0.10)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.2s, background 0.2s',
                }}>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>
                    {s.label}
                  </p>
                  <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 38, color: s.color, margin: 0, lineHeight: 1 }}>
                    {s.value}
                  </p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 8, color: s.color, margin: '6px 0 0', letterSpacing: '0.08em', opacity: 0.7 }}>
                    VOIR →
                  </p>
                </button>
              ))}
            </div>

            {/* Recent registrations */}
            <div>
              <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                Inscriptions récentes
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...accounts].filter(a => a.emailVerified !== false).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5).map(u => (
                  <button key={u.uid} onClick={() => { setSelectedUser(u); setTab('users') }}
                    style={{
                      ...CARD, display: 'flex', alignItems: 'center', gap: 12,
                      padding: 12, cursor: 'pointer', width: '100%', textAlign: 'left',
                      transition: 'border-color 0.2s',
                    }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: FONTS.mono, fontSize: 12, color: COLORS.teal, fontWeight: 700,
                      }}>
                        {getDisplayName(u)?.[0]?.toUpperCase() || '?'}
                      </div>
                      {isUserOnline(u) && (
                        <span style={{
                          position: 'absolute', bottom: 0, right: 0,
                          width: 8, height: 8, borderRadius: '50%',
                          background: '#22c55e', border: '2px solid #04040b',
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: FONTS.display, fontWeight: 400, fontSize: 15, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getDisplayName(u)}</p>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(u.role === 'organisateur' || u.role === 'prestataire') && getDisplayName(u) !== u.name ? `${u.name} · ` : ''}{u.email}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <RoleBadge role={u.role} small />
                      <StatusBadge status={u.status} />
                    </div>
                  </button>
                ))}
                {accounts.length === 0 && (
                  <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.dim, textAlign: 'center', padding: '32px 0' }}>Aucun compte enregistré</p>
                )}
              </div>
            </div>

            {/* Breakdown by role */}
            <div>
              <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                Répartition par rôle
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(ROLES)
                  .filter(([key]) => key !== 'user' && key !== 'agent') // 'user' = alias client, 'agent' = toujours 1 seul
                  .map(([key, r]) => {
                    // compter 'user' avec 'client' pour ne pas perdre ces comptes
                    const count = accounts.filter(a => a.role === key || (key === 'client' && a.role === 'user')).length
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, width: 80, flexShrink: 0 }}>{r.label}</span>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, transition: 'width 0.4s', width: totalUsers ? `${(count / totalUsers) * 100}%` : '0%', background: r.color }} />
                        </div>
                        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#fff', width: 16, textAlign: 'right' }}>{count}</span>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* ── Emails non vérifiés ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: unverifiedAccounts.length > 0 ? '#f59e0b' : COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                  {unverifiedAccounts.length > 0 ? '⚠' : '✓'} Emails non vérifiés ({unverifiedAccounts.length})
                </p>
                {expiredUnverified.length > 0 && (
                  <button onClick={handleCleanupExpired} style={{
                    fontFamily: FONTS.mono, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase',
                    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444', borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
                  }}>
                    Supprimer +7j ({expiredUnverified.length})
                  </button>
                )}
              </div>
              {unverifiedAccounts.length === 0 ? (
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, padding: '4px 0 8px' }}>
                  Aucun email non vérifié en attente.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {unverifiedAccounts.map(u => {
                    const ageMs = u.createdAt ? Date.now() - u.createdAt : null
                    const ageDays = ageMs !== null ? Math.floor(ageMs / (24 * 60 * 60 * 1000)) : null
                    const isExpired = ageDays !== null && ageDays >= 7
                    return (
                      <div key={u.uid} style={{
                        ...CARD, padding: '12px 14px',
                        borderColor: isExpired ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.25)',
                      }}>
                        {/* Infos compte */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                            background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700, color: '#f59e0b',
                          }}>
                            {getDisplayName(u)?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 400, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {getDisplayName(u)}
                            </p>
                            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {(u.role === 'organisateur' || u.role === 'prestataire') && getDisplayName(u) !== u.name ? `${u.name} · ` : ''}{u.email}
                            </p>
                          </div>
                          <span style={{
                            fontFamily: FONTS.mono, fontSize: 9, flexShrink: 0,
                            color: isExpired ? '#ef4444' : '#f59e0b',
                            background: isExpired ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                            border: `1px solid ${isExpired ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.2)'}`,
                            borderRadius: 4, padding: '2px 6px',
                          }}>
                            {ageDays !== null ? `J+${ageDays}` : '?'}
                          </span>
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleVerifyEmail(u.uid)} style={{
                            flex: 1, padding: '7px 0',
                            fontFamily: FONTS.mono, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase',
                            background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.3)',
                            color: COLORS.teal, borderRadius: 4, cursor: 'pointer',
                          }}>
                            ✓ Vérifier manuellement
                          </button>
                          <button onClick={() => handleDeleteUnverified(u.uid)} style={{
                            flex: 1, padding: '7px 0',
                            fontFamily: FONTS.mono, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase',
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                            color: '#ef4444', borderRadius: 4, cursor: 'pointer',
                          }}>
                            ✕ Supprimer
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Doublons détectés ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: duplicateGroups.length > 0 ? COLORS.pink : COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                  {duplicateGroups.length > 0 ? '⚠' : '✓'} Doublons ({duplicateGroups.length})
                </p>
                {duplicateGroups.length > 0 && (
                  <button onClick={handleCleanupDuplicates} style={{
                    fontFamily: FONTS.mono, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase',
                    background: 'rgba(224,90,170,0.10)', border: '1px solid rgba(224,90,170,0.3)',
                    color: COLORS.pink, borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
                  }}>
                    Nettoyer tout
                  </button>
                )}
              </div>
              {duplicateGroups.length === 0 ? (
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, padding: '8px 0' }}>
                  Aucun doublon détecté.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {duplicateGroups.map(([email, group]) => (
                    <div key={email} style={{ ...CARD, padding: '10px 12px', borderColor: 'rgba(224,90,170,0.2)' }}>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#fff', margin: '0 0 6px' }}>{email}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {[...group].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((u, i) => (
                          <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: i === 0 ? COLORS.teal : COLORS.dim }}>
                              {i === 0 ? '✓ Garder' : '✕ Doublon'} · {formatDate(u.createdAt)}
                            </span>
                            <RoleBadge role={u.role} small />
                            <StatusBadge status={u.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ══════════════════════════════════════════════
            USERS / ACCOUNTS
        ══════════════════════════════════════════════ */}
        {tab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>

            {/* Search + filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: COLORS.dim, pointerEvents: 'none' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  style={{ ...inputStyle, paddingLeft: 34 }}
                  placeholder="Nom, email, téléphone..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {/* Role filters */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {[
                  { key: 'all',          label: 'Tous' },
                  { key: 'user',         label: 'Utilisateurs' },
                  { key: 'prestataire',  label: 'Presta' },
                  { key: 'organisateur', label: 'Orgas' },
                  { key: 'agent',        label: 'Agents' },
                ].map(f => (
                  <button key={f.key} onClick={() => setRoleFilter(f.key)}
                    style={{
                      flexShrink: 0, padding: '4px 10px', borderRadius: 4,
                      fontFamily: FONTS.mono, fontSize: 9, letterSpacing: '0.06em',
                      textTransform: 'uppercase', cursor: 'pointer',
                      background: roleFilter === f.key ? 'rgba(200,169,110,0.18)' : 'transparent',
                      border: roleFilter === f.key ? '1px solid rgba(200,169,110,0.45)' : '1px solid rgba(255,255,255,0.10)',
                      color: roleFilter === f.key ? COLORS.gold : COLORS.dim,
                      transition: 'all 0.15s',
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Status filters */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['all', 'active', 'pending', 'rejected', 'banned'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    style={{
                      flexShrink: 0, padding: '3px 8px', borderRadius: 4,
                      fontFamily: FONTS.mono, fontSize: 9, letterSpacing: '0.06em',
                      textTransform: 'uppercase', cursor: 'pointer',
                      background: statusFilter === s ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: statusFilter === s ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(255,255,255,0.08)',
                      color: statusFilter === s ? '#fff' : COLORS.dim,
                      transition: 'all 0.15s',
                    }}>
                    {s === 'all' ? 'Tous statuts' : s}
                  </button>
                ))}
              </div>
            </div>

            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>
              {filtered.length} compte{filtered.length !== 1 ? 's' : ''}
            </p>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(u => (
                <button key={u.uid} onClick={() => setSelectedUser(u)}
                  style={{
                    ...CARD, display: 'flex', alignItems: 'center', gap: 12,
                    padding: 12, cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: u.role === 'agent' ? 'rgba(200,169,110,0.12)' : 'rgba(255,255,255,0.05)',
                      border: u.role === 'agent' ? '1px solid rgba(200,169,110,0.35)' : '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                      color: u.role === 'agent' ? COLORS.gold : '#fff',
                    }}>
                      {getDisplayName(u)?.[0]?.toUpperCase() || '?'}
                    </div>
                    {isUserOnline(u) && (
                      <span style={{
                        position: 'absolute', bottom: 1, right: 1,
                        width: 9, height: 9, borderRadius: '50%',
                        background: '#22c55e', border: '2px solid #04040b',
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: FONTS.display, fontWeight: 400, fontSize: 15, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getDisplayName(u)}</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(u.role === 'organisateur' || u.role === 'prestataire') && getDisplayName(u) !== u.name ? `${u.name} · ` : ''}{u.email}{u.phone ? ` · ${u.phone}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <RoleBadge role={u.role} small />
                    <StatusBadge status={u.status} />
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p style={{ textAlign: 'center', fontFamily: FONTS.mono, fontSize: 12, color: COLORS.dim, padding: '40px 0' }}>
                  Aucun compte trouvé
                </p>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            VALIDATIONS (legacy — kept hidden, data still loaded for totalAllPending count)
        ══════════════════════════════════════════════ */}
        {false && tab === 'validations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            {pending.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 20, color: '#fff', margin: 0 }}>
                  Aucune validation en attente
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>Tous les comptes ont été traités.</p>
              </div>
            ) : pending.map(u => (
              <div key={u.uid} style={{ ...CARD, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.20)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: COLORS.teal,
                  }}>
                    {getDisplayName(u)?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: FONTS.display, fontWeight: 400, fontSize: 17, color: '#fff', margin: '0 0 2px' }}>{getDisplayName(u)}</p>
                    {(u.role === 'organisateur' || u.role === 'prestataire') && getDisplayName(u) !== u.name && (
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '0 0 2px' }}>{u.name}</p>
                    )}
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '0 0 4px' }}>{u.email}</p>
                    {u.phone && (
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '0 0 6px' }}>{u.phone}</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <RoleBadge role={u.role} small />
                      {u.prestataireType && (
                        <span style={{
                          fontFamily: FONTS.mono, fontSize: 9,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                          borderRadius: 4, padding: '2px 6px', color: COLORS.dim,
                        }}>
                          {PRESTATAIRE_TYPES.find(t => t.key === u.prestataireType)?.label || u.prestataireType}
                        </span>
                      )}
                    </div>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: 'rgba(255,255,255,0.18)', marginTop: 6 }}>
                      Demande le {formatDate(u.requestedAt)}
                    </p>
                  </div>
                </div>

                <input
                  style={inputStyle}
                  placeholder="Motif de refus (optionnel)"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setConfirmAction({ type: 'reject', uid: u.uid, name: u.name })}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 4, cursor: 'pointer',
                      border: '1px solid rgba(220,50,50,0.35)',
                      background: 'rgba(220,50,50,0.10)',
                      color: 'rgba(220,100,100,0.9)',
                      fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                    Refuser
                  </button>
                  <button
                    onClick={() => setConfirmAction({ type: 'approve', uid: u.uid, name: u.name })}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 4, cursor: 'pointer',
                      background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))',
                      border: '1px solid rgba(78,232,200,0.35)',
                      color: COLORS.teal,
                      fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                    Valider
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ROLE REQUESTS (legacy — tab removed)
        ══════════════════════════════════════════════ */}
        {false && tab === 'role-requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            {roleRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 20, color: '#fff', margin: 0 }}>
                  Aucune demande de rôle
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>
                  Les demandes d'accès organisateur/prestataire apparaissent ici.
                </p>
              </div>
            ) : roleRequests.map(req => {
              const roleCfg = ROLES[req.requestedRole] || { label: req.requestedRole, color: '#fff', icon: '' }
              return (
                <div key={req.id} style={{ ...CARD, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                      background: roleCfg.color + '14', border: `1px solid ${roleCfg.color}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: roleCfg.color,
                    }}>
                      {req.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: FONTS.display, fontWeight: 400, fontSize: 17, color: '#fff', margin: '0 0 2px' }}>{req.name}</p>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '0 0 6px' }}>{req.email}</p>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Current role (client) */}
                        <span style={{ fontFamily: FONTS.mono, fontSize: 9, padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.08)', color: '#22c55e' }}>
                          Client
                        </span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                        {/* Requested role */}
                        <span style={{ fontFamily: FONTS.mono, fontSize: 9, padding: '2px 6px', borderRadius: 4, border: `1px solid ${roleCfg.color}44`, background: roleCfg.color + '14', color: roleCfg.color }}>
                          {roleCfg.label}
                        </span>
                        {req.prestataireType && (
                          <span style={{ fontFamily: FONTS.mono, fontSize: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '2px 6px', color: COLORS.dim }}>
                            {PRESTATAIRE_TYPES.find(t => t.key === req.prestataireType)?.label || req.prestataireType}
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: 'rgba(255,255,255,0.18)', marginTop: 6 }}>
                        Demandé le {formatDate(req.requestedAt)}
                      </p>
                    </div>
                  </div>

                  <input
                    style={inputStyle}
                    placeholder="Motif de refus (optionnel)"
                    value={roleRejectReason}
                    onChange={e => setRoleRejectReason(e.target.value)}
                  />

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setConfirmAction({ type: 'rejectRole', id: req.id, name: req.name, role: roleCfg.label })}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 4, cursor: 'pointer',
                        border: '1px solid rgba(220,50,50,0.35)',
                        background: 'rgba(220,50,50,0.10)',
                        color: 'rgba(220,100,100,0.9)',
                        fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                      Refuser
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: 'approveRole', id: req.id, name: req.name, role: roleCfg.label })}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 4, cursor: 'pointer',
                        background: `linear-gradient(135deg, ${roleCfg.color}33, ${roleCfg.color}11)`,
                        border: `1px solid ${roleCfg.color}55`,
                        color: roleCfg.color,
                        fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                      Activer
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            DOSSIERS
        ══════════════════════════════════════════════ */}
        {tab === 'dossiers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>

            {/* Section sub-tabs with counts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
              {Object.entries(SECTION_MAP).map(([key, sec]) => {
                const count = applications.filter(a => sec.statuses.includes(a.status)).length
                const active = dossierSection === key
                return (
                  <button key={key} onClick={() => { setDossierSection(key); setDossierSearch('') }}
                    style={{
                      padding: '8px 4px', borderRadius: 6, cursor: 'pointer', textAlign: 'center',
                      background: active ? sec.color + '18' : 'transparent',
                      border: `1px solid ${active ? sec.color + '55' : 'rgba(255,255,255,0.08)'}`,
                      transition: 'all 0.15s',
                    }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 16, fontWeight: 700, color: active ? sec.color : COLORS.dim, margin: '0 0 2px', lineHeight: 1 }}>{count}</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 8, color: active ? sec.color : COLORS.dim, margin: 0, letterSpacing: '0.04em', lineHeight: 1.3, textTransform: 'uppercase' }}>{sec.label}</p>
                  </button>
                )
              })}
            </div>

            {/* Search bar */}
            {(() => {
              const sec = SECTION_MAP[dossierSection]
              const totalInSection = applications.filter(a => sec.statuses.includes(a.status)).length
              if (totalInSection === 0) return null
              return (
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 13, color: 'rgba(255,255,255,0.25)', pointerEvents: 'none', lineHeight: 1,
                  }}>⌕</span>
                  <input
                    type="text"
                    value={dossierSearch}
                    onChange={e => setDossierSearch(e.target.value)}
                    placeholder={`Rechercher dans « ${sec.label} »…`}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'rgba(8,10,20,0.6)',
                      border: `1px solid ${dossierSearch ? sec.color + '55' : 'rgba(255,255,255,0.10)'}`,
                      borderRadius: 7, color: '#fff',
                      fontFamily: FONTS.mono, fontSize: 11,
                      padding: '9px 12px 9px 30px',
                      outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                  />
                  {dossierSearch && (
                    <button
                      onClick={() => setDossierSearch('')}
                      style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
                        cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2,
                      }}>×</button>
                  )}
                </div>
              )
            })()}

            {/* List for selected section */}
            {(() => {
              const sec = SECTION_MAP[dossierSection]
              const sectionColor = sec.color
              const q = dossierSearch.toLowerCase().trim()
              const list = applications
                .filter(a => sec.statuses.includes(a.status))
                .filter(a => {
                  if (!q) return true
                  const name = (a.formData?.nomCommercial || a.name || '').toLowerCase()
                  const email = (a.email || '').toLowerCase()
                  const type = (a.formData?.prestataireType || '').toLowerCase()
                  return name.includes(q) || email.includes(q) || type.includes(q)
                })
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
              if (list.length === 0) return (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 20, color: '#fff', margin: '0 0 8px' }}>
                    {q ? 'Aucun résultat' : 'Aucun dossier'}
                  </p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>
                    {q
                      ? `Aucun dossier ne correspond à « ${dossierSearch} » dans « ${sec.label} ».`
                      : `Aucun dossier dans la section « ${sec.label} ».`}
                  </p>
                  {q && (
                    <button onClick={() => setDossierSearch('')} style={{
                      marginTop: 12, background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 4, color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 10,
                      padding: '6px 14px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>Effacer la recherche</button>
                  )}
                </div>
              )
              return list.map(app => {
                const score = getCompleteness(app)
                return (
                  <button key={app.id} onClick={() => { setSelectedApp(app); setAppNote(''); setAppAdminNote(''); setActiveAction(null); setAdminNoteInput('') }}
                    style={{
                      ...CARD, display: 'flex', flexDirection: 'column', gap: 8,
                      padding: 14, cursor: 'pointer', width: '100%', textAlign: 'left',
                      borderColor: sectionColor + '33',
                    }}>
                    {/* Row 1: avatar + name + type + completeness */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                        background: sectionColor + '14', border: `1px solid ${sectionColor}33`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: sectionColor,
                      }}>
                        {(app.formData?.nomCommercial || app.name)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: FONTS.display, fontWeight: 400, fontSize: 15, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {app.formData?.nomCommercial || app.name}
                        </p>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '1px 0 0' }}>
                          {app.type === 'organisateur' ? '🎪 Organisateur' : `🎤 Prestataire · ${app.formData?.prestataireType || ''}`}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: score >= 80 ? COLORS.teal : score >= 50 ? COLORS.gold : COLORS.pink, fontWeight: 700 }}>{score}%</span>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '1px 0 0' }}>complétude</p>
                      </div>
                    </div>
                    {/* Row 2: email + date */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim }}>{app.email}</span>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim }}>
                        {app.submittedAt ? `Soumis le ${new Date(app.submittedAt).toLocaleDateString('fr-FR')}` : `Créé le ${new Date(app.createdAt).toLocaleDateString('fr-FR')}`}
                      </span>
                    </div>
                    {/* Row 3: correction note if needs_changes */}
                    {app.status === 'needs_changes' && app.requestedChanges && (
                      <div style={{ padding: '7px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.25)' }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#f59e0b', margin: 0, lineHeight: 1.5 }}>
                          ⚠ {app.requestedChanges}
                        </p>
                      </div>
                    )}
                    {/* completeness bar */}
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${score}%`, borderRadius: 99, background: score >= 80 ? COLORS.teal : score >= 50 ? COLORS.gold : COLORS.pink }} />
                    </div>
                  </button>
                )
              })
            })()}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          USER DETAIL SLIDE-UP
      ══════════════════════════════════════════════ */}
      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(6px)' }} onClick={() => setSelectedUser(null)} />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 520,
            background: 'rgba(8,10,20,0.97)', backdropFilter: 'blur(28px)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '16px 16px 0 0',
            maxHeight: '85vh', overflowY: 'auto',
            paddingBottom: 32,
          }}>
            {/* Handle + header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              position: 'sticky', top: 0,
              background: 'rgba(8,10,20,0.97)', zIndex: 10,
            }}>
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, margin: '0 auto 14px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: FONTS.mono, fontSize: 18, fontWeight: 700, color: COLORS.teal,
                }}>
                  {getDisplayName(selectedUser)?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: FONTS.display, fontWeight: 400, fontSize: 19, color: '#fff', margin: 0 }}>{getDisplayName(selectedUser)}</p>
                  {(selectedUser.role === 'organisateur' || selectedUser.role === 'prestataire') && getDisplayName(selectedUser) !== selectedUser.name && (
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '1px 0 0' }}>{selectedUser.name}</p>
                  )}
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '2px 0 0' }}>{selectedUser.email}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <RoleBadge role={selectedUser.role} />
                  <StatusBadge status={selectedUser.status} />
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Info */}
              <Section title="Informations">
                <InfoRow label="UID" value={selectedUser.uid} mono />
                <InfoRow label="Email" value={selectedUser.email} />
                <InfoRow label="Téléphone" value={selectedUser.phone || '—'} />
                <InfoRow label="Inscrit le" value={formatDate(selectedUser.createdAt)} />
                {selectedUser.prestataireType && (
                  <InfoRow label="Type" value={PRESTATAIRE_TYPES.find(t => t.key === selectedUser.prestataireType)?.label || selectedUser.prestataireType} />
                )}
              </Section>

              {/* Edit fields */}
              <Section title="Modifier">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { field: 'name',  label: 'Nom', type: 'text' },
                    { field: 'email', label: 'Email', type: 'email' },
                    { field: 'phone', label: 'Téléphone', type: 'tel' },
                  ].map(f => (
                    <div key={f.field}>
                      {editField?.field === f.field && editField.uid === selectedUser.uid ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            style={{ ...inputStyle, flex: 1 }}
                            type={f.type} value={editField.value}
                            onChange={e => setEditField(ef => ({ ...ef, value: e.target.value }))}
                          />
                          <button onClick={handleSaveEdit} style={{
                            padding: '0 12px', borderRadius: 4, cursor: 'pointer',
                            background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))',
                            border: '1px solid rgba(78,232,200,0.35)', color: COLORS.teal,
                            fontFamily: FONTS.mono, fontSize: 12,
                          }}>✓</button>
                          <button onClick={() => setEditField(null)} style={{
                            padding: '0 12px', borderRadius: 4, cursor: 'pointer',
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                            color: COLORS.dim, fontFamily: FONTS.mono, fontSize: 12,
                          }}>✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditField({ uid: selectedUser.uid, field: f.field, value: selectedUser[f.field] || '' })}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '9px 12px', borderRadius: 6, cursor: 'pointer',
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                            textAlign: 'left',
                          }}>
                          <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>{f.label}</span>
                          <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted }}>
                            {selectedUser[f.field] || '—'}
                            <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 6 }}>✏</span>
                          </span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {/* Wallet */}
              <Section title="Portefeuille">
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', ...CARD,
                }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.muted }}>Solde actuel</span>
                  <span style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 22, color: COLORS.gold }}>
                    {getBalance(selectedUser.uid)}€
                  </span>
                </div>
                {balanceAdjust.uid === selectedUser.uid ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <input
                      style={inputStyle} type="number"
                      placeholder="Montant (négatif pour déduire)"
                      value={balanceAdjust.amount}
                      onChange={e => setBalanceAdjust(b => ({ ...b, amount: e.target.value }))}
                    />
                    <input
                      style={inputStyle}
                      placeholder="Raison (ex: remboursement, bonus)"
                      value={balanceAdjust.reason}
                      onChange={e => setBalanceAdjust(b => ({ ...b, reason: e.target.value }))}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleBalanceAdjust} style={{
                        flex: 1, padding: '9px 0', borderRadius: 4, cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                        border: '1px solid rgba(200,169,110,0.45)', color: COLORS.gold,
                        fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>Appliquer</button>
                      <button onClick={() => setBalanceAdjust({ uid: null, amount: '', reason: '' })} style={{
                        padding: '9px 16px', borderRadius: 4, cursor: 'pointer',
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                        color: COLORS.dim, fontFamily: FONTS.mono, fontSize: 11, textTransform: 'uppercase',
                      }}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setBalanceAdjust(b => ({ ...b, uid: selectedUser.uid }))}
                    style={{
                      width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 4, cursor: 'pointer',
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.10)',
                      color: COLORS.dim, fontFamily: FONTS.mono, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      transition: 'border-color 0.2s, color 0.2s',
                    }}>
                    Ajuster le solde
                  </button>
                )}
              </Section>

              {/* Password */}
              <Section title="Mot de passe">
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', ...CARD,
                }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.muted }}>Générer un nouveau mdp</span>
                  <button
                    onClick={async () => {
                      const newPwd = 'LIB' + Math.random().toString(36).slice(2, 8).toUpperCase()
                      // Local-auth mode: store in localStorage
                      updateAccount(selectedUser.uid, { password: newPwd })
                      // Firebase Auth mode: send a password reset email (Firebase doesn't allow
                      // setting passwords directly from client SDK without re-auth)
                      try {
                        const { USE_REAL_FIREBASE, auth } = await import('../firebase')
                        if (USE_REAL_FIREBASE && selectedUser.email) {
                          const { sendPasswordResetEmail } = await import('firebase/auth')
                          await sendPasswordResetEmail(auth, selectedUser.email)
                          showToast(`Lien de réinitialisation envoyé à ${selectedUser.email}`)
                        } else {
                          showToast(`Nouveau mdp (local) : ${newPwd}`)
                        }
                      } catch {
                        showToast(`Nouveau mdp : ${newPwd}`)
                      }
                      refresh()
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: FONTS.mono, fontSize: 11, color: COLORS.gold,
                      textDecoration: 'underline',
                    }}>
                    Réinitialiser →
                  </button>
                </div>
                <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: 'rgba(255,255,255,0.18)', marginTop: 6 }}>
                  Le nouveau mot de passe s'affichera dans la notification.
                </p>
              </Section>

              {/* Account actions */}
              <Section title="Actions compte">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedUser.status === 'banned' ? (
                    <button onClick={() => handleReactivate(selectedUser.uid)} style={{
                      width: '100%', padding: '11px 0', borderRadius: 4, cursor: 'pointer',
                      background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.30)',
                      color: COLORS.teal, fontFamily: FONTS.mono, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      Réactiver le compte
                    </button>
                  ) : selectedUser.status === 'active' ? (
                    <button onClick={() => setConfirmAction({ type: 'ban', uid: selectedUser.uid, name: selectedUser.name })} style={{
                      width: '100%', padding: '11px 0', borderRadius: 4, cursor: 'pointer',
                      background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.30)',
                      color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      Suspendre le compte
                    </button>
                  ) : null}
                  <button onClick={() => setConfirmAction({ type: 'delete', uid: selectedUser.uid, name: selectedUser.name })} style={{
                    width: '100%', padding: '11px 0', borderRadius: 4, cursor: 'pointer',
                    background: 'rgba(220,50,50,0.10)', border: '1px solid rgba(220,50,50,0.35)',
                    color: 'rgba(220,100,100,0.9)', fontFamily: FONTS.mono, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    Supprimer le compte
                  </button>
                </div>
              </Section>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          DOSSIER DETAIL SLIDE-UP
      ══════════════════════════════════════════════ */}
      {selectedApp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(6px)' }} onClick={() => setSelectedApp(null)} />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 520,
            background: 'rgba(8,10,20,0.97)', backdropFilter: 'blur(28px)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '16px 16px 0 0',
            maxHeight: '88vh', overflowY: 'auto',
            paddingBottom: 32,
          }}>
            {/* Handle */}
            <div style={{
              padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              position: 'sticky', top: 0, background: 'rgba(8,10,20,0.97)', zIndex: 10,
            }}>
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONTS.display, fontWeight: 400, fontSize: 18, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedApp.formData?.nomCommercial || selectedApp.name}
                  </p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '2px 0 0' }}>
                    {selectedApp.email} · {selectedApp.type}
                  </p>
                </div>
                {(() => {
                  const cfg = APPLICATION_STATUSES[selectedApp.status] || {}
                  return (
                    <span style={{
                      fontFamily: FONTS.mono, fontSize: 9, padding: '3px 8px', borderRadius: 4,
                      border: `1px solid ${cfg.color || COLORS.dim}44`,
                      background: cfg.bg || 'transparent',
                      color: cfg.color || COLORS.dim,
                      textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, flexShrink: 0,
                    }}>{cfg.label || selectedApp.status}</span>
                  )
                })()}
              </div>
            </div>

            <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Completeness */}
              {(() => {
                const score = getCompleteness(selectedApp)
                const color = score >= 80 ? COLORS.teal : score >= 50 ? COLORS.gold : COLORS.pink
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>Complétude</span>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, color }}>{score}%</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 99, width: `${score}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
                    </div>
                  </div>
                )
              })()}

              {/* Message du candidat */}
              {selectedApp.candidateNote && (
                <Section title="Message du candidat">
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.22)',
                    borderRadius: 8,
                  }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#a78bfa', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {selectedApp.status === 'resubmitted' ? '↩ Message joint à la re-soumission' : '✉ Message joint à la soumission'}
                    </p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                      "{selectedApp.candidateNote}"
                    </p>
                  </div>
                </Section>
              )}

              {/* Form data summary */}
              <Section title="Informations formulaire">
                {(() => {
                  const fd = selectedApp.formData || {}
                  const type = selectedApp.type
                  const pt = fd.prestataireType

                  const FR = ({ label, value, href, mono }) => !value ? null : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, flexShrink: 0, minWidth: 120, paddingTop: 1 }}>{label}</span>
                      {href
                        ? <a href={href} target="_blank" rel="noreferrer" style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.teal, wordBreak: 'break-all', flex: 1 }}>{value}</a>
                        : <span style={{ fontFamily: mono === false ? FONTS.display : FONTS.mono, fontSize: 10, color: COLORS.muted, wordBreak: 'break-all', flex: 1, lineHeight: 1.5 }}>{value}</span>
                      }
                    </div>
                  )

                  const Sub = ({ title }) => (
                    <p style={{ fontFamily: FONTS.mono, fontSize: 8, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.15)', margin: '12px 0 6px', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {title}
                    </p>
                  )

                  const TARIF_TYPES = { soiree: 'Par soirée / événement', heure: 'Par heure', journee: 'Par journée', forfait: 'Au forfait', personne: 'Par personne' }
                  const EXP_LABELS = { moins_1: '< 1 an', '1_3': '1–3 ans', '3_5': '3–5 ans', '5_10': '5–10 ans', plus_10: '> 10 ans' }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {/* Common fields */}
                      {type === 'prestataire' && pt && (
                        <FR label="Type prestataire" value={
                          PRESTATAIRE_TYPES.find(t => t.key === pt) ? `${PRESTATAIRE_TYPES.find(t => t.key === pt).icon || ''} ${PRESTATAIRE_TYPES.find(t => t.key === pt).label}` : pt
                        } />
                      )}
                      <FR label="Nom commercial" value={fd.nomCommercial} />
                      {type === 'prestataire' && pt === 'artiste' && fd.nomScene && (
                        <FR label="Nom de scène" value={fd.nomScene} />
                      )}
                      <FR label="SIRET" value={fd.siret} />
                      <FR label="Email pro" value={fd.emailPro} />
                      <FR label="Tél. pro" value={fd.telephoneProCode ? `${fd.telephoneProCode} ${fd.telephonePro}` : fd.telephonePro} />
                      <FR label="Responsable" value={[fd.responsablePrenom, fd.responsableNom, fd.responsableFonction].filter(Boolean).join(' ')} />
                      <FR label="Ville" value={[fd.ville, fd.pays].filter(Boolean).join(', ')} />
                      <FR label="Zone d'intervention" value={fd.zoneIntervention} />
                      <FR label="Description" value={fd.description} />

                      {/* ── Artiste ── */}
                      {pt === 'artiste' && (
                        <>
                          <Sub title="Artiste" />
                          <FR label="Styles" value={fd.styles} />
                          <FR label="Expérience" value={EXP_LABELS[fd.anneesExperience] || fd.anneesExperience} />
                          <FR label="Statut facturation" value={fd.statutFacturation} />
                          <FR label="Portfolio" value={fd.portfolio} href={fd.portfolio?.startsWith('http') ? fd.portfolio : undefined} />
                          <FR label="Instagram" value={fd.instagram} />
                          {fd.besoinstechniques && <FR label="Rider technique" value={fd.besoinstechniques} />}
                        </>
                      )}

                      {/* ── Salle ── */}
                      {pt === 'salle' && (
                        <>
                          <Sub title="Lieu" />
                          <FR label="Adresse" value={fd.adresseLieu} />
                          <FR label="Capacité" value={fd.capaciteLieu ? `${fd.capaciteLieu} pers.` : null} />
                          <FR label="Type de lieu" value={fd.typeLieu} />
                          <FR label="Équipements" value={fd.equipements} />
                          <FR label="Horaires autorisés" value={fd.horairesAutorises} />
                          {fd.reglesDuLieu && <FR label="Règles" value={fd.reglesDuLieu} />}
                        </>
                      )}

                      {/* ── Matériel ── */}
                      {pt === 'materiel' && (
                        <>
                          <Sub title="Matériel" />
                          <FR label="Catégories" value={fd.categoriesMateriel} />
                          {fd.inventaire && <FR label="Inventaire" value={fd.inventaire} />}
                          <FR label="Conditions location" value={fd.conditionsLocation} />
                          <FR label="Politique caution" value={fd.politiqueCaution} />
                        </>
                      )}

                      {/* ── Food ── */}
                      {pt === 'food' && (
                        <>
                          <Sub title="Food / Boissons" />
                          <FR label="Type activité" value={fd.typeActiviteFood} />
                          {fd.menuBase && <FR label="Menu / Carte" value={fd.menuBase} />}
                          <FR label="Alcool" value={fd.alcoolFood ? '⚠️ Oui — vérifier licence alcool' : 'Non'} />
                        </>
                      )}

                      {/* ── Tarifs (prestataires uniquement) ── */}
                      {type === 'prestataire' && (fd.tarifDevis || fd.tarifMin || fd.tarifMax) && (
                        <>
                          <Sub title="Tarifs" />
                          {fd.tarifDevis
                            ? <FR label="Tarification" value="Sur devis uniquement" />
                            : <>
                                <FR label="Fourchette" value={fd.tarifMin || fd.tarifMax ? `${fd.tarifMin || '—'}€ – ${fd.tarifMax || '—'}€` : null} />
                                <FR label="Type" value={TARIF_TYPES[fd.tarifType] || fd.tarifType} />
                              </>
                          }
                        </>
                      )}
                    </div>
                  )
                })()}
              </Section>

              {/* Documents */}
              <Section title="Documents déposés">
                {Object.keys(selectedApp.documents || {}).length === 0 ? (
                  <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim }}>Aucun document</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(selectedApp.documents || {}).map(([key, val]) => {
                      const files = Array.isArray(val) ? val : (val ? [val] : [])
                      return files.map((entry, i) => (
                        <div key={`${key}-${i}`} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 12px', borderRadius: 7,
                          background: 'rgba(78,232,200,0.04)',
                          border: '1px solid rgba(78,232,200,0.15)',
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#fff', margin: 0 }}>{DOCUMENT_LABELS[key]?.label || key}</p>
                            <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.name}{entry.size ? ` · ${Math.round(entry.size / 1024)}ko` : ''}
                            </p>
                          </div>
                          {entry.url ? (
                            <a href={entry.url} target="_blank" rel="noreferrer"
                              style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.teal, textDecoration: 'none', padding: '4px 8px', border: '1px solid rgba(78,232,200,0.25)', borderRadius: 4 }}>
                              Voir →
                            </a>
                          ) : (
                            <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim }}>Local</span>
                          )}
                        </div>
                      ))
                    })}
                  </div>
                )}
              </Section>

              {/* Previous messages sent to candidate */}
              {(selectedApp.requestedChanges || selectedApp.rejectionReason) && (
                <Section title="Dernier message envoyé">
                  <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>
                      {selectedApp.requestedChanges || selectedApp.rejectionReason}
                    </p>
                  </div>
                </Section>
              )}

              {/* Notes internes — liste à faire (admin only) */}
              {(() => {
                // Normalize: support old string adminNote + new adminNotes array
                const rawNotes = selectedApp.adminNotes || []
                const legacyNote = (selectedApp.adminNote && rawNotes.length === 0) ? selectedApp.adminNote : null
                const notes = legacyNote
                  ? [{ id: 'legacy', text: legacyNote, done: false, createdAt: selectedApp.updatedAt || Date.now() }]
                  : rawNotes

                async function saveNotes(updated) {
                  try {
                    const { updateApplication } = await import('../utils/applications')
                    updateApplication(selectedApp.id, { adminNotes: updated, adminNote: '' })
                    setSelectedApp(a => a ? { ...a, adminNotes: updated, adminNote: '' } : null)
                    const { USE_REAL_FIREBASE, db } = await import('../firebase')
                    if (USE_REAL_FIREBASE) {
                      const { doc, setDoc } = await import('firebase/firestore')
                      setDoc(doc(db, 'applications', selectedApp.id), { adminNotes: updated, adminNote: '' }, { merge: true }).catch(() => {})
                    }
                  } catch {}
                }

                async function addNote() {
                  const text = adminNoteInput.trim()
                  if (!text) return
                  const newNote = { id: Date.now().toString(), text, done: false, createdAt: Date.now() }
                  // Merge into a single saveNotes call to avoid stale-closure race
                  const filtered = notes.filter(n => n.id !== 'legacy')
                  const withLegacy = legacyNote
                    ? [{ id: 'legacy-' + Date.now(), text: legacyNote, done: false, createdAt: selectedApp.updatedAt || Date.now() }, ...filtered]
                    : filtered
                  await saveNotes([...withLegacy, newNote])
                  setAdminNoteInput('')
                  showToast('Note ajoutée')
                }

                async function toggleNote(id) {
                  const updated = notes.map(n => n.id === id ? { ...n, done: !n.done } : n)
                  await saveNotes(updated)
                }

                async function deleteNote(id) {
                  const updated = notes.filter(n => n.id !== id)
                  await saveNotes(updated)
                }

                const doneCount = notes.filter(n => n.done).length
                return (
                  <Section title={`Notes internes${notes.length > 0 ? ` (${doneCount}/${notes.length})` : ''}`}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '0 0 10px', lineHeight: 1.5 }}>
                      Privé — jamais visible par le candidat.
                    </p>

                    {/* Liste des notes */}
                    {notes.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {notes.map(note => (
                          <div key={note.id} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                            padding: '8px 10px',
                            background: note.done ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${note.done ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.10)'}`,
                            borderRadius: 6,
                          }}>
                            {/* Checkbox */}
                            <button
                              onClick={() => toggleNote(note.id)}
                              style={{
                                flexShrink: 0, width: 18, height: 18, borderRadius: 4, marginTop: 1,
                                border: `1.5px solid ${note.done ? COLORS.teal : 'rgba(255,255,255,0.25)'}`,
                                background: note.done ? COLORS.teal + '22' : 'transparent',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: COLORS.teal, fontSize: 11, lineHeight: 1,
                              }}>
                              {note.done ? '✓' : ''}
                            </button>
                            {/* Texte */}
                            <span style={{
                              flex: 1, fontFamily: FONTS.mono, fontSize: 10, lineHeight: 1.5,
                              color: note.done ? COLORS.dim : COLORS.muted,
                              textDecoration: note.done ? 'line-through' : 'none',
                            }}>{note.text}</span>
                            {/* Supprimer */}
                            <button
                              onClick={() => deleteNote(note.id)}
                              style={{
                                flexShrink: 0, background: 'none', border: 'none',
                                color: 'rgba(255,255,255,0.18)', cursor: 'pointer',
                                fontSize: 14, lineHeight: 1, padding: '1px 2px',
                              }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ajouter une note */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        value={adminNoteInput}
                        onChange={e => setAdminNoteInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addNote()}
                        placeholder="Ajouter une note..."
                        style={{
                          flex: 1, background: 'rgba(8,10,20,0.7)',
                          border: '1px solid rgba(255,255,255,0.10)',
                          borderRadius: 6, color: '#fff',
                          fontFamily: FONTS.mono, fontSize: 11,
                          padding: '8px 10px', outline: 'none',
                        }}
                      />
                      <button
                        onClick={addNote}
                        disabled={!adminNoteInput.trim()}
                        style={{
                          flexShrink: 0, padding: '8px 14px', borderRadius: 6, cursor: adminNoteInput.trim() ? 'pointer' : 'not-allowed',
                          background: adminNoteInput.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          color: adminNoteInput.trim() ? '#fff' : COLORS.dim,
                          fontFamily: FONTS.mono, fontSize: 16, lineHeight: 1,
                        }}>+</button>
                    </div>
                  </Section>
                )
              })()}

              {/* Action buttons — contextual inline forms */}
              {(selectedApp.status === 'submitted' || selectedApp.status === 'under_review' || selectedApp.status === 'resubmitted') && (
                <Section title="Actions">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                    {/* APPROUVER */}
                    <button
                      onClick={() => setActiveAction(a => a === 'approve' ? null : 'approve')}
                      style={{
                        width: '100%', padding: '11px 0', borderRadius: 5, cursor: 'pointer',
                        background: activeAction === 'approve'
                          ? 'linear-gradient(135deg, rgba(34,197,94,0.28), rgba(34,197,94,0.14))'
                          : 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))',
                        border: `1px solid ${activeAction === 'approve' ? 'rgba(34,197,94,0.6)' : 'rgba(34,197,94,0.35)'}`,
                        color: '#22c55e',
                        fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                      ✓ Approuver le dossier
                    </button>
                    {activeAction === 'approve' && (
                      <div style={{ padding: '12px 14px', background: 'rgba(34,197,94,0.05)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.18)', marginTop: -4 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#22c55e', margin: '0 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          Message d'approbation (optionnel)
                        </p>
                        <textarea
                          value={appNote}
                          onChange={e => setAppNote(e.target.value)}
                          placeholder="Félicitations ! Votre dossier a été approuvé. Bienvenue sur LIVEINBLACK..."
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            background: 'rgba(8,10,20,0.7)', border: '1px solid rgba(34,197,94,0.25)',
                            borderRadius: 6, color: '#fff', fontFamily: FONTS.mono, fontSize: 11,
                            padding: '9px 12px', outline: 'none', resize: 'vertical', minHeight: 64, lineHeight: 1.5,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => setActiveAction(null)} style={{
                            flex: 1, padding: '9px 0', borderRadius: 4, cursor: 'pointer',
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                            color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 10, textTransform: 'uppercase',
                          }}>Annuler</button>
                          <button onClick={() => handleAppAction(selectedApp.id, 'approved', appNote)} style={{
                            flex: 2, padding: '9px 0', borderRadius: 4, cursor: 'pointer',
                            background: 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(34,197,94,0.08))',
                            border: '1px solid rgba(34,197,94,0.45)', color: '#22c55e',
                            fontFamily: FONTS.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                          }}>✓ Confirmer l'approbation</button>
                        </div>
                      </div>
                    )}

                    {/* DEMANDER DES CORRECTIONS */}
                    <button
                      onClick={() => setActiveAction(a => a === 'changes' ? null : 'changes')}
                      style={{
                        width: '100%', padding: '11px 0', borderRadius: 5, cursor: 'pointer',
                        background: activeAction === 'changes' ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.10)',
                        border: `1px solid ${activeAction === 'changes' ? 'rgba(245,158,11,0.60)' : 'rgba(245,158,11,0.35)'}`,
                        color: '#f59e0b',
                        fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                      ⚠ Demander des corrections
                    </button>
                    {activeAction === 'changes' && (
                      <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.04)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.20)', marginTop: -4 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#f59e0b', margin: '0 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          Corrections requises *
                        </p>
                        <textarea
                          value={appNote}
                          onChange={e => setAppNote(e.target.value)}
                          placeholder="Ex: Merci de renvoyer une pièce d'identité valide, et de compléter la section activité..."
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            background: 'rgba(8,10,20,0.7)', border: '1px solid rgba(245,158,11,0.25)',
                            borderRadius: 6, color: '#fff', fontFamily: FONTS.mono, fontSize: 11,
                            padding: '9px 12px', outline: 'none', resize: 'vertical', minHeight: 80, lineHeight: 1.5,
                          }}
                        />
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '6px 0 8px', lineHeight: 1.5 }}>
                          Ce message sera visible par le candidat depuis son espace.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setActiveAction(null)} style={{
                            flex: 1, padding: '9px 0', borderRadius: 4, cursor: 'pointer',
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                            color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 10, textTransform: 'uppercase',
                          }}>Annuler</button>
                          <button
                            onClick={() => { if (appNote.trim()) handleAppAction(selectedApp.id, 'needs_changes', appNote) }}
                            disabled={!appNote.trim()}
                            style={{
                              flex: 2, padding: '9px 0', borderRadius: 4, cursor: appNote.trim() ? 'pointer' : 'not-allowed',
                              background: appNote.trim() ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.06)',
                              border: `1px solid ${appNote.trim() ? 'rgba(245,158,11,0.50)' : 'rgba(245,158,11,0.20)'}`,
                              color: appNote.trim() ? '#f59e0b' : 'rgba(245,158,11,0.40)',
                              fontFamily: FONTS.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                            }}>⚠ Envoyer les corrections</button>
                        </div>
                      </div>
                    )}

                    {/* PASSER EN RÉVISION (action directe) */}
                    {(selectedApp.status === 'submitted' || selectedApp.status === 'resubmitted') && (
                      <button
                        onClick={() => handleAppAction(selectedApp.id, 'under_review', appAdminNote)}
                        style={{
                          width: '100%', padding: '11px 0', borderRadius: 5, cursor: 'pointer',
                          background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.35)',
                          color: '#3b82f6',
                          fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                        → Passer en révision
                      </button>
                    )}

                    {/* REFUSER */}
                    <button
                      onClick={() => setActiveAction(a => a === 'reject' ? null : 'reject')}
                      style={{
                        width: '100%', padding: '11px 0', borderRadius: 5, cursor: 'pointer',
                        background: activeAction === 'reject' ? 'rgba(224,90,170,0.18)' : 'rgba(224,90,170,0.10)',
                        border: `1px solid ${activeAction === 'reject' ? 'rgba(224,90,170,0.60)' : 'rgba(224,90,170,0.35)'}`,
                        color: COLORS.pink,
                        fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                      ✕ Refuser le dossier
                    </button>
                    {activeAction === 'reject' && (
                      <div style={{ padding: '12px 14px', background: 'rgba(224,90,170,0.04)', borderRadius: 8, border: '1px solid rgba(224,90,170,0.20)', marginTop: -4 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.pink, margin: '0 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          Motif de refus (optionnel)
                        </p>
                        <textarea
                          value={appNote}
                          onChange={e => setAppNote(e.target.value)}
                          placeholder="Ex: Le dossier ne correspond pas aux critères d'éligibilité..."
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            background: 'rgba(8,10,20,0.7)', border: '1px solid rgba(224,90,170,0.25)',
                            borderRadius: 6, color: '#fff', fontFamily: FONTS.mono, fontSize: 11,
                            padding: '9px 12px', outline: 'none', resize: 'vertical', minHeight: 64, lineHeight: 1.5,
                          }}
                        />
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '6px 0 8px', lineHeight: 1.5 }}>
                          Ce motif sera visible par le candidat depuis son espace.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setActiveAction(null)} style={{
                            flex: 1, padding: '9px 0', borderRadius: 4, cursor: 'pointer',
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                            color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 10, textTransform: 'uppercase',
                          }}>Annuler</button>
                          <button onClick={() => handleAppAction(selectedApp.id, 'rejected', appNote)} style={{
                            flex: 2, padding: '9px 0', borderRadius: 4, cursor: 'pointer',
                            background: 'rgba(224,90,170,0.16)', border: '1px solid rgba(224,90,170,0.45)',
                            color: COLORS.pink, fontFamily: FONTS.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                          }}>✕ Confirmer le refus</button>
                        </div>
                      </div>
                    )}

                  </div>
                </Section>
              )}

              {selectedApp.status === 'needs_changes' && (
                <Section title="En attente de corrections">
                  <div style={{ padding: '12px', background: 'rgba(245,158,11,0.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)', marginBottom: 12 }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#f59e0b', margin: 0 }}>
                      Le candidat a été notifié des corrections à apporter. Le dossier repassera en "En attente" une fois resoumis.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveAction(a => a === 'reject' ? null : 'reject')}
                    style={{
                      width: '100%', padding: '11px 0', borderRadius: 5, cursor: 'pointer',
                      background: activeAction === 'reject' ? 'rgba(224,90,170,0.18)' : 'rgba(224,90,170,0.10)',
                      border: `1px solid ${activeAction === 'reject' ? 'rgba(224,90,170,0.60)' : 'rgba(224,90,170,0.35)'}`,
                      color: COLORS.pink,
                      fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                    ✕ Refuser définitivement
                  </button>
                  {activeAction === 'reject' && (
                    <div style={{ padding: '12px 14px', background: 'rgba(224,90,170,0.04)', borderRadius: 8, border: '1px solid rgba(224,90,170,0.20)', marginTop: 8 }}>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.pink, margin: '0 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Motif de refus (optionnel)
                      </p>
                      <textarea
                        value={appNote}
                        onChange={e => setAppNote(e.target.value)}
                        placeholder="Ex: Malgré les demandes de correction, le dossier ne satisfait pas les critères..."
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: 'rgba(8,10,20,0.7)', border: '1px solid rgba(224,90,170,0.25)',
                          borderRadius: 6, color: '#fff', fontFamily: FONTS.mono, fontSize: 11,
                          padding: '9px 12px', outline: 'none', resize: 'vertical', minHeight: 64, lineHeight: 1.5,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => setActiveAction(null)} style={{
                          flex: 1, padding: '9px 0', borderRadius: 4, cursor: 'pointer',
                          background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                          color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 10, textTransform: 'uppercase',
                        }}>Annuler</button>
                        <button onClick={() => handleAppAction(selectedApp.id, 'rejected', appNote)} style={{
                          flex: 2, padding: '9px 0', borderRadius: 4, cursor: 'pointer',
                          background: 'rgba(224,90,170,0.16)', border: '1px solid rgba(224,90,170,0.45)',
                          color: COLORS.pink, fontFamily: FONTS.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>✕ Confirmer le refus</button>
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {selectedApp.status === 'approved' && (
                <Section title="Actions">
                  <button
                    onClick={() => setConfirmAction({ type: 'appSuspend', appId: selectedApp.id, name: selectedApp.formData?.nomCommercial || selectedApp.name })}
                    style={{
                      width: '100%', padding: '11px 0', borderRadius: 5, cursor: 'pointer',
                      background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)',
                      color: '#ef4444',
                      fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                    Suspendre le compte
                  </button>
                </Section>
              )}

              {selectedApp.status === 'suspended' && (
                <Section title="Actions">
                  <button
                    onClick={() => handleAppAction(selectedApp.id, 'approved', appAdminNote)}
                    style={{
                      width: '100%', padding: '11px 0', borderRadius: 5, cursor: 'pointer',
                      background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))',
                      border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e',
                      fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                    Réactiver le dossier
                  </button>
                </Section>
              )}

              {/* Audit log */}
              {selectedApp.auditLog?.length > 0 && (
                <Section title="Historique">
                  {(() => {
                    // Extended label map for actions not in APPLICATION_STATUSES
                    const EXTRA_LABELS = {
                      created:   { label: 'Dossier créé',       color: 'rgba(255,255,255,0.30)' },
                      submitted: { label: 'Soumis',             color: '#4ee8c8' },
                      resubmitted: { label: 'Re-soumis',        color: '#4ee8c8' },
                    }
                    const reversed = [...selectedApp.auditLog].reverse()
                    // Determine if a note is "system text" (auto-generated) vs a real admin message
                    const AUTO_NOTES = ['Dossier créé', 'Dossier soumis pour validation', 'Dossier re-soumis']
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {reversed.map((entry, i) => {
                          const cfg = APPLICATION_STATUSES[entry.action] || EXTRA_LABELS[entry.action]
                          const color = cfg?.color || COLORS.dim
                          const isLast = i === reversed.length - 1
                          const isAdminNote = entry.note && !AUTO_NOTES.includes(entry.note)
                          const authorLabel = entry.byName || (entry.action === 'created' ? 'Système' : '—')
                          return (
                            <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: isLast ? 0 : 14, position: 'relative' }}>
                              {!isLast && (
                                <div style={{ position: 'absolute', left: 10, top: 20, bottom: 0, width: 1, background: 'rgba(255,255,255,0.06)' }} />
                              )}
                              <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: `1px solid ${color}44`, background: color + '14', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#fff', margin: '1px 0 2px', fontWeight: 600 }}>
                                  {cfg?.label || entry.action}
                                </p>
                                {/* Auto note (system text) — dim */}
                                {entry.note && !isAdminNote && (
                                  <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '0 0 2px', fontStyle: 'italic', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{entry.note}</p>
                                )}
                                {/* Admin message — highlighted */}
                                {isAdminNote && (
                                  <div style={{ padding: '5px 8px', background: color + '0d', border: `1px solid ${color}22`, borderRadius: 4, marginBottom: 4 }}>
                                    <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: color, margin: 0, lineHeight: 1.5, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>"{entry.note}"</p>
                                  </div>
                                )}
                                <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: 0 }}>
                                  {authorLabel} · {new Date(entry.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </Section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Dialog ── */}
      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.90)' }} onClick={() => setConfirmAction(null)} />
          <div style={{
            position: 'relative', ...CARD, padding: 24, width: '100%', maxWidth: 320,
            display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center',
          }}>
            {/* Icon */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {(confirmAction.type === 'approve' || confirmAction.type === 'approveRole' || confirmAction.type === 'appApprove') && (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {confirmAction.type === 'appChanges' && (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              )}
              {(confirmAction.type === 'reject' || confirmAction.type === 'rejectRole' || confirmAction.type === 'appReject' || confirmAction.type === 'appSuspend') && (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {confirmAction.type === 'ban' && (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
              {confirmAction.type === 'delete' && (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(220,100,100,0.9)" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              )}
            </div>

            <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 17, color: '#fff', margin: 0 }}>
              {confirmAction.type === 'approve'     && `Valider le compte de ${confirmAction.name} ?`}
              {confirmAction.type === 'reject'      && `Refuser le compte de ${confirmAction.name} ?`}
              {confirmAction.type === 'ban'         && `Suspendre le compte de ${confirmAction.name} ?`}
              {confirmAction.type === 'delete'      && `Supprimer définitivement le compte de ${confirmAction.name} ?`}
              {confirmAction.type === 'approveRole' && `Activer l\u2019espace ${confirmAction.role} pour ${confirmAction.name} ?`}
              {confirmAction.type === 'rejectRole'  && `Refuser la demande ${confirmAction.role} de ${confirmAction.name} ?`}
              {confirmAction.type === 'appApprove'  && `Approuver le dossier de ${confirmAction.name} ?`}
              {confirmAction.type === 'appChanges'  && `Demander des corrections pour le dossier de ${confirmAction.name} ?`}
              {confirmAction.type === 'appReject'   && `Refuser le dossier de ${confirmAction.name} ?`}
              {confirmAction.type === 'appSuspend'  && `Suspendre le dossier de ${confirmAction.name} ?`}
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmAction(null)} style={{
                flex: 1, padding: '10px 0', borderRadius: 4, cursor: 'pointer',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 11, textTransform: 'uppercase',
              }}>Annuler</button>
              <button
                onClick={() => {
                  if (confirmAction.type === 'approve')     handleApprove(confirmAction.uid)
                  if (confirmAction.type === 'reject')      handleReject(confirmAction.uid)
                  if (confirmAction.type === 'ban')         handleBan(confirmAction.uid)
                  if (confirmAction.type === 'delete')      handleDelete(confirmAction.uid)
                  if (confirmAction.type === 'approveRole') handleApproveRoleRequest(confirmAction.id)
                  if (confirmAction.type === 'rejectRole')  handleRejectRoleRequest(confirmAction.id)
                  if (confirmAction.type === 'appApprove')  handleAppAction(confirmAction.appId, 'approved', appNote)
                  if (confirmAction.type === 'appChanges')  handleAppAction(confirmAction.appId, 'needs_changes', appNote)
                  if (confirmAction.type === 'appReject')   handleAppAction(confirmAction.appId, 'rejected', appNote)
                  if (confirmAction.type === 'appSuspend')  handleAppAction(confirmAction.appId, 'suspended', appNote)
                }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 4, cursor: 'pointer',
                  fontFamily: FONTS.mono, fontSize: 11, textTransform: 'uppercase',
                  ...((confirmAction.type === 'approve' || confirmAction.type === 'approveRole' || confirmAction.type === 'appApprove')
                    ? { background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))', border: '1px solid rgba(78,232,200,0.35)', color: COLORS.teal }
                    : confirmAction.type === 'appChanges'
                    ? { background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.40)', color: '#f59e0b' }
                    : { background: 'rgba(220,50,50,0.14)', border: '1px solid rgba(220,50,50,0.40)', color: 'rgba(220,100,100,0.9)' }
                  ),
                }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          SUPPRESSIONS
      ══════════════════════════════════════════════ */}
      {tab === 'suppressions' && (
        <div style={{ padding: '16px 16px 40px', maxWidth: 520, margin: '0 auto' }}>
          <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 16px' }}>
            Demandes de suppression de compte
          </p>

          {deletionRequests.length === 0 ? (
            <div style={{ ...CARD, padding: 32, textAlign: 'center' }}>
              <p style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 300, color: COLORS.muted, margin: 0 }}>
                Aucune demande en attente
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {deletionRequests.map(req => (
                <div key={req.id} style={{
                  ...CARD, padding: 18,
                  borderColor: 'rgba(239,68,68,0.28)',
                  background: 'rgba(239,68,68,0.04)',
                }}>
                  {/* En-tête */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                    <div>
                      <p style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 300, color: '#fff', margin: '0 0 2px' }}>
                        {req.userName}
                      </p>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: 0 }}>
                        {req.userEmail} · {req.applicationType || req.userRole}
                      </p>
                    </div>
                    <span style={{
                      padding: '3px 9px', borderRadius: 4, flexShrink: 0,
                      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                      fontFamily: FONTS.mono, fontSize: 9, color: '#ef4444',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      En attente
                    </span>
                  </div>

                  {/* Date */}
                  <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '0 0 10px' }}>
                    Demandé le {new Date(req.requestedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>

                  {/* Raison */}
                  <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 12 }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
                      Raison invoquée
                    </p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                      {req.reason || '—'}
                    </p>
                  </div>

                  {/* Audit — blockers */}
                  {req.audit?.blockers?.length > 0 && (
                    <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 6, marginBottom: 10 }}>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                        ⚠ Points signalés par le système
                      </p>
                      {req.audit.blockers.map((b, i) => (
                        <p key={i} style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'rgba(239,68,68,0.75)', margin: '0 0 3px', lineHeight: 1.5 }}>
                          • {b.label}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Audit — warnings */}
                  {req.audit?.warnings?.length > 0 && (
                    <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 6, marginBottom: 10 }}>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                        ℹ Éléments à archiver
                      </p>
                      {req.audit.warnings.map((w, i) => (
                        <p key={i} style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'rgba(245,158,11,0.7)', margin: '0 0 3px', lineHeight: 1.5 }}>
                          • {w.label}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Note admin */}
                  <label style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
                    Note pour l&apos;utilisateur (optionnel)
                  </label>
                  <textarea
                    placeholder="Ex : demande refusée car événement en cours…"
                    rows={2}
                    value={delResNote}
                    onChange={e => setDelResNote(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'rgba(6,8,16,0.7)', border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 5, padding: '8px 10px', resize: 'vertical',
                      fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.75)',
                      lineHeight: 1.6, outline: 'none', marginBottom: 12,
                    }}
                  />

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={async () => {
                        await resolveDeletionRequest(req.id, 'approved', user.uid, user.name || 'Admin', delResNote)
                        setDeletionRequests(getAllDeletionRequests())
                        setDelResNote('')
                        showToast('Suppression approuvée — compte anonymisé.')
                      }}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 6, cursor: 'pointer',
                        background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.40)',
                        color: '#ef4444', fontFamily: FONTS.mono, fontSize: 10,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                      ✓ Approuver
                    </button>
                    <button
                      onClick={async () => {
                        await resolveDeletionRequest(req.id, 'rejected', user.uid, user.name || 'Admin', delResNote)
                        setDeletionRequests(getAllDeletionRequests())
                        setDelResNote('')
                        showToast('Demande refusée.')
                      }}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 6, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 10,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                      ✕ Refuser
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 70, padding: '11px 20px', borderRadius: 6,
          fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em',
          backdropFilter: 'blur(20px)',
          ...(toast.type === 'error'
            ? { background: 'rgba(220,50,50,0.16)', border: '1px solid rgba(220,50,50,0.40)', color: 'rgba(220,100,100,0.95)' }
            : { background: 'rgba(78,232,200,0.14)', border: '1px solid rgba(78,232,200,0.40)', color: COLORS.teal }
          ),
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────
const FONTS_SUB = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
}

function Section({ title, children }) {
  return (
    <div>
      <p style={{
        fontFamily: FONTS_SUB.mono, fontSize: 9, color: 'rgba(255,255,255,0.25)',
        textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10,
      }}>{title}</p>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontFamily: FONTS_SUB.mono, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{label}</span>
      <span style={{
        fontFamily: mono ? FONTS_SUB.mono : FONTS_SUB.display,
        fontWeight: mono ? 400 : 300,
        fontSize: mono ? 10 : 13,
        color: 'rgba(255,255,255,0.72)',
        maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        letterSpacing: mono ? '0.04em' : 0,
      }}>{value}</span>
    </div>
  )
}
