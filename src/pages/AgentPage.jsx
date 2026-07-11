import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getAllAccounts, updateAccount, deleteAccount,
  getPendingValidations, approveValidation, rejectValidation,
  getPendingRoleRequests, approveRoleRequest, rejectRoleRequest,
  ROLES,
} from '../utils/accounts'
// Wallet supprimé : les paiements passent désormais par Stripe
import {
  getAllApplications, updateApplicationStatus,
  APPLICATION_STATUSES, getCompleteness, DOCUMENT_LABELS,
} from '../utils/applications'
import {
  getAllDeletionRequests,
  fetchDeletionRequestsFromFirestore,
  resolveDeletionRequest,
} from '../utils/accountDeletion'
// Source unique des taux (mêmes valeurs que le back-end api/checkout.js)
import { computeTicketFeeCents, computeTicketFeeXOF } from '../../lib/fees.js'
import { getProviderCategories, getProviderTypes } from '../utils/providerCategories'
import { IconCheck, IconEdit } from '../components/icons'
import AdminReviewsPanel from '../components/AdminReviewsPanel'
import ActualiteAdminPanel from '../components/ActualiteAdminPanel'

const ADMIN_EMAIL = 'hagechady4@gmail.com'

// ─── Protect: only agents can access ──────────────────────────────────────
function useAgentGuard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // Agent = rôle 'agent' sous N'IMPORTE QUELLE forme (aligné sur le garde serveur
  // isAgentCaller). switchActiveRole réécrit `role` quand l'admin change
  // d'interface : le limiter à `role` éjectait l'admin de son panneau (audit #18).
  const isAgentUser = !!user && (
    user.role === 'agent' || user.activeRole === 'agent' ||
    (Array.isArray(user.enabledRoles) && user.enabledRoles.includes('agent'))
  )
  useEffect(() => {
    if (!isAgentUser) navigate('/')
  }, [user])
  return isAgentUser
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Design tokens ────────────────────────────────────────────────────────
const CARD = {
  background: '#0e0f16',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
}

// `mono` pointe désormais sur Inter : le token diffusait la typo mono
// « pixélisée » sur toute l'interface (badges, nav, inputs, méta). On garde le
// nom pour ne pas toucher 200 usages — seule la valeur change.
const FONTS = {
  display: "Inter, sans-serif",
  mono: 'Inter, sans-serif',
}

const COLORS = {
  teal: '#4ee8c8',
  pink: '#e05aaa',
  gold: '#c8a96e',
  muted: 'rgba(255,255,255,0.55)',
  dim: 'rgba(255,255,255,0.40)',
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
  const r = ROLES[role] || { label: role, icon: '', color: '#8b8f9c' }
  const size = small ? { fontSize: 11, padding: '2px 8px' } : { fontSize: 11, padding: '3px 9px' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      borderRadius: 8, border: `1px solid ${r.color}55`,
      background: r.color + '22', color: r.color,
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
    banned:   { label: 'BANNI',      color: '#8b8f9c' },
  }[status] || { label: String(status || 'incomplet').toUpperCase(), color: '#8b8f9c' }
  return (
    <span style={{
      fontFamily: FONTS.mono, fontSize: 11, padding: '2px 8px',
      borderRadius: 8, border: `1px solid ${cfg.color}55`,
      background: cfg.color + '22', color: cfg.color,
      fontWeight: 700, letterSpacing: '0.04em',
    }}>
      {cfg.label}
    </span>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
// [retiré] resetAllData / LIB_KEYS : « reset total » orphelin (aucun bouton ne
// l'appelait) qui aurait supprimé la collection users ENTIÈRE — y compris le
// doc admin — côté client, sans jamais toucher Firebase Auth (emails verrouillés
// à vie). Une remise à zéro d'environnement doit passer par un script serveur.

export default function AgentPage() {
  const isAgent = useAgentGuard()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('dashboard')
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
  // [retiré] balanceAdjust : le wallet interne a été remplacé par Stripe

  // ── Events admin (tab 'events') ──
  const [allEvents, setAllEvents] = useState([])
  const [eventsSearch, setEventsSearch] = useState('')
  const [eventsFilter, setEventsFilter] = useState('all') // all | upcoming | past | cancelled

  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenEvents }) => {
      unsub = listenEvents(evts => setAllEvents(evts || []))
    }).catch(() => {})
    return () => unsub()
  }, [])
  const [toast, setToast] = useState(null)
  const [deletionRequests, setDeletionRequests] = useState([])
  // Notes admin de résolution — indexées PAR demande (un state unique partagé
  // attachait la note tapée pour B au dossier de A).
  const [delResNotes, setDelResNotes]           = useState({})
  const [serverBookings, setServerBookings]     = useState([])  // ventes RÉELLES (webhooks) — jamais lib_bookings (per-device)
  const [sellerBalances, setSellerBalances]     = useState([])  // soldes vendeurs à reverser (ledger)
  const [failedPayouts, setFailedPayouts]       = useState([])  // versements auto XOF en échec (event_payouts status='failed') = SEUL le filet manuel
  const [payoutRequests, setPayoutRequests]     = useState([])  // demandes de virement en attente
  const [reports, setReports]                   = useState([])  // signalements d'utilisateurs
  const [adminBoosts, setAdminBoosts]           = useState([])  // boosts vendus (webhook) — surveille aussi les conflits de créneau
  const [paymentAlerts, setPaymentAlerts]       = useState([])  // paiements à examiner manuellement
  const [eventRefunds, setEventRefunds]         = useState([])  // remboursements mobile money à traiter (#71)
  const [eventCancellations, setEventCancellations] = useState([]) // journal des annulations d'events
  const [refundBusy, setRefundBusy]             = useState('')   // id du remboursement en cours de validation

  function loadReports() {
    try { return JSON.parse(localStorage.getItem('lib_reports') || '[]').filter(r => !r.handled) } catch { return [] }
  }
  function refresh() {
    setAccounts(getAllAccounts())
    setPending(getPendingValidations())
    setRoleRequests(getPendingRoleRequests().filter(r => r.status === 'pending'))
    setApplications(getAllApplications())
    setDeletionRequests(getAllDeletionRequests())
    setReports(loadReports())
  }
  function resolveReport(id) {
    try {
      const all = JSON.parse(localStorage.getItem('lib_reports') || '[]')
      const i = all.findIndex(r => r.id === id)
      if (i !== -1) { all[i] = { ...all[i], handled: true, handledAt: new Date().toISOString() }; localStorage.setItem('lib_reports', JSON.stringify(all)) }
      import('../utils/firestore-sync').then(({ syncDoc }) => syncDoc(`reports/${id}`, { handled: true, handledAt: new Date().toISOString() })).catch(() => {})
      setReports(loadReports())
    } catch {}
  }

  // `docId` = _docId Firestore (les webhooks n'écrivent PAS de champ `id` dans
  // les docs payment_alerts — utiliser alert.id donnait payment_alerts/undefined
  // et la clôture échouait systématiquement).
  async function resolvePaymentAlert(docId) {
    const resolvedAt = new Date().toISOString()
    try {
      if (!docId) throw new Error('missing_doc_id')
      const { syncDocAwaitable } = await import('../utils/firestore-sync')
      const result = await syncDocAwaitable(`payment_alerts/${docId}`, {
        status: 'resolved', resolvedAt, resolvedBy: user?.uid || null,
      })
      if (!result.ok) throw new Error(result.error)
      setPaymentAlerts(items => items.filter(item => item._docId !== docId))
      showToast('Alerte financière clôturée')
    } catch {
      showToast("Impossible de clôturer l'alerte", 'error')
    }
  }

  // Marque un remboursement mobile money comme FAIT (l'agent l'a exécuté à la main
  // dans le dashboard FedaPay — pas d'API de remboursement côté FedaPay). #71
  async function markRefundDone(refund) {
    const docId = refund._docId || refund.id
    if (!docId) return
    setRefundBusy(docId)
    try {
      const { syncDocAwaitable } = await import('../utils/firestore-sync')
      const result = await syncDocAwaitable(`event_refunds/${docId}`, {
        status: 'refunded_manual', refundedManuallyAt: Date.now(), refundedBy: user?.uid || null,
      })
      if (!result.ok) throw new Error(result.error)
      setEventRefunds(items => items.filter(it => (it._docId || it.id) !== docId))
      showToast('Remboursement marqué comme effectué')
    } catch {
      showToast('Impossible de marquer le remboursement', 'error')
    }
    setRefundBusy('')
  }

  // Returns the org/business name for organisateurs & prestataires, personal name otherwise
  function getDisplayName(u) {
    if (u?.role === 'organisateur' || u?.role === 'prestataire') {
      const app = applications.find(a => a.uid === (u.uid || u.id))
      if (app?.formData?.nomCommercial) return app.formData.nomCommercial
    }
    return u?.name || '—'
  }

  // Sections dont la lecture Firestore a ÉCHOUÉ (permission, hors-ligne…).
  // Sans ça, un échec s'affichait comme « rien à traiter » — faux all-clear
  // dangereux sur des obligations financières (reversements, alertes).
  const [loadErrors, setLoadErrors] = useState([])

  useEffect(() => {
    refresh() // immediate local data
    // Then pull fresh data from Firestore
    async function fetchFromFirestore() {
      const errors = []
      try {
        const { loadCollectionStrict } = await import('../utils/firestore-sync')
        const { fetchApplicationsFromFirestore } = await import('../utils/applications')
        const [apps, pendingRes, usersRes] = await Promise.all([
          fetchApplicationsFromFirestore().catch(() => { errors.push('dossiers'); return null }),
          loadCollectionStrict('pending_validations'),
          loadCollectionStrict('users'),
        ])

        // ── Comptes : le snapshot Firestore EST la liste (pas de merge-union). ──
        // L'ancien merge additif gardait à vie les comptes supprimés ailleurs
        // (fantômes → stats fausses, faux « doublons » qui alimentaient des
        // suppressions de vrais comptes). On ne conserve en plus que les comptes
        // purement locaux (uid local-*, mode sans Firebase) et l'admin courant.
        if (usersRes.ok) {
          const serverAccounts = usersRes.items.filter(u => u.uid && (u.email || u.name))
          const serverUids = new Set(serverAccounts.map(u => u.uid))
          const localOnly = getAllAccounts().filter(a =>
            a.uid && String(a.uid).startsWith('local-') && !serverUids.has(a.uid)
          )
          const reconciled = [...serverAccounts, ...localOnly]
          try {
            const currentUser = JSON.parse(localStorage.getItem('lib_user') || 'null')
            if (currentUser?.uid && !reconciled.find(a => a.uid === currentUser.uid)) {
              reconciled.push(currentUser)
            }
          } catch {}
          localStorage.setItem('lib_registered_users', JSON.stringify(reconciled))
        } else {
          errors.push('comptes')
        }

        // ── Validations / demandes de rôle : le snapshot écrase TOUJOURS le ──
        // cache (y compris vide), filtré sur status pending — sinon les entrées
        // traitées sur un autre device ressuscitaient ici indéfiniment.
        if (pendingRes.ok) {
          const pendingOnly = pendingRes.items.filter(p => (p.status || 'pending') === 'pending')
          // Un doc pending_validations est créable par TOUT connecté : on écarte
          // toute demande visant 'agent' (ou un rôle inconnu) — une carte forgée
          // « Activer l'espace Admin » validée d'un clic = escalade totale.
          const validations = pendingOnly.filter(p => p.type !== 'role_request'
            && (p.role || p.requestedRole) !== 'agent')
          const roleReqs = pendingOnly.filter(p => p.type === 'role_request'
            && ['organisateur', 'prestataire'].includes(p.requestedRole))
          localStorage.setItem('lib_pending_validations', JSON.stringify(validations))
          localStorage.setItem('lib_role_requests', JSON.stringify(roleReqs))
        } else {
          errors.push('validations')
        }
        if (apps) setApplications(apps)
        setPending(getPendingValidations())
        setRoleRequests(getPendingRoleRequests().filter(r => r.status === 'pending'))
        setAccounts(getAllAccounts())

        // Demandes de suppression depuis Firestore
        try {
          const delReqs = await fetchDeletionRequestsFromFirestore()
          setDeletionRequests(delReqs)
        } catch { errors.push('demandes de suppression') }

        // Reversements vendeurs : soldes dus + demandes de virement en attente
        // + boosts vendus (surveillance des créneaux Top 3 et des conflits)
        const [balances, payouts, boosts, alerts, paidBookings, refunds, cancellations, eventPayouts] = await Promise.all([
          loadCollectionStrict('seller_balances'),
          loadCollectionStrict('payout_requests'),
          loadCollectionStrict('boosts'),
          loadCollectionStrict('payment_alerts'),
          loadCollectionStrict('bookings'),
          loadCollectionStrict('event_refunds'),
          loadCollectionStrict('event_cancellations'),
          loadCollectionStrict('event_payouts'),
        ])
        // Ventes réelles de la PLATEFORME (docs écrits par les webhooks Stripe/
        // FedaPay). lib_bookings (localStorage) ne contient que les achats faits
        // sur CE device — l'utiliser pour les KPI mentait au fondateur.
        if (paidBookings.ok) setServerBookings(paidBookings.items.filter(b => b.paid === true))
        else errors.push('ventes (bookings)')
        // Soldes dus dans LES DEUX devises (le ledger FedaPay crédite amountDueXOF,
        // jamais amountDueCents — le filtrer sur les seuls cents rendait l'argent
        // dû aux vendeurs Togo/Bénin invisible).
        if (balances.ok) setSellerBalances(balances.items.filter(b => Number(b.amountDueCents) > 0 || Number(b.amountDueXOF) > 0))
        else errors.push('reversements')
        if (payouts.ok) setPayoutRequests(payouts.items.filter(p => p.status === 'pending'))
        else errors.push('demandes de virement')
        if (boosts.ok) setAdminBoosts(boosts.items.sort((a, b) => new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0)))
        else errors.push('boosts')
        if (alerts.ok) setPaymentAlerts(alerts.items.filter(a => a.status === 'manual_review'))
        else errors.push('alertes de paiement')
        // Remboursements mobile money À TRAITER (FedaPay n'a pas d'API de
        // remboursement → l'agent les fait à la main dans le dashboard FedaPay).
        if (refunds.ok) setEventRefunds(refunds.items.filter(r => r.status === 'pending_manual'))
        else errors.push('remboursements à traiter')
        if (cancellations.ok) setEventCancellations(cancellations.items.sort((a, b) => Number(b.cancelledAt || 0) - Number(a.cancelledAt || 0)))
        // Versements auto XOF EN ÉCHEC = le SEUL argent XOF à régler à la main
        // (numéro momo absent, envoi refusé, event terminé sans versement…). Le
        // reste des recettes XOF part AUTOMATIQUEMENT via le cron event_payouts :
        // le surfacer comme « à reverser » exposait à un DOUBLE versement (l'admin
        // paie seller_balances pendant que le cron paie event_payouts). Audit devise.
        if (eventPayouts.ok) setFailedPayouts(eventPayouts.items.filter(p => p.status === 'failed' && Number(p.amountDueXOF || 0) > 0))
      } catch {
        errors.push('données générales')
      }
      setLoadErrors(errors)
    }
    fetchFromFirestore()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vérité Firebase Auth du compte ouvert (email vérifié ? désactivé ?) ──
  // Firestore/localStorage peuvent MENTIR (ex : emailVerified:true côté doc
  // alors qu'Auth bloque la connexion). Le panneau affiche donc l'état Auth réel.
  const [authInfo, setAuthInfo] = useState(null) // { uid, emailVerified, disabled, ... } | { uid, missing } | { uid, error }
  const [authBusy, setAuthBusy] = useState(false)
  useEffect(() => {
    const uid = selectedUser?.uid
    setAuthInfo(null)
    if (!uid) return
    let cancelled = false
    adminAccountsApi('auth_status', { uids: [uid] }).then(res => {
      if (cancelled) return
      if (res.ok && res.data.localMode) setAuthInfo({ uid, localMode: true })
      else if (res.ok) setAuthInfo(res.data.statuses?.[uid] || { uid, missing: true })
      else setAuthInfo({ uid, error: res.message })
    })
    return () => { cancelled = true }
  }, [selectedUser?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Appel unifié aux actions admin serveur (la SEULE voie qui touche Firebase
  // Auth). Retourne { ok, data?, message? } — jamais de throw.
  async function adminAccountsApi(action, payload = {}) {
    try {
      // Mode démo sans Firebase : pas de couche Auth à gérer — on laisse les
      // handlers appliquer leurs écritures locales (comportement historique).
      const { USE_REAL_FIREBASE } = await import('../firebase')
      if (!USE_REAL_FIREBASE) {
        return { ok: true, data: { localMode: true, statuses: {}, sentTo: payload?.email || '' } }
      }
      const { authHeaders } = await import('../utils/apiAuth')
      const headers = await authHeaders()
      if (!headers.Authorization) {
        return { ok: false, message: 'Session Firebase absente — recharge la page ou reconnecte-toi.' }
      }
      const res = await fetch('/api/admin-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action, ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, message: data.message || `Erreur serveur (${res.status})`, error: data.error }
      return { ok: true, data }
    } catch {
      return { ok: false, message: 'Serveur injoignable — réessaie.' }
    }
  }

  if (!isAgent) return null

  // ── Presence helper — en ligne = isOnline true ET vu il y a < 5 min ──
  // (setOffline écrit isOnline:false + lastSeen : sans le test isOnline, un
  // utilisateur qui vient de fermer l'app — ou qui masque son statut — était
  // compté « Connecté » pendant 5 minutes.)
  function isUserOnline(acc) {
    return acc?.isOnline === true && !!acc?.lastSeen && (Date.now() - acc.lastSeen) < 5 * 60 * 1000
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
  // 'resubmitted' = dossier corrigé et re-soumis par le candidat : il ATTEND une
  // décision au même titre qu'un 'submitted' (sinon aucun badge ne prévenait
  // l'admin et les dossiers corrigés moisissaient).
  const totalAppsSubmitted = applications.filter(a =>
    a.status === 'submitted' || a.status === 'under_review' || a.status === 'resubmitted'
  ).length
  // Count only applications + role requests to avoid double-counting the same dossier.
  const totalAllPending   = totalAppsSubmitted + totalRoleReqs

  // ── Métriques business (revenus plateforme, billets, GMV) ──────────────────
  // Source : collection `bookings/` (webhooks Stripe + FedaPay, paid:true) —
  // la SEULE vérité cross-device. Agrégats séparés PAR DEVISE : additionner
  // EUR et FCFA (ou appliquer le barème de frais EUR à un billet FCFA) produit
  // des chiffres qui n'existent pas.
  const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000
  const bookingTime = (b) => {
    const t = b.finalizedAt?.toMillis ? b.finalizedAt.toMillis() : b.finalizedAt
    return Number(t) || new Date(b.bookedAt || 0).getTime() || 0
  }
  const eurBookings = serverBookings.filter(b => String(b.currency || 'eur').toLowerCase() === 'eur')
  const xofBookings = serverBookings.filter(b => String(b.currency || '').toLowerCase() === 'xof')
  const ticketCountOf = (b) => Array.isArray(b.tickets) && b.tickets.length ? b.tickets.length : Math.max(1, Number(b.qty) || 1)
  // GMV = volume encaissé (billets + précommandes + frais, tel que débité)
  const gmvTicketsEUR = eurBookings.reduce((sum, b) => sum + (Number(b.amountTotalCents) || 0), 0) / 100
  const gmvTicketsXOF = xofBookings.reduce((sum, b) => sum + (Number(b.amountTotal) || 0), 0)
  const paidBoosts = adminBoosts.filter(boost => !['refunded_conflict', 'cancelled'].includes(boost.status))
  const gmvBoosts = paidBoosts.reduce((sum, b) => sum + (Number(b.price) || 0), 0) // boosts vendus en EUR
  // Revenus plateforme RÉELS (encaissés) :
  // - frais de service par billet : 5%+0,49 € cap 2,50 € (EUR) / 5%+300 cap 1500 (XOF)
  //   recalculés sur le prix de place figé de chaque billet émis
  // - boosts = 100% plateforme
  // Les prestations sont réglées directement entre les utilisateurs et ne font
  // donc partie ni du GMV ni des revenus de la plateforme.
  const feesOf = (bookings, isXOF) => bookings.reduce((sum, b) => {
    const tickets = Array.isArray(b.tickets) ? b.tickets : []
    if (tickets.length) {
      return sum + tickets.reduce((s, t) => {
        const p = Number(t.placePrice) || 0
        return s + (isXOF ? computeTicketFeeXOF(p, 1) : computeTicketFeeCents(Math.round(p * 100), 1) / 100)
      }, 0)
    }
    return sum
  }, 0)
  const ticketFeeRevenueEUR = feesOf(eurBookings, false)
  const ticketFeeRevenueXOF = feesOf(xofBookings, true)
  const platformRevenueEUR = ticketFeeRevenueEUR + gmvBoosts // boost = 100% pour la plateforme
  // Activité événementielle
  const totalTicketsSold = serverBookings.reduce((sum, b) => sum + ticketCountOf(b), 0)
  const recentBookings = serverBookings.filter(b => bookingTime(b) > thirtyDaysAgo)
  const totalEventsPublished = allEvents.length
  const upcomingEventsCount = allEvents.filter(ev => {
    if (ev.cancelled) return false
    if (!ev.date) return false
    try {
      const endTime = ev.endTime || ev.time || '23:59'
      const [h, m] = endTime.split(':').map(Number)
      const d = new Date(ev.date + 'T00:00:00')
      d.setHours(h, m, 0, 0)
      return d.getTime() > Date.now()
    } catch { return false }
  }).length
  // Nouveaux comptes ce mois
  const newAccountsThisMonth = verifiedAccounts.filter(a =>
    a.createdAt && (Date.now() - a.createdAt) < 30 * 24 * 3600 * 1000
  ).length
  // Évolution 30 derniers jours par jour (pour graphique)
  const last30Days = (() => {
    const days = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dayStart = d.getTime()
      const dayEnd = dayStart + 24 * 3600 * 1000
      const accountsCount = verifiedAccounts.filter(a =>
        a.createdAt && a.createdAt >= dayStart && a.createdAt < dayEnd
      ).length
      days.push({ date: d, count: accountsCount })
    }
    return days
  })()
  const maxDayCount = Math.max(...last30Days.map(d => d.count), 1)

  const filtered = accounts.filter(a => {
    const matchSearch = !search ||
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.email?.toLowerCase().includes(search.toLowerCase()) ||
      a.phone?.includes(search)
    // 'user' et 'client' sont le même rôle (stocké tantôt 'client', tantôt 'user')
    // — le filtre 'user' doit montrer les deux, sinon les clients disparaissent (audit #12).
    const matchRole   = roleFilter === 'all'
      || (roleFilter === 'user' ? (a.role === 'user' || a.role === 'client' || !a.role) : a.role === roleFilter)
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    return matchSearch && matchRole && matchStatus
  })

  async function handleApprove(uid) {
    try {
      await approveValidation(uid)
      refresh()
      showToast('Compte validé')
    } catch (e) {
      // L'écriture serveur a échoué — le compte reste en attente, pas de faux succès
      showToast('Échec serveur — le compte reste en attente. Réessaie.', 'error')
    }
    setConfirmAction(null)
  }

  async function handleReject(uid) {
    try {
      await rejectValidation(uid, rejectReason)
      setRejectReason('')
      refresh()
      showToast('Compte refusé', 'error')
    } catch (e) {
      // rejectValidation écrit désormais le serveur EN PREMIER et throw si échec
      showToast('Échec serveur — le refus n\'a pas été enregistré. Réessaie.', 'error')
    }
    setConfirmAction(null)
  }

  async function handleBan(uid) {
    // Serveur d'abord : la suspension doit désactiver la CONNEXION (Firebase
    // Auth disabled + sessions révoquées), pas seulement poser un statut Firestore
    // que rien n'applique. Si le serveur échoue → on ne ment pas à l'admin.
    const res = await adminAccountsApi('set_disabled', { uid, disabled: true })
    if (!res.ok) {
      showToast(`Suspension impossible : ${res.message}`, 'error')
      setConfirmAction(null)
      return
    }
    const bannedAt = Date.now()
    updateAccount(uid, { status: 'banned', bannedAt })
    refresh()
    showToast('Compte suspendu — connexion désactivée')
    setConfirmAction(null)
    setSelectedUser(null)
  }

  // ── Suppression complète serveur (Firebase Auth + Firestore) ────────────────
  // RÈGLE : un compte vit dans 3 couches (Auth, Firestore, localStorage). Seul
  // le serveur peut supprimer l'utilisateur Auth — sans ça l'email reste
  // verrouillé à vie (auth/email-already-in-use à la ré-inscription).
  // Si le serveur échoue → on ne touche à RIEN localement (pas d'état fantôme).
  async function deleteAccountFull(uid) {
    try {
      const { authHeaders } = await import('../utils/apiAuth')
      const res = await fetch('/api/admin-delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ uid }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, message: data.message || `Erreur serveur (${res.status})` }
      }
      // Serveur OK → nettoyage local
      deleteAccount(uid)
      return { ok: true, ...data }
    } catch (e) {
      return { ok: false, message: 'Serveur injoignable — compte NON supprimé (réessaie).' }
    }
  }

  async function handleDelete(uid) {
    const result = await deleteAccountFull(uid)
    if (!result.ok) {
      showToast(result.message, 'error')
      return
    }
    // Purge aussi les files locales (le serveur a nettoyé pending_validations
    // et applications/) : sans ça, l'entrée fantôme restait « validable »,
    // recréait un users/{uid}, et le dossier supprimé gonflait le badge admin.
    try {
      const { removePendingValidation } = await import('../utils/accounts')
      removePendingValidation(uid)
      const rr = JSON.parse(localStorage.getItem('lib_role_requests') || '[]')
      localStorage.setItem('lib_role_requests', JSON.stringify(rr.filter(r => r.uid !== uid)))
      const apps = JSON.parse(localStorage.getItem('lib_applications') || '[]')
      localStorage.setItem('lib_applications', JSON.stringify(apps.filter(a => a.uid !== uid)))
      setApplications(a => a.filter(x => x.uid !== uid))
    } catch {}
    refresh()
    showToast(result.authDeleted
      ? `Compte supprimé — email ${result.deletedEmail || ''} libéré pour ré-inscription`.trim()
      : 'Compte supprimé (données nettoyées)', 'error')
    setConfirmAction(null)
    setSelectedUser(null)
  }

  async function handleVerifyEmail(uid) {
    // Serveur d'abord : la connexion vérifie cred.user.emailVerified (Firebase
    // AUTH). Écrire Firestore/localStorage sans toucher Auth laissait le compte
    // bloqué à « Vérifie ton email » tout en l'affichant ACTIF dans le panneau.
    setAuthBusy(true)
    const res = await adminAccountsApi('verify_email', { uid })
    setAuthBusy(false)
    if (!res.ok) {
      showToast(`Vérification impossible : ${res.message}`, 'error')
      return
    }
    // status:'active' seulement pour un CLIENT non suspendu : vérifier l'email
    // ne doit ni court-circuiter la validation d'un dossier pro, ni dé-bannir.
    const acc = accounts.find(a => a.uid === uid)
    const activate = acc?.status !== 'banned'
      && (!acc || acc.role === 'client' || acc.role === 'user' || acc.status === 'active')
    const patch = activate ? { emailVerified: true, status: 'active' } : { emailVerified: true }
    updateAccount(uid, patch)
    try {
      const { db } = await import('../firebase')
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'users', uid), patch, { merge: true })
    } catch {}
    setAuthInfo(info => info?.uid === uid ? { ...info, emailVerified: true } : info)
    refresh()
    showToast('Email vérifié — le compte peut maintenant se connecter')
  }

  async function handleSendVerification(uid) {
    setAuthBusy(true)
    const res = await adminAccountsApi('send_verification', { uid })
    setAuthBusy(false)
    if (!res.ok) {
      showToast(`Envoi impossible : ${res.message}`, 'error')
      return
    }
    if (res.data.alreadyVerified) {
      setAuthInfo(info => info?.uid === uid ? { ...info, emailVerified: true } : info)
      showToast('Cet email est déjà vérifié côté connexion')
      return
    }
    showToast(`Email de vérification renvoyé à ${res.data.sentTo}`)
  }

  async function handleDeleteUnverified(uid) {
    const result = await deleteAccountFull(uid)
    if (!result.ok) {
      showToast(result.message, 'error')
      return false
    }
    refresh()
    showToast(result.authDeleted
      ? `Compte supprimé — email ${result.deletedEmail || ''} libéré`.trim()
      : 'Fiche supprimée (aucun compte de connexion associé)')
    return true
  }

  // Nettoyage +7 j : la suppression est IRRÉVERSIBLE et le flag emailVerified du
  // cache peut être EN RETARD sur Firebase Auth (l'utilisateur a cliqué le lien
  // mais ne s'est pas reconnecté). On re-vérifie donc chaque compte auprès
  // d'Auth : on ne supprime que si Auth confirme « non vérifié » (ou inexistant).
  async function handleCleanupExpired() {
    const candidates = accounts.filter(a =>
      a.emailVerified === false && (a.role === 'client' || a.role === 'user') &&
      a.createdAt && (Date.now() - a.createdAt) > 7 * 24 * 60 * 60 * 1000
    )
    if (!candidates.length) { showToast('Aucun compte expiré à supprimer'); return }
    const res = await adminAccountsApi('auth_status', { uids: candidates.map(a => a.uid) })
    if (!res.ok) {
      showToast(`Vérification Auth impossible — aucun compte supprimé. ${res.message}`, 'error')
      return
    }
    const statuses = res.data.statuses || {}
    let deleted = 0, skipped = 0, failed = 0
    for (const a of candidates) {
      const st = statuses[a.uid]
      // Statut ABSENT de la réponse = inconnu → on CONSERVE (jamais supprimer
      // sur une absence d'information : c'est peut-être un vrai compte).
      if (!st) { failed++; continue }
      if (!st.missing && st.emailVerified) { skipped++; continue } // vérifié côté Auth → compte légitime
      const ok = await deleteAccountFull(a.uid)
      if (ok.ok) deleted++
      else failed++
    }
    refresh()
    showToast(
      `${deleted} compte(s) supprimé(s)` +
      (skipped ? ` · ${skipped} conservé(s) (email en réalité vérifié)` : '') +
      (failed ? ` · ${failed} échec(s)` : ''),
      failed ? 'error' : 'success'
    )
  }

  // Doublons : les groupes viennent du cache — la seule vérité est Firebase
  // Auth. On ne supprime QUE les entrées qui n'existent PAS dans Auth (fiches
  // fantômes) ; jamais un uid Auth réel sur la seule foi d'un createdAt.
  async function handleCleanupDuplicates() {
    const emailMap = {}
    accounts.forEach(a => {
      const key = String(a.email || '').trim().toLowerCase()
      if (key) emailMap[key] = [...(emailMap[key] || []), a]
    })
    const dupes = Object.values(emailMap).filter(g => g.length > 1)
    if (!dupes.length) { showToast('Aucun doublon'); return }
    const uids = dupes.flat().map(a => a.uid)
    const res = await adminAccountsApi('auth_status', { uids })
    if (!res.ok) {
      showToast(`Vérification Auth impossible — aucun doublon supprimé. ${res.message}`, 'error')
      return
    }
    const statuses = res.data.statuses || {}
    let deleted = 0, kept = 0, failed = 0
    for (const group of dupes) {
      for (const a of group) {
        const st = statuses[a.uid]
        // Statut absent = inconnu → CONSERVER. Seul un `missing:true` explicite
        // (Auth a répondu « n'existe pas ») autorise la purge de la fiche.
        if (!st) { failed++; continue }
        if (!st.missing) { kept++; continue } // vrai compte de connexion : intouchable ici
        const ok = await deleteAccountFull(a.uid)
        if (ok.ok) deleted++
        else failed++
      }
    }
    refresh()
    showToast(
      deleted || failed
        ? `${deleted} fiche(s) fantôme(s) supprimée(s)` + (failed ? ` · ${failed} échec(s)` : '')
        : `Rien à nettoyer automatiquement : les ${kept} entrées sont de vrais comptes — supprime à la main celle en trop.`,
      failed ? 'error' : 'success'
    )
  }

  async function handleApproveRoleRequest(requestId) {
    try {
      await approveRoleRequest(requestId)
      refresh()
      showToast('Accès activé')
    } catch (e) {
      showToast(e?.message || 'Échec serveur — le rôle n\'a pas été accordé. Réessaie.', 'error')
    }
    setConfirmAction(null)
  }

  async function handleRejectRoleRequest(requestId) {
    try {
      await rejectRoleRequest(requestId, roleRejectReason)
      setRoleRejectReason('')
      refresh()
      showToast('Demande refusée', 'error')
    } catch (e) {
      // rejectRoleRequest écrit désormais le serveur EN PREMIER et throw si échec
      showToast('Échec serveur — le refus n\'a pas été enregistré. Réessaie.', 'error')
    }
    setConfirmAction(null)
  }

  async function handleReactivate(uid) {
    // Serveur d'abord : réactive la CONNEXION (Auth disabled=false) en plus du statut.
    const res = await adminAccountsApi('set_disabled', { uid, disabled: false })
    if (!res.ok) {
      showToast(`Réactivation impossible : ${res.message}`, 'error')
      return
    }
    updateAccount(uid, { status: 'active' })
    refresh()
    showToast('Compte réactivé — connexion rétablie')
    setAuthInfo(info => info?.uid === uid ? { ...info, disabled: false } : info)
    setSelectedUser(u => u?.uid === uid ? { ...u, status: 'active' } : u)
  }

  async function handleSaveEdit() {
    if (!editField) return
    // L'email est l'IDENTIFIANT DE CONNEXION : il vit dans Firebase Auth. Le
    // modifier seulement dans Firestore affichait un email avec lequel
    // l'utilisateur ne pouvait PAS se connecter. → passage serveur obligatoire.
    if (editField.field === 'email') {
      const newEmail = String(editField.value || '').trim().toLowerCase()
      const res = await adminAccountsApi('update_email', { uid: editField.uid, email: newEmail })
      if (!res.ok) {
        showToast(`Email non modifié : ${res.message}`, 'error')
        return
      }
      updateAccount(editField.uid, { email: newEmail, emailVerified: false })
      refresh()
      setSelectedUser(u => u?.uid === editField.uid ? { ...u, email: newEmail } : u)
      setAuthInfo(info => info?.uid === editField.uid ? { ...info, email: newEmail, emailVerified: false } : info)
      setEditField(null)
      showToast('Email de connexion modifié — repasse-le en « vérifié » ou renvoie le lien')
      return
    }
    // Firestore d'abord, échec REMONTÉ : « Mis à jour » ne s'affiche que si le
    // serveur a réellement enregistré (l'ancien catch vide masquait les
    // permission-denied et l'admin croyait la modification faite).
    try {
      const { USE_REAL_FIREBASE, db } = await import('../firebase')
      if (USE_REAL_FIREBASE) {
        const { doc, setDoc } = await import('firebase/firestore')
        await setDoc(doc(db, 'users', editField.uid), { [editField.field]: editField.value }, { merge: true })
      }
    } catch (e) {
      showToast('Échec serveur — rien n\'a été modifié. Réessaie.', 'error')
      return
    }
    updateAccount(editField.uid, { [editField.field]: editField.value })
    refresh()
    setSelectedUser(u => u?.uid === editField.uid ? { ...u, [editField.field]: editField.value } : u)
    setEditField(null)
    showToast('Mis à jour')
  }

  // Note : la fonction d'ajustement de solde a été retirée — le wallet interne
  // a été remplacé par Stripe. Les remboursements se font côté Stripe Dashboard.

  // ── Reversement manuel : marquer un solde vendeur comme payé ──
  // TRANSACTION Firestore (jamais 3 écritures séquentielles) :
  //  - le montant payé est PLAFONNÉ au solde réel du ledger (une demande de
  //    virement est écrite par le vendeur → montant non fiable) ;
  //  - journal payout_logs à id DÉTERMINISTE (retry idempotent : pas de double
  //    décrément si l'admin re-clique après une erreur réseau) ;
  //  - devise explicite : 'EUR' décrémente amountDueCents, 'XOF' amountDueXOF
  //    (le ledger FedaPay ne vit QUE dans amountDueXOF).
  async function handleMarkPaid(sellerUid, amount, requestId, currency = 'EUR') {
    const amt = Math.abs(Number(amount) || 0)
    if (!sellerUid) return
    // Demande de virement au solde déjà nul : on clôt la demande sans toucher au ledger.
    if (amt <= 0) {
      if (!requestId) return
      try {
        const { db } = await import('../firebase')
        const { doc, setDoc } = await import('firebase/firestore')
        await setDoc(doc(db, 'payout_requests', requestId), {
          status: 'paid', paidAt: Date.now(), paidBy: user?.uid || '', paidAmount: 0, paidCurrency: currency,
        }, { merge: true })
        setPayoutRequests(prev => prev.filter(p => p.id !== requestId))
        showToast('Demande close (solde déjà à zéro)')
      } catch {
        showToast('Échec — la demande reste ouverte. Réessaie.', 'error')
      }
      return
    }
    const field = currency === 'XOF' ? 'amountDueXOF' : 'amountDueCents'
    // Id de journal : PAR demande ET PAR devise (une demande bi-devise a deux
    // règlements distincts). Sans demande : id unique par clic — le double-clic
    // est déjà inoffensif car le montant est plafonné au solde restant du
    // ledger lu DANS la transaction (2e passage → solde 0 → rien).
    const logId = requestId
      ? `pl_${requestId}_${currency}`
      : `pl_${sellerUid}_${currency}_${Date.now()}`
    try {
      const { db } = await import('../firebase')
      const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore')
      const outcome = await runTransaction(db, async (tx) => {
        const logRef = doc(db, 'payout_logs', logId)
        const logSnap = await tx.get(logRef)
        // Journal déjà présent = ce règlement précis a DÉJÀ été enregistré
        // (autre onglet/appareil). Ce n'est PAS un succès du clic courant :
        // ne rien décrémenter et le dire clairement.
        if (logSnap.exists()) return { already: true, paid: 0 }
        const balRef = doc(db, 'seller_balances', sellerUid)
        const balSnap = await tx.get(balRef)
        const due = Math.max(0, Number(balSnap.exists() ? balSnap.data()[field] : 0) || 0)
        const toPay = Math.min(amt, due)
        if (toPay <= 0) return { already: false, paid: 0 }
        tx.set(balRef, { [field]: due - toPay, updatedAt: serverTimestamp() }, { merge: true })
        tx.set(logRef, {
          sellerUid, amount: toPay, currency, requestId: requestId || null,
          by: user?.uid || '', byName: user?.name || 'Agent', at: Date.now(),
        })
        if (requestId) {
          tx.set(doc(db, 'payout_requests', requestId), {
            status: 'paid', paidAt: Date.now(), paidBy: user?.uid || '', paidAmount: toPay, paidCurrency: currency,
          }, { merge: true })
        }
        return { already: false, paid: toPay }
      })
      if (outcome.already) {
        showToast('Ce règlement a déjà été enregistré (autre onglet ou appareil) — recharge pour voir l\'état à jour.', 'error')
        return
      }
      const paid = outcome.paid
      if (paid <= 0) {
        showToast('Aucun solde à reverser dans cette devise — le ledger est déjà à zéro.', 'error')
        setPayoutRequests(prev => prev.filter(p => p.id !== requestId))
        return
      }
      // MAJ locale
      setSellerBalances(prev => prev
        .map(b => ((b.sellerUid || b.id || b._docId) === sellerUid)
          ? { ...b, [field]: Math.max(0, Number(b[field] || 0) - paid) }
          : b)
        .filter(b => Number(b.amountDueCents) > 0 || Number(b.amountDueXOF) > 0))
      setPayoutRequests(prev => prev.filter(p => p.id !== requestId))
      const label = currency === 'XOF' ? `${paid} FCFA` : `${(paid / 100).toFixed(2)} €`
      showToast(paid < amt ? `Reversement de ${label} (plafonné au solde réel)` : `Reversement de ${label} marqué payé`)
    } catch (e) {
      showToast('Échec du marquage — rien n\'a été décrémenté. Réessaie.', 'error')
    }
  }

  // ── Régler à la main UN versement auto XOF en échec (le filet) ──────────────
  // event_payouts est server-authoritative (write:false) → la finalisation passe
  // par api/admin-accounts (Admin SDK, transaction). Le serveur décrémente les
  // DEUX ledgers (event_payouts → 'paid' + seller_balances) et ne solde QUE des
  // enveloppes 'failed' — jamais une enveloppe en versement auto (double envoi).
  async function handleMarkPayoutPaid(ep) {
    const eventId = String(ep.eventId || ep.id || ep._docId || '')
    const sellerUid = String(ep.sellerUid || '')
    if (!eventId) return
    const res = await adminAccountsApi('mark_payout_paid', { eventId })
    if (!res.ok) {
      if (res.error === 'not_failed') {
        // Reparti en automatique entre-temps : on le retire de la liste manuelle.
        setFailedPayouts(prev => prev.filter(p => String(p.eventId || p.id || p._docId) !== eventId))
      }
      showToast(res.message || 'Échec du marquage — rien n\'a été décrémenté. Réessaie.', 'error')
      return
    }
    const paid = Number(res.data?.paid || 0)
    setFailedPayouts(prev => prev.filter(p => String(p.eventId || p.id || p._docId) !== eventId))
    if (sellerUid && paid > 0) {
      setSellerBalances(prev => prev
        .map(b => ((b.sellerUid || b.id || b._docId) === sellerUid)
          ? { ...b, amountDueXOF: Math.max(0, Number(b.amountDueXOF || 0) - paid) }
          : b)
        .filter(b => Number(b.amountDueCents) > 0 || Number(b.amountDueXOF) > 0))
    }
    if (res.data?.alreadyPaid) showToast('Ce versement avait déjà été réglé — liste mise à jour.')
    else showToast(`Versement de ${Math.round(paid).toLocaleString('fr-FR')} FCFA marqué payé`)
  }

  async function handleAppAction(appId, status, note) {
    const adminNoteValue = appAdminNote || ''
    let updatedApp
    try {
      updatedApp = await updateApplicationStatus(appId, status, user?.uid, user?.name || 'Agent', note, adminNoteValue)
    } catch (e) {
      // L'attribution de rôle a échoué côté serveur — pas de faux « approuvé »
      showToast('Échec serveur — dossier non mis à jour. Réessaie.', 'error')
      return
    }
    refresh()
    setSelectedApp(apps => apps ? { ...apps, status, ...(status === 'approved' ? { approvedAt: Date.now() } : {}), ...(status === 'rejected' ? { rejectionReason: note } : {}), ...(status === 'needs_changes' ? { requestedChanges: note } : {}) } : null)
    showToast(status === 'approved' ? 'Dossier approuvé' : status === 'rejected' ? 'Dossier refusé' : status === 'needs_changes' ? 'Corrections demandées' : status === 'under_review' ? 'Dossier en révision' : 'Dossier mis à jour')

    // Fire in-app notification to the applicant
    const applicantUid = updatedApp?.uid
    // Validation humaine du dossier = email de confiance : on vérifie aussi
    // côté Firebase AUTH (la couche que la connexion consulte réellement).
    // Best-effort — le flag Firestore emailVerificationRequired:false suffit
    // déjà à débloquer la connexion des pros.
    if (applicantUid && status === 'approved') {
      adminAccountsApi('verify_email', { uid: applicantUid }).catch(() => {})
    }
    if (applicantUid) {
      try {
        const { createNotification } = await import('../utils/notifications')
        if (status === 'approved') {
          createNotification(applicantUid, 'application_approved',
            'Dossier approuvé',
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
            'Corrections requises',
            note || 'Des modifications sont demandées sur ton dossier. Ouvre Mon Dossier pour voir les détails.',
            { appId }
          )
        }
      } catch {}
    }

    // Email transactionnel (best-effort : ne bloque jamais l'action agent).
    // Le statut + le message viennent d'être awaités dans updateApplicationStatus,
    // donc /api/send-email relira le bon requestedChanges/rejectionReason.
    const emailType =
      status === 'approved'      ? 'application_approved'      :
      status === 'needs_changes' ? 'application_needs_changes' :
      status === 'rejected'      ? 'application_rejected'      : null
    if (emailType) {
      import('../utils/apiAuth').then(async ({ authHeaders }) => fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ appId, type: emailType }),
      })).catch(() => {})
    }

    setAppNote('')
    setAppAdminNote('')
    setActiveAction(null)
    setConfirmAction(null)
  }

  // ── Shared input style ──
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#0b0c12',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10, color: '#fff',
    fontFamily: FONTS.display, fontSize: 13.5,
    padding: '10px 13px',
    outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>

      {/* ── Top bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(4,4,14,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 16px',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/accueil')}
            aria-label="Retour à l'accueil"
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: FONTS.display, fontWeight: 800, fontSize: 18, letterSpacing: '-0.3px', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
              Administration
              <span style={{ fontFamily: FONTS.display, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.gold, background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 999, padding: '2px 9px' }}>
                Agent
              </span>
            </h1>
            <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.dim, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name} · {user?.email}
            </p>
          </div>
          <button onClick={() => navigate('/agent/organisateurs')} style={{
            fontFamily: FONTS.display, fontSize: 12, fontWeight: 700, flexShrink: 0,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.9)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer',
          }}>Organisateurs</button>
          {totalAllPending > 0 && (
            <button
              onClick={() => setTab('dossiers')}
              style={{
                fontFamily: FONTS.display, fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: 'rgba(200,169,110,0.14)', border: '1px solid rgba(200,169,110,0.5)',
                color: COLORS.gold, borderRadius: 999, padding: '8px 14px',
                cursor: 'pointer',
              }}>
              {totalAllPending} en attente
            </button>
          )}
        </div>
      </div>

      {/* ── Nav (segmented control, cohérent avec le reste de l'app) ── */}
      <div style={{ padding: '12px 16px 0', maxWidth: 760, margin: '0 auto' }}>
        <div className="hide-scrollbar" style={{
          display: 'flex', gap: 6, padding: 4,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, overflowX: 'auto',
        }}>
          {[
            { key: 'dashboard',    label: 'Tableau de bord' },
            { key: 'users',        label: 'Comptes' },
            { key: 'events',       label: 'Événements',    count: allEvents.length },
            { key: 'dossiers',     label: 'Dossiers',      count: totalAppsSubmitted, alert: totalAppsSubmitted > 0 },
            { key: 'boosts',       label: 'Boosts',        count: adminBoosts.filter(b => !['refunded_conflict', 'cancelled'].includes(b.status) && new Date(b.expiresAt).getTime() > Date.now()).length, alert: adminBoosts.some(b => b.conflict && b.status !== 'refunded_conflict' && b.status !== 'cancelled' && new Date(b.expiresAt).getTime() > Date.now()) },
            { key: 'reversements', label: 'Reversements',  count: payoutRequests.length, alert: payoutRequests.length > 0 },
            { key: 'remboursements', label: 'Remboursements', count: eventRefunds.length, alert: eventRefunds.length > 0 },
            { key: 'paiements',     label: 'Paiements',      count: paymentAlerts.length, alert: paymentAlerts.length > 0 },
            { key: 'suppressions', label: 'Suppressions',  count: deletionRequests.length, alert: deletionRequests.length > 0 },
            { key: 'reports',      label: 'Signalements',  count: reports.length, alert: reports.length > 0 },
            { key: 'avis',         label: 'Avis' },
            { key: 'actualite',    label: 'Actualité' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                fontFamily: FONTS.display, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.01em',
                cursor: 'pointer',
                background: tab === t.key ? 'rgba(200,169,110,0.16)' : 'transparent',
                border: tab === t.key ? '1px solid rgba(200,169,110,0.45)' : '1px solid transparent',
                borderRadius: 9,
                color: tab === t.key ? COLORS.gold : 'rgba(255,255,255,0.55)',
                transition: 'all 0.2s',
              }}>
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontFamily: FONTS.display, fontSize: 10, fontWeight: 800, lineHeight: 1.4,
                  color: t.alert ? '#fff' : 'rgba(255,255,255,0.55)',
                  background: t.alert ? 'rgba(224,90,170,0.85)' : 'rgba(255,255,255,0.08)',
                  borderRadius: 999, padding: '1px 7px',
                }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="lib-tab-content" style={{ padding: '16px 16px 8px', maxWidth: 760, margin: '0 auto' }}>

        {/* Un échec de lecture N'EST PAS un état vide : sans ce bandeau, une
            permission refusée affichait « Aucun reversement / Aucune alerte »
            — faux all-clear sur des obligations financières. */}
        {loadErrors.length > 0 && (
          <div style={{
            ...CARD, padding: '12px 16px', marginTop: 8,
            borderColor: 'rgba(224,90,170,0.4)', borderLeft: '3px solid rgba(224,90,170,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#fff', margin: 0, lineHeight: 1.5 }}>
              Lecture impossible : {loadErrors.join(', ')}. Les chiffres de ces sections sont incomplets —
              recharge la page ; si ça persiste, reconnecte-toi (droits admin).
            </p>
            <button onClick={() => window.location.reload()} style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700,
            }}>
              Recharger
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            DASHBOARD
        ══════════════════════════════════════════════ */}
        {tab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>

            {/* ──────── MÉTRIQUES BUSINESS ──────── */}
            <div>
              <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Métriques business
              </p>

              {/* Card revenus plateforme — la plus importante */}
              <div style={{
                ...CARD,
                padding: 20,
                borderColor: 'rgba(200,169,110,0.30)',
                borderLeft: '3px solid rgba(200,169,110,0.6)',
                marginBottom: 10,
              }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(200,169,110,0.7)', margin: 0 }}>
                  Revenus plateforme
                </p>
                <p style={{ fontFamily: FONTS.display, fontSize: 42, fontWeight: 300, color: COLORS.gold, margin: '6px 0 0', lineHeight: 1 }}>
                  {platformRevenueEUR.toFixed(2)} €
                </p>
                {ticketFeeRevenueXOF > 0 && (
                  <p style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 300, color: COLORS.teal, margin: '6px 0 0', lineHeight: 1 }}>
                    + {Math.round(ticketFeeRevenueXOF).toLocaleString('fr-FR')} FCFA
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.dim, margin: 0 }}>Frais billets</p>
                    <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 300, color: 'rgba(255,255,255,0.78)', margin: '2px 0 0' }}>
                      {ticketFeeRevenueEUR.toFixed(2)} €{ticketFeeRevenueXOF > 0 ? ` · ${Math.round(ticketFeeRevenueXOF).toLocaleString('fr-FR')} FCFA` : ''}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.dim, margin: 0 }}>Boosts (100%)</p>
                    <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 300, color: 'rgba(255,255,255,0.78)', margin: '2px 0 0' }}>
                      {gmvBoosts.toFixed(2)} €
                    </p>
                  </div>
                </div>
              </div>

              {/* GMV + activité */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ ...CARD, padding: 12 }}>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.dim, margin: 0 }}>Volume encaissé</p>
                  <p style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 300, color: '#fff', margin: '3px 0 0', lineHeight: 1 }}>
                    {(gmvTicketsEUR + gmvBoosts).toFixed(0)} €
                  </p>
                  {gmvTicketsXOF > 0 && (
                    <p style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 300, color: COLORS.teal, margin: '3px 0 0', lineHeight: 1 }}>
                      + {Math.round(gmvTicketsXOF).toLocaleString('fr-FR')} FCFA
                    </p>
                  )}
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '3px 0 0' }}>Ventes en ligne (webhooks)</p>
                </div>
                <div style={{ ...CARD, padding: 12 }}>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.dim, margin: 0 }}>Billets payés</p>
                  <p style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 300, color: '#4ee8c8', margin: '3px 0 0', lineHeight: 1 }}>
                    {totalTicketsSold}
                  </p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '3px 0 0' }}>{recentBookings.length} vente{recentBookings.length !== 1 ? 's' : ''} ces 30j</p>
                </div>
                <div style={{ ...CARD, padding: 12 }}>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.dim, margin: 0 }}>Events publiés</p>
                  <p style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 300, color: '#fff', margin: '3px 0 0', lineHeight: 1 }}>
                    {totalEventsPublished}
                  </p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '3px 0 0' }}>{upcomingEventsCount} à venir</p>
                </div>
              </div>
            </div>

            {/* ──────── COMMUNAUTÉ ──────── */}
            <div>
              <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Communauté
              </p>

            {/* Stat grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: `Comptes total${newAccountsThisMonth > 0 ? ` · +${newAccountsThisMonth} ce mois` : ''}`, value: totalUsers, color: '#4ee8c8',   onClick: () => { setTab('users'); setRoleFilter('all'); setStatusFilter('all'); setSearch('') } },
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
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                    {s.label}
                  </p>
                  <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 38, color: s.color, margin: 0, lineHeight: 1 }}>
                    {s.value}
                  </p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 600, color: s.color, margin: '6px 0 0', opacity: 0.75 }}>
                    Voir →
                  </p>
                </button>
              ))}
            </div>
            </div>

            {/* ──────── GRAPHIQUE CROISSANCE 30 JOURS ──────── */}
            <div style={{ ...CARD, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  Nouveaux comptes — 30 derniers jours
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#4ee8c8', margin: 0 }}>
                  +{newAccountsThisMonth}
                </p>
              </div>
              {/* Barres */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60, marginBottom: 6 }}>
                {last30Days.map((d, i) => {
                  const h = (d.count / maxDayCount) * 100
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <div style={{
                        width: '100%', minHeight: 2,
                        height: `${Math.max(h, 4)}%`,
                        background: d.count > 0
                          ? 'linear-gradient(180deg, rgba(78,232,200,0.85) 0%, rgba(78,232,200,0.30) 100%)'
                          : 'rgba(255,255,255,0.04)',
                        borderRadius: 1,
                        transition: 'height 0.4s',
                      }} title={`${d.count} compte${d.count > 1 ? 's' : ''} le ${d.date.toLocaleDateString('fr-FR')}`} />
                    </div>
                  )
                })}
              </div>
              {/* Labels J-30 / aujourd'hui */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, letterSpacing: '0.06em' }}>J-30</span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, letterSpacing: '0.06em' }}>AUJOURD'HUI</span>
              </div>
            </div>

            {/* Recent registrations */}
            <div>
              <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
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
              <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
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
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: unverifiedAccounts.length > 0 ? '#f59e0b' : COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  Emails non vérifiés ({unverifiedAccounts.length})
                </p>
                {expiredUnverified.length > 0 && (
                  <button onClick={() => setConfirmAction({ type: 'cleanupExpired', count: expiredUnverified.length })} style={{
                    fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700,
                    background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)',
                    color: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                  }}>
                    Supprimer +7 j ({expiredUnverified.length})
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
                            fontFamily: FONTS.mono, fontSize: 10, flexShrink: 0,
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
                            flex: 1, padding: '9px 0',
                            fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                            background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)',
                            color: '#04120e', borderRadius: 10, cursor: 'pointer',
                          }}>
                            Vérifier manuellement
                          </button>
                          <button onClick={() => setConfirmAction({ type: 'deleteUnverified', uid: u.uid, name: getDisplayName(u) })} style={{
                            flex: 1, padding: '9px 0',
                            fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                            background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)',
                            color: '#fff', borderRadius: 10, cursor: 'pointer',
                          }}>
                            Supprimer
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
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: duplicateGroups.length > 0 ? COLORS.pink : COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  Doublons ({duplicateGroups.length})
                </p>
                {duplicateGroups.length > 0 && (
                  <button onClick={() => setConfirmAction({ type: 'cleanupDuplicates', count: duplicateGroups.length })} style={{
                    fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700,
                    background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)',
                    color: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                  }}>
                    Nettoyer les fantômes
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
                            <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: i === 0 ? COLORS.teal : COLORS.dim }}>
                              {i === 0 ? 'À garder' : 'Doublon'} · {formatDate(u.createdAt)}
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
            EVENTS — vue admin de tous les événements publiés
        ══════════════════════════════════════════════ */}
        {tab === 'events' && (() => {
          const now = Date.now()
          // Détermine si event est passé (event.date + endTime < now)
          function isPast(ev) {
            if (!ev.date) return false
            try {
              const endTime = ev.endTime || ev.time || '23:59'
              const [h, m] = endTime.split(':').map(Number)
              const d = new Date(ev.date + 'T00:00:00')
              d.setHours(h, m, 0, 0)
              const startTime = ev.time || '00:00'
              const [sh, sm] = startTime.split(':').map(Number)
              if (h < sh || (h === sh && m < sm)) d.setDate(d.getDate() + 1)
              return d.getTime() < now
            } catch { return false }
          }
          const filtered = allEvents
            .filter(ev => {
              if (eventsFilter === 'cancelled') return ev.cancelled
              if (eventsFilter === 'past') return !ev.cancelled && isPast(ev)
              if (eventsFilter === 'upcoming') return !ev.cancelled && !isPast(ev)
              return true
            })
            .filter(ev => {
              if (!eventsSearch.trim()) return true
              const q = eventsSearch.toLowerCase()
              return (ev.name || '').toLowerCase().includes(q) ||
                     (ev.organizer || '').toLowerCase().includes(q) ||
                     (ev.organizerName || '').toLowerCase().includes(q) ||
                     (ev.city || '').toLowerCase().includes(q)
            })
            .sort((a, b) => {
              // Annulés à la fin, puis par date proche
              if (a.cancelled !== b.cancelled) return a.cancelled ? 1 : -1
              return new Date(a.date || 0) - new Date(b.date || 0)
            })

          const totalUpcoming = allEvents.filter(ev => !ev.cancelled && !isPast(ev)).length
          const totalPast     = allEvents.filter(ev => !ev.cancelled && isPast(ev)).length
          const totalCancelled = allEvents.filter(ev => ev.cancelled).length

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
              {/* Stats rapides */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                {[
                  { label: 'Total',      value: allEvents.length, color: COLORS.gold },
                  { label: 'À venir',    value: totalUpcoming,    color: '#4ee8c8' },
                  { label: 'Passés',     value: totalPast,        color: COLORS.dim },
                  { label: 'Annulés',    value: totalCancelled,   color: '#ef4444' },
                ].map(s => (
                  <div key={s.label} style={{ ...CARD, padding: '10px 8px', textAlign: 'center' }}>
                    <p style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 300, color: s.color, margin: 0 }}>{s.value}</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.dim, marginTop: 2, margin: '2px 0 0' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Recherche */}
              <input
                type="text"
                placeholder="Rechercher par nom, organisateur, ville…"
                value={eventsSearch}
                onChange={e => setEventsSearch(e.target.value)}
                style={inputStyle}
              />

              {/* Filtres pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'all',       label: 'Tous',     count: allEvents.length },
                  { key: 'upcoming',  label: 'À venir',  count: totalUpcoming },
                  { key: 'past',      label: 'Passés',   count: totalPast },
                  { key: 'cancelled', label: 'Annulés',  count: totalCancelled },
                ].map(f => {
                  const active = eventsFilter === f.key
                  return (
                    <button key={f.key} onClick={() => setEventsFilter(f.key)} style={{
                      padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                      fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
                      border: active ? '1px solid rgba(200,169,110,0.45)' : '1px solid rgba(255,255,255,0.10)',
                      background: active ? 'rgba(200,169,110,0.15)' : 'rgba(255,255,255,0.03)',
                      color: active ? COLORS.gold : COLORS.dim,
                    }}>
                      {f.label} {f.count > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>{f.count}</span>}
                    </button>
                  )
                })}
              </div>

              {/* Liste des events */}
              {filtered.length === 0 ? (
                <div style={{ ...CARD, padding: 32, textAlign: 'center' }}>
                  <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.muted, margin: 0 }}>
                    {allEvents.length === 0 ? 'Aucun événement publié' : 'Aucun résultat'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filtered.map(ev => {
                    const past = isPast(ev)
                    const status = ev.cancelled ? 'cancelled' : past ? 'past' : 'upcoming'
                    const statusStyle = status === 'cancelled'
                      ? { color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.10)' }
                      : status === 'past'
                      ? { color: COLORS.dim, borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }
                      : { color: '#4ee8c8', borderColor: 'rgba(78,232,200,0.35)', background: 'rgba(78,232,200,0.08)' }
                    const statusLabel = status === 'cancelled' ? 'Annulé' : status === 'past' ? 'Passé' : 'À venir'
                    return (
                      <div key={ev.id} style={{ ...CARD, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                        {/* Image */}
                        <div style={{
                          width: 56, height: 56, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {ev.imageUrl ? (
                            <img src={ev.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                          )}
                        </div>
                        {/* Infos */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 400, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.name}
                            </p>
                            <span style={{
                              flexShrink: 0,
                              padding: '2px 7px', borderRadius: 3, border: '1px solid',
                              fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
                              ...statusStyle,
                            }}>
                              {statusLabel}
                            </span>
                          </div>
                          <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.dateDisplay || ev.date} {ev.city ? `· ${ev.city}` : ''} · {ev.organizerName || ev.organizer || '—'}
                          </p>
                          {/* Contexte d'annulation : quand + message de l'organisateur */}
                          {ev.cancelled && (
                            <p style={{ fontFamily: FONTS.display, fontSize: 11, color: 'rgba(255,140,140,0.85)', margin: '4px 0 0', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              Annulé{ev.cancelledAt ? ` le ${(() => { try { return new Date(ev.cancelledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) } catch { return '' } })()}` : ''}
                              {ev.cancellationMessage ? ` — « ${ev.cancellationMessage} »` : ' — aucun message aux participants'}
                            </p>
                          )}
                        </div>
                        {/* Action */}
                        <button
                          onClick={() => navigate(`/evenements/${ev.id}`)}
                          style={{
                            padding: '8px 14px', borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                            fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600,
                            color: 'rgba(255,255,255,0.9)',
                          }}>
                          Voir
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

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
                  placeholder="Nom, email, téléphone…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {/* Role filters */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {[
                  { key: 'all',          label: 'Tous' },
                  { key: 'user',         label: 'Utilisateurs' },
                  { key: 'prestataire',  label: 'Prestataires' },
                  { key: 'organisateur', label: 'Organisateurs' },
                  { key: 'agent',        label: 'Agents' },
                ].map(f => (
                  <button key={f.key} onClick={() => setRoleFilter(f.key)}
                    style={{
                      flexShrink: 0, padding: '4px 10px', borderRadius: 4,
                      fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em',
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
                      fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em',
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
                <p style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 16, color: '#fff', margin: 0 }}>
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
                      {getProviderCategories(u).length > 0 && (u.prestataireType || u.prestataireTypes?.length) && (
                        <span style={{
                          fontFamily: FONTS.mono, fontSize: 10,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                          borderRadius: 4, padding: '2px 6px', color: COLORS.dim,
                        }}>
                          {getProviderCategories(u).map(category => category.singular).join(' · ')}
                        </span>
                      )}
                    </div>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 6 }}>
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
                      flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.14)',
                      background: '#c2347f',
                      color: '#fff',
                      fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                    }}>
                    Refuser
                  </button>
                  <button
                    onClick={() => setConfirmAction({ type: 'approve', uid: u.uid, name: u.name })}
                    style={{
                      flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                      background: '#3ed6b5',
                      border: '1px solid rgba(255,255,255,0.14)',
                      color: '#04120e',
                      fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                    }}>
                    Valider
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            DEMANDES DE RÔLE — affichées dans l'onglet Dossiers.
            (Elles étaient comptées dans « en attente » mais leur UI de
            traitement était désactivée : intraitables pour toujours.)
        ══════════════════════════════════════════════ */}
        {tab === 'dossiers' && roleRequests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.gold, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Demandes de rôle ({roleRequests.length})
            </p>
            {roleRequests.map(req => {
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
                        <span style={{ fontFamily: FONTS.mono, fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.08)', color: '#22c55e' }}>
                          Client
                        </span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                        {/* Requested role */}
                        <span style={{ fontFamily: FONTS.mono, fontSize: 10, padding: '2px 6px', borderRadius: 4, border: `1px solid ${roleCfg.color}44`, background: roleCfg.color + '14', color: roleCfg.color }}>
                          {roleCfg.label}
                        </span>
                        {(req.prestataireType || req.prestataireTypes?.length) && (
                          <span style={{ fontFamily: FONTS.mono, fontSize: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '2px 6px', color: COLORS.dim }}>
                            {getProviderCategories(req).map(category => category.singular).join(' · ')}
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 6 }}>
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
                        flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: '#c2347f',
                        color: '#fff',
                        fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                      }}>
                      Refuser
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: 'approveRole', id: req.id, name: req.name, role: roleCfg.label })}
                      style={{
                        flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                        background: '#3ed6b5',
                        border: '1px solid rgba(255,255,255,0.14)',
                        color: '#04120e',
                        fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
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
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: active ? sec.color : COLORS.dim, margin: 0, letterSpacing: '0.04em', lineHeight: 1.3, textTransform: 'uppercase' }}>{sec.label}</p>
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
                  <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={dossierSearch}
                    onChange={e => setDossierSearch(e.target.value)}
                    placeholder={`Rechercher dans « ${sec.label} »…`}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: '#0b0c12',
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
                  const type = getProviderCategories(a.formData || {}).map(category => `${category.id} ${category.label}`).join(' ').toLowerCase()
                  return name.includes(q) || email.includes(q) || type.includes(q)
                })
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
              if (list.length === 0) return (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <p style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 16, color: '#fff', margin: '0 0 8px' }}>
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
              const openApp = (app) => { setSelectedApp(app); setAppNote(''); setAppAdminNote(''); setActiveAction(null); setAdminNoteInput('') }
              const typeLabel = (app) => app.type === 'organisateur' ? 'Organisateur' : `Prestataire · ${getProviderCategories(app.formData || {}).map(category => category.singular).join(' · ')}`
              const scoreColor = (s) => s >= 80 ? COLORS.teal : s >= 50 ? COLORS.gold : COLORS.pink

              const AppCard = (app) => {
                const score = getCompleteness(app)
                return (
                  <button key={app.id} onClick={() => openApp(app)}
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
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '1px 0 0' }}>
                          {typeLabel(app)}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: scoreColor(score), fontWeight: 700 }}>{score}%</span>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '1px 0 0' }}>complétude</p>
                      </div>
                    </div>
                    {/* Row 2: email + date */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>{app.email}</span>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>
                        {app.submittedAt ? `Soumis le ${new Date(app.submittedAt).toLocaleDateString('fr-FR')}` : `Créé le ${new Date(app.createdAt).toLocaleDateString('fr-FR')}`}
                      </span>
                    </div>
                    {/* Row 3: correction note if needs_changes */}
                    {app.status === 'needs_changes' && app.requestedChanges && (
                      <div style={{ padding: '7px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.25)' }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#f59e0b', margin: 0, lineHeight: 1.5 }}>
                          {app.requestedChanges}
                        </p>
                      </div>
                    )}
                    {/* completeness bar */}
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${score}%`, borderRadius: 99, background: scoreColor(score) }} />
                    </div>
                  </button>
                )
              }

              // ── Regroupement par email : un même compte (orga + prestataire)
              // forme UN bloc visuel, chaque dossier reste cliquable → détail.
              const groups = []
              const byEmail = new Map()
              for (const app of list) {
                const key = (app.email || app.id || '').toLowerCase()
                if (byEmail.has(key)) byEmail.get(key).push(app)
                else { const arr = [app]; byEmail.set(key, arr); groups.push({ email: app.email, apps: arr }) }
              }

              return groups.map(g => {
                if (g.apps.length === 1) return AppCard(g.apps[0])
                return (
                  <div key={g.email} style={{ ...CARD, padding: 0, overflow: 'hidden', borderColor: sectionColor + '44' }}>
                    {/* En-tête du groupe : le compte */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: sectionColor + '0d', borderBottom: `1px solid ${sectionColor}22` }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: sectionColor + '18', border: `1px solid ${sectionColor}44`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: FONTS.display, fontSize: 13, fontWeight: 800, color: sectionColor,
                      }}>
                        {(g.email || '?')[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: FONTS.display, fontSize: 13.5, fontWeight: 700, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.email}</p>
                        <p style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.dim, margin: '1px 0 0' }}>Même compte · plusieurs activités</p>
                      </div>
                      <span style={{ flexShrink: 0, fontFamily: FONTS.display, fontSize: 10.5, fontWeight: 800, color: sectionColor, background: sectionColor + '1a', border: `1px solid ${sectionColor}44`, borderRadius: 999, padding: '2px 9px' }}>
                        {g.apps.length} dossiers
                      </span>
                    </div>
                    {/* Un rang compact par dossier */}
                    {g.apps.map((app, i) => {
                      const score = getCompleteness(app)
                      return (
                        <button key={app.id} onClick={() => openApp(app)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                            padding: '11px 14px', cursor: 'pointer', background: 'none', border: 'none',
                            borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                          }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                            background: sectionColor + '14', border: `1px solid ${sectionColor}33`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: FONTS.display, fontSize: 12, fontWeight: 800, color: sectionColor,
                          }}>
                            {(app.formData?.nomCommercial || app.name)?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: FONTS.display, fontSize: 13.5, fontWeight: 600, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {app.formData?.nomCommercial || app.name}
                            </p>
                            <p style={{ fontFamily: FONTS.display, fontSize: 10.5, color: COLORS.dim, margin: '1px 0 0' }}>{typeLabel(app)}</p>
                          </div>
                          <span style={{ flexShrink: 0, fontFamily: FONTS.display, fontSize: 11, fontWeight: 700, color: scoreColor(score) }}>{score}%</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                      )
                    })}
                  </div>
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
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={() => setSelectedUser(null)} />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 520,
            background: '#12131c',
            border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
            borderRadius: '16px 16px 0 0',
            maxHeight: '85vh', overflowY: 'auto',
            paddingBottom: 32,
          }}>
            {/* Handle + header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              position: 'sticky', top: 0,
              background: '#12131c', zIndex: 10,
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
                <InfoRow label="Inscrit le" value={formatDate(selectedUser.createdAt)} />
                {(selectedUser.prestataireType || selectedUser.prestataireTypes?.length) && (
                  <InfoRow label="Activités" value={getProviderCategories(selectedUser).map(category => category.singular).join(' · ')} />
                )}
              </Section>

              {/* Connexion — état RÉEL Firebase Auth (ce que vit l'utilisateur au login),
                  pas le miroir Firestore qui peut être en avance/retard. */}
              <Section title="Connexion">
                {!authInfo ? (
                  <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>Lecture de l'état de connexion…</p>
                ) : authInfo.localMode ? (
                  <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>Mode local (sans Firebase) — pas de couche Auth.</p>
                ) : authInfo.error ? (
                  <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#e05aaa', margin: 0 }}>État de connexion indisponible : {authInfo.error}</p>
                ) : authInfo.missing ? (
                  <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#e05aaa', margin: 0, lineHeight: 1.5 }}>
                    Ce compte n'existe pas dans Firebase Auth — l'utilisateur ne peut pas se connecter.
                    Supprime cette fiche et laisse la personne se réinscrire.
                  </p>
                ) : (
                  <>
                    {authInfo.email && authInfo.email !== (selectedUser.email || '').toLowerCase() && (
                      <p style={{
                        fontFamily: FONTS.mono, fontSize: 11, color: '#f59e0b', margin: '0 0 8px', lineHeight: 1.5,
                        padding: '8px 10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8,
                      }}>
                        L'email de CONNEXION est {authInfo.email} — différent de la fiche. C'est avec celui-là que la personne se connecte.
                      </p>
                    )}
                    <InfoRow label="Email vérifié" value={authInfo.emailVerified ? 'Oui' : 'NON — connexion bloquée'} />
                    <InfoRow label="Connexion" value={authInfo.disabled ? 'DÉSACTIVÉE (suspendu)' : 'Autorisée'} />
                    <InfoRow label="Dernière connexion" value={authInfo.lastLoginAt ? new Date(authInfo.lastLoginAt).toLocaleDateString('fr-FR') : 'Jamais'} />
                    {!authInfo.emailVerified && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          disabled={authBusy}
                          onClick={() => handleVerifyEmail(selectedUser.uid)}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 10, cursor: authBusy ? 'wait' : 'pointer',
                            background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)',
                            color: '#04120e', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                            opacity: authBusy ? 0.6 : 1,
                          }}>
                          Marquer l'email vérifié
                        </button>
                        <button
                          disabled={authBusy}
                          onClick={() => handleSendVerification(selectedUser.uid)}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 10, cursor: authBusy ? 'wait' : 'pointer',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                            color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600,
                            opacity: authBusy ? 0.6 : 1,
                          }}>
                          Renvoyer le lien
                        </button>
                      </div>
                    )}
                  </>
                )}
              </Section>

              {/* Coordonnées — numéros & adresses de toutes les interfaces, clairement distingués */}
              {(() => {
                const roles = selectedUser.enabledRoles || [selectedUser.role]
                const isPro = roles.includes('organisateur') || roles.includes('prestataire')
                  || selectedUser.role === 'organisateur' || selectedUser.role === 'prestataire'
                const userApps = applications.filter(a => a.uid === selectedUser.uid)
                return (
                  <Section title="Coordonnées">
                    {/* Numéros */}
                    <ContactRow label="Téléphone" value={selectedUser.phone} tag="Perso" tagColor={COLORS.teal} />
                    {isPro && <ContactRow label="Téléphone" value={selectedUser.proPhone} tag="Pro" tagColor={COLORS.gold} />}
                    {isPro && (
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '6px 0 0', lineHeight: 1.5 }}>
                        Le numéro pro est unique par compte, partagé entre les interfaces organisateur et prestataire.
                      </p>
                    )}
                    {/* Adresses issues des dossiers (une par interface) */}
                    {userApps.map(app => {
                      const fd = app.formData || {}
                      const roleLabel = app.type === 'organisateur' ? 'Organisateur' : 'Prestataire'
                      const roleColor = app.type === 'organisateur' ? COLORS.gold : COLORS.pink
                      const ville = [fd.ville, fd.pays].filter(Boolean).join(', ')
                      const addr = app.type === 'organisateur'
                        ? (fd.noFixedAddress ? 'Pas de lieu fixe (en ligne / itinérant)' : (fd.adresseEtablissement || ''))
                        : (fd.adresseLieu || '')
                      if (!ville && !addr) return null
                      return (
                        <div key={app.id} style={{ marginTop: 10 }}>
                          {addr && <AddressRow label="Adresse" value={addr} tag={roleLabel} tagColor={roleColor} />}
                          {ville && <ContactRow label="Ville" value={ville} tag={roleLabel} tagColor={roleColor} />}
                        </div>
                      )
                    })}
                  </Section>
                )
              })()}

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
                          <button onClick={handleSaveEdit} aria-label="Enregistrer" style={{
                            padding: '0 14px', borderRadius: 10, cursor: 'pointer',
                            background: '#3ed6b5',
                            border: '1px solid rgba(255,255,255,0.14)', color: '#04120e',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}><IconCheck size={14} color="#04120e" /></button>
                          <button onClick={() => setEditField(null)} aria-label="Annuler" style={{
                            padding: '0 14px', borderRadius: 10, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                            color: 'rgba(255,255,255,0.7)', fontFamily: FONTS.mono, fontSize: 15,
                          }}>×</button>
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
                            <span style={{ marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}><IconEdit size={12} color="rgba(255,255,255,0.35)" /></span>
                          </span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {/* Password */}
              <Section title="Mot de passe">
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', ...CARD,
                }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted }}>Générer un nouveau mot de passe</span>
                  <button
                    onClick={async () => {
                      try {
                        const { USE_REAL_FIREBASE, auth } = await import('../firebase')
                        if (USE_REAL_FIREBASE && selectedUser.email) {
                          // L'email de connexion RÉEL peut différer de la fiche Firestore —
                          // le lien doit partir vers celui avec lequel la personne se connecte.
                          const target = authInfo?.email || selectedUser.email
                          // Endpoint brandé (noreply@liveinblack.com via Resend) : l'email
                          // Firebase par défaut part de firebaseapp.com et finit en spam.
                          const r = await fetch('/api/send-password-reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: target }),
                          })
                          if (!r.ok) {
                            const { sendPasswordResetEmail } = await import('firebase/auth')
                            await sendPasswordResetEmail(auth, target)
                          }
                          showToast(`Lien de réinitialisation envoyé à ${target}`)
                        } else {
                          // Mode local (sans Firebase) : mot de passe régénéré dans le cache.
                          const newPwd = 'LIB' + Math.random().toString(36).slice(2, 8).toUpperCase()
                          updateAccount(selectedUser.uid, { password: newPwd })
                          showToast(`Nouveau mot de passe (local) : ${newPwd}`)
                        }
                      } catch {
                        showToast('Envoi du lien impossible — réessaie.', 'error')
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
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
                  Envoie un lien de réinitialisation à l'email de connexion du compte.
                </p>
              </Section>

              {/* Account actions */}
              <Section title="Actions compte">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedUser.status === 'banned' ? (
                    <button onClick={() => handleReactivate(selectedUser.uid)} style={{
                      width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                      background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)',
                      color: '#04120e', fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                    }}>
                      Réactiver le compte
                    </button>
                  ) : selectedUser.status === 'active' ? (
                    <button onClick={() => setConfirmAction({ type: 'ban', uid: selectedUser.uid, name: selectedUser.name })} style={{
                      width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                      background: 'rgba(200,169,110,0.14)', border: '1px solid rgba(200,169,110,0.55)',
                      color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                    }}>
                      Suspendre le compte
                    </button>
                  ) : null}
                  <button onClick={() => setConfirmAction({ type: 'delete', uid: selectedUser.uid, name: selectedUser.name })} style={{
                    width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                    background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)',
                    color: '#fff', fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
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
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={() => setSelectedApp(null)} />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 520,
            background: '#12131c',
            border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
            borderRadius: '16px 16px 0 0',
            maxHeight: '88vh', overflowY: 'auto',
            paddingBottom: 32,
          }}>
            {/* Handle */}
            <div style={{
              padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              position: 'sticky', top: 0, background: '#12131c', zIndex: 10,
            }}>
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONTS.display, fontWeight: 400, fontSize: 18, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedApp.formData?.nomCommercial || selectedApp.name}
                  </p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '2px 0 0' }}>
                    {selectedApp.email} · {selectedApp.type === 'prestataire'
                      ? `Prestataire · ${getProviderCategories(selectedApp.formData || {}).map(category => category.singular).join(' · ')}`
                      : selectedApp.type}
                  </p>
                </div>
                {(() => {
                  const cfg = APPLICATION_STATUSES[selectedApp.status] || {}
                  return (
                    <span style={{
                      fontFamily: FONTS.mono, fontSize: 10, padding: '3px 8px', borderRadius: 4,
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
                      <div style={{ height: '100%', borderRadius: 99, width: `${score}%`, background: color }} />
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
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#a78bfa', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {selectedApp.status === 'resubmitted' ? 'Message joint à la re-soumission' : 'Message joint à la soumission'}
                    </p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                      « {selectedApp.candidateNote} »
                    </p>
                  </div>
                </Section>
              )}

              {/* Form data summary */}
              <Section title="Informations formulaire">
                {(() => {
                  const fd = selectedApp.formData || {}
                  const type = selectedApp.type
                  const pts = getProviderTypes(fd)

                  const FR = ({ label, value, href, mono }) => !value ? null : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, flexShrink: 0, minWidth: 120, paddingTop: 1 }}>{label}</span>
                      {href
                        ? <a href={href} target="_blank" rel="noreferrer" style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.teal, wordBreak: 'break-all', flex: 1 }}>{value}</a>
                        : <span style={{ fontFamily: mono === false ? FONTS.display : FONTS.mono, fontSize: 10, color: COLORS.muted, wordBreak: 'break-all', flex: 1, lineHeight: 1.5 }}>{value}</span>
                      }
                    </div>
                  )

                  const Sub = ({ title }) => (
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.40)', margin: '12px 0 6px', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {title}
                    </p>
                  )

                  const TARIF_TYPES = { soiree: 'Par soirée / événement', heure: 'Par heure', journee: 'Par journée', forfait: 'Au forfait', personne: 'Par personne' }
                  const EXP_LABELS = { moins_1: '< 1 an', '1_3': '1–3 ans', '3_5': '3–5 ans', '5_10': '5–10 ans', plus_10: '> 10 ans' }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {/* Common fields */}
                      {type === 'prestataire' && pts.length > 0 && (
                        <FR label="Activités prestataire" value={getProviderCategories(fd).map(category => category.singular).join(' · ')} />
                      )}
                      <FR label="Nom" value={[fd.prenom, fd.nom].filter(Boolean).join(' ')} />
                      <FR label="Téléphone" value={fd.telephoneCode ? `${fd.telephoneCode} ${fd.telephone}` : fd.telephone} />
                      <FR label="Ville" value={[fd.ville, fd.pays].filter(Boolean).join(', ')} />
                      {type === 'prestataire' && pts.includes('artiste') && fd.nomScene && (
                        <FR label="Nom de scène" value={fd.nomScene} />
                      )}
                      <FR label="Nom commercial" value={fd.nomCommercial} />
                      <FR label="SIRET" value={fd.siret} />
                      <FR label="Site web / Instagram" value={fd.siteWeb} href={fd.siteWeb?.startsWith('http') ? fd.siteWeb : undefined} />
                      <FR label="Zones d'intervention" value={
                        Array.isArray(fd.zonesIntervention) && fd.zonesIntervention.length
                          ? fd.zonesIntervention.map(id => {
                              const r = [{ id: 'international', name: 'International', flag: '🌍' },
                                { id: 'cote-divoire', name: "Côte d'Ivoire", flag: '🇨🇮' },
                                { id: 'ghana', name: 'Ghana', flag: '🇬🇭' },
                                { id: 'togo', name: 'Togo', flag: '🇹🇬' },
                                { id: 'benin', name: 'Bénin', flag: '🇧🇯' },
                                { id: 'france', name: 'France', flag: '🇫🇷' },
                                { id: 'amerique', name: 'Amérique', flag: '🌎' },
                              ].find(x => x.id === id)
                              return r ? `${r.flag} ${r.name}` : id
                            }).join('  ·  ')
                          : (fd.zoneIntervention || '—')
                      } />
                      <FR label="Description" value={fd.description} />

                      {/* ── Artiste ── */}
                      {pts.includes('artiste') && (
                        <>
                          <Sub title="Artiste" />
                          {fd.typeArtiste && (
                            <FR label="Type d'artiste" value={{
                              dj: 'DJ', musicien_live: 'Musicien live / Band',
                              danseur: 'Danseur / Danseuse', performeur: 'Performeur / Show',
                              dj_sax: 'DJ-Saxophoniste', orchestre: 'Orchestre / Groupe',
                              animateur: 'Animateur / MC', humoriste: 'Humoriste / Stand-up', autre: 'Autre',
                            }[fd.typeArtiste] || fd.typeArtiste} />
                          )}
                          <FR label="Styles / Spécialités" value={fd.styles} />
                          <FR label="Expérience" value={EXP_LABELS[fd.anneesExperience] || fd.anneesExperience} />
                          <FR label="Statut facturation" value={fd.statutFacturation} />
                          <FR label="Portfolio" value={fd.portfolio} href={fd.portfolio?.startsWith('http') ? fd.portfolio : undefined} />
                          <FR label="Instagram" value={fd.instagram} />
                          {fd.besoinstechniques && <FR label="Rider technique" value={fd.besoinstechniques} />}
                        </>
                      )}

                      {/* ── Salle ── */}
                      {pts.includes('salle') && (
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
                      {pts.includes('materiel') && (
                        <>
                          <Sub title="Matériel" />
                          <FR label="Catégories" value={fd.categoriesMateriel} />
                          {fd.inventaire && <FR label="Inventaire" value={fd.inventaire} />}
                          <FR label="Conditions location" value={fd.conditionsLocation} />
                          <FR label="Politique caution" value={fd.politiqueCaution} />
                        </>
                      )}

                      {/* ── Food ── */}
                      {pts.includes('food') && (
                        <>
                          <Sub title="Food / Boissons" />
                          <FR label="Type activité" value={fd.typeActiviteFood} />
                          {fd.menuBase && <FR label="Menu / Carte" value={fd.menuBase} />}
                          <FR label="Alcool" value={fd.alcoolFood ? 'Oui — vérifier la licence alcool' : 'Non'} />
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
                            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.name}{entry.size ? ` · ${Math.round(entry.size / 1024)}ko` : ''}
                            </p>
                          </div>
                          {entry.url ? (
                            <a href={entry.url} target="_blank" rel="noreferrer"
                              style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.teal, textDecoration: 'none', padding: '4px 8px', border: '1px solid rgba(78,232,200,0.25)', borderRadius: 4 }}>
                              Voir →
                            </a>
                          ) : (
                            <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>Local</span>
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
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '0 0 10px', lineHeight: 1.5 }}>
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
                              {note.done ? <IconCheck size={11} color={COLORS.teal} /> : null}
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
                        placeholder="Ajouter une note…"
                        style={{
                          flex: 1, background: '#0b0c12',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 10, color: '#fff',
                          fontFamily: FONTS.mono, fontSize: 11,
                          padding: '8px 10px', outline: 'none',
                        }}
                      />
                      <button
                        onClick={addNote}
                        disabled={!adminNoteInput.trim()}
                        style={{
                          flexShrink: 0, padding: '8px 14px', borderRadius: 10, cursor: adminNoteInput.trim() ? 'pointer' : 'not-allowed',
                          background: adminNoteInput.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.07)',
                          border: adminNoteInput.trim() ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(255,255,255,0.06)',
                          color: adminNoteInput.trim() ? '#fff' : 'rgba(255,255,255,0.35)',
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
                        width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                        background: '#3ed6b5',
                        border: '1px solid rgba(255,255,255,0.14)',
                        color: '#04120e',
                        fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                      }}>
                      Approuver le dossier
                    </button>
                    {activeAction === 'approve' && (
                      <div style={{ padding: '12px 14px', background: 'rgba(34,197,94,0.05)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.18)', marginTop: -4 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#22c55e', margin: '0 0 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          Message d'approbation (optionnel)
                        </p>
                        <textarea
                          value={appNote}
                          onChange={e => setAppNote(e.target.value)}
                          placeholder="Ex : Votre dossier a été approuvé. Bienvenue sur LIVEINBLACK."
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            background: '#0b0c12', border: '1px solid rgba(34,197,94,0.25)',
                            borderRadius: 6, color: '#fff', fontFamily: FONTS.mono, fontSize: 11,
                            padding: '9px 12px', outline: 'none', resize: 'vertical', minHeight: 64, lineHeight: 1.5,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => setActiveAction(null)} style={{
                            flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                            color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600,
                          }}>Annuler</button>
                          <button onClick={() => handleAppAction(selectedApp.id, 'approved', appNote)} style={{
                            flex: 2, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                            background: '#3ed6b5',
                            border: '1px solid rgba(255,255,255,0.14)', color: '#04120e',
                            fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                          }}>Confirmer l'approbation</button>
                        </div>
                      </div>
                    )}

                    {/* DEMANDER DES CORRECTIONS */}
                    <button
                      onClick={() => setActiveAction(a => a === 'changes' ? null : 'changes')}
                      style={{
                        width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                        background: 'rgba(245,158,11,0.14)',
                        border: '1px solid rgba(245,158,11,0.55)',
                        color: '#f5b04b',
                        fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                      }}>
                      Demander des corrections
                    </button>
                    {activeAction === 'changes' && (
                      <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.04)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.20)', marginTop: -4 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#f59e0b', margin: '0 0 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          Corrections requises *
                        </p>
                        <textarea
                          value={appNote}
                          onChange={e => setAppNote(e.target.value)}
                          placeholder="Ex : Merci de renvoyer une pièce d'identité valide et de compléter la section activité."
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            background: '#0b0c12', border: '1px solid rgba(245,158,11,0.25)',
                            borderRadius: 6, color: '#fff', fontFamily: FONTS.mono, fontSize: 11,
                            padding: '9px 12px', outline: 'none', resize: 'vertical', minHeight: 80, lineHeight: 1.5,
                          }}
                        />
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '6px 0 8px', lineHeight: 1.5 }}>
                          Ce message sera visible par le candidat depuis son espace.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setActiveAction(null)} style={{
                            flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                            color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600,
                          }}>Annuler</button>
                          <button
                            onClick={() => { if (appNote.trim()) handleAppAction(selectedApp.id, 'needs_changes', appNote) }}
                            disabled={!appNote.trim()}
                            style={{
                              flex: 2, padding: '9px 0', borderRadius: 10, cursor: appNote.trim() ? 'pointer' : 'not-allowed',
                              background: appNote.trim() ? '#f59e0b' : 'rgba(255,255,255,0.07)',
                              border: appNote.trim() ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(255,255,255,0.06)',
                              color: appNote.trim() ? '#241703' : 'rgba(255,255,255,0.35)',
                              fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                            }}>Envoyer les corrections</button>
                        </div>
                      </div>
                    )}

                    {/* PASSER EN RÉVISION (action directe) */}
                    {(selectedApp.status === 'submitted' || selectedApp.status === 'resubmitted') && (
                      <button
                        onClick={() => handleAppAction(selectedApp.id, 'under_review', appAdminNote)}
                        style={{
                          width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                          background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.55)',
                          color: '#7fb3f9',
                          fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                        }}>
                        Passer en révision
                      </button>
                    )}

                    {/* REFUSER */}
                    <button
                      onClick={() => setActiveAction(a => a === 'reject' ? null : 'reject')}
                      style={{
                        width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                        background: '#c2347f',
                        border: '1px solid rgba(255,255,255,0.14)',
                        color: '#fff',
                        fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                      }}>
                      Refuser le dossier
                    </button>
                    {activeAction === 'reject' && (
                      <div style={{ padding: '12px 14px', background: 'rgba(224,90,170,0.04)', borderRadius: 8, border: '1px solid rgba(224,90,170,0.20)', marginTop: -4 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.pink, margin: '0 0 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          Motif de refus (optionnel)
                        </p>
                        <textarea
                          value={appNote}
                          onChange={e => setAppNote(e.target.value)}
                          placeholder="Ex : Le dossier ne correspond pas aux critères d'éligibilité."
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            background: '#0b0c12', border: '1px solid rgba(224,90,170,0.25)',
                            borderRadius: 6, color: '#fff', fontFamily: FONTS.mono, fontSize: 11,
                            padding: '9px 12px', outline: 'none', resize: 'vertical', minHeight: 64, lineHeight: 1.5,
                          }}
                        />
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '6px 0 8px', lineHeight: 1.5 }}>
                          Ce motif sera visible par le candidat depuis son espace.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setActiveAction(null)} style={{
                            flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                            color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600,
                          }}>Annuler</button>
                          <button onClick={() => handleAppAction(selectedApp.id, 'rejected', appNote)} style={{
                            flex: 2, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                            background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)',
                            color: '#fff', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                          }}>Confirmer le refus</button>
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
                      Le candidat a été notifié des corrections à apporter. Le dossier repassera en « En attente » une fois re-soumis.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveAction(a => a === 'reject' ? null : 'reject')}
                    style={{
                      width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                      background: '#c2347f',
                      border: '1px solid rgba(255,255,255,0.14)',
                      color: '#fff',
                      fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                    }}>
                    Refuser définitivement
                  </button>
                  {activeAction === 'reject' && (
                    <div style={{ padding: '12px 14px', background: 'rgba(224,90,170,0.04)', borderRadius: 8, border: '1px solid rgba(224,90,170,0.20)', marginTop: 8 }}>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.pink, margin: '0 0 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Motif de refus (optionnel)
                      </p>
                      <textarea
                        value={appNote}
                        onChange={e => setAppNote(e.target.value)}
                        placeholder="Ex : Malgré les corrections demandées, le dossier ne répond pas aux critères."
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: '#0b0c12', border: '1px solid rgba(224,90,170,0.25)',
                          borderRadius: 6, color: '#fff', fontFamily: FONTS.mono, fontSize: 11,
                          padding: '9px 12px', outline: 'none', resize: 'vertical', minHeight: 64, lineHeight: 1.5,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => setActiveAction(null)} style={{
                          flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                          color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600,
                        }}>Annuler</button>
                        <button onClick={() => handleAppAction(selectedApp.id, 'rejected', appNote)} style={{
                          flex: 2, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                          background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)',
                          color: '#fff', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                        }}>Confirmer le refus</button>
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
                      width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                      background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)',
                      color: '#fff',
                      fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
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
                      width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                      background: '#3ed6b5',
                      border: '1px solid rgba(255,255,255,0.14)', color: '#04120e',
                      fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
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
                                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '0 0 2px', fontStyle: 'italic', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{entry.note}</p>
                                )}
                                {/* Admin message — highlighted */}
                                {isAdminNote && (
                                  <div style={{ padding: '5px 8px', background: color + '0d', border: `1px solid ${color}22`, borderRadius: 4, marginBottom: 4 }}>
                                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: color, margin: 0, lineHeight: 1.5, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>« {entry.note} »</p>
                                  </div>
                                )}
                                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: 0 }}>
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
              {confirmAction.type === 'markPaid'    && `Confirmer le reversement de ${confirmAction.label || '—'} à ${confirmAction.name} ? (à faire APRÈS avoir envoyé l'argent)`}
              {confirmAction.type === 'markPayoutPaid' && `Confirmer le versement de ${confirmAction.label || '—'} à ${confirmAction.name} ? (à faire APRÈS avoir envoyé l'argent sur son Mobile Money)`}
              {confirmAction.type === 'deleteUnverified' && `Supprimer définitivement le compte non vérifié de ${confirmAction.name} ?`}
              {confirmAction.type === 'cleanupExpired' && `Supprimer les ${confirmAction.count} compte(s) non vérifié(s) depuis plus de 7 jours ? (chaque compte sera re-vérifié auprès de Firebase Auth avant suppression)`}
              {confirmAction.type === 'cleanupDuplicates' && `Nettoyer les fiches fantômes des ${confirmAction.count} groupe(s) de doublons ? (seules les entrées SANS compte de connexion Firebase seront supprimées)`}
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmAction(null)} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600,
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
                  if (confirmAction.type === 'markPaid')    { handleMarkPaid(confirmAction.uid, confirmAction.amount, confirmAction.requestId, confirmAction.currency); setConfirmAction(null) }
                  if (confirmAction.type === 'markPayoutPaid') { handleMarkPayoutPaid(confirmAction.ep); setConfirmAction(null) }
                  if (confirmAction.type === 'deleteUnverified') { handleDeleteUnverified(confirmAction.uid); setConfirmAction(null) }
                  if (confirmAction.type === 'cleanupExpired') { handleCleanupExpired(); setConfirmAction(null) }
                  if (confirmAction.type === 'cleanupDuplicates') { handleCleanupDuplicates(); setConfirmAction(null) }
                }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                  fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                  ...((confirmAction.type === 'approve' || confirmAction.type === 'approveRole' || confirmAction.type === 'appApprove' || confirmAction.type === 'markPaid' || confirmAction.type === 'markPayoutPaid')
                    ? { background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)', color: '#04120e' }
                    : confirmAction.type === 'appChanges'
                    ? { background: '#f59e0b', border: '1px solid rgba(255,255,255,0.14)', color: '#241703' }
                    : { background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)', color: '#fff' }
                  ),
                }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          BOOSTS — créneaux Top 3 vendus + conflits
      ══════════════════════════════════════════════ */}
      {tab === 'boosts' && (() => {
        const now = Date.now()
        // Actif = non expiré ET non remboursé/annulé (aligné sur lib/boosts.js :
        // un boost refunded_conflict n'occupe plus de créneau public).
        const isRefunded = b => ['refunded_conflict', 'cancelled'].includes(b.status)
        const isActive = b => { try { return !isRefunded(b) && new Date(b.expiresAt).getTime() > now } catch { return false } }
        const active = adminBoosts.filter(isActive)
        const expired = adminBoosts.filter(b => !isActive(b))
        const conflicts = active.filter(b => b.conflict)
        // Revenu = encaissé NET : les boosts remboursés (conflit de créneau) et
        // annulés ne sont pas de l'argent que la plateforme possède.
        const totalRevenue = adminBoosts.filter(b => !isRefunded(b)).reduce((s, b) => s + (Number(b.price) || 0), 0)
        const eventName = id => allEvents.find(e => String(e.id) === String(id))?.name || `Event ${id}`
        const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '—' } }
        const BoostCard = (b) => (
          <div key={b.id} style={{ ...CARD, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, ...(b.conflict && isActive(b) ? { borderColor: 'rgba(220,50,50,0.5)' } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: FONTS.display, fontSize: 11, fontWeight: 800, color: '#0b0d14', background: COLORS.gold, borderRadius: 999, padding: '2px 9px' }}>Top {b.position}</span>
              <span style={{ fontFamily: FONTS.display, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.07)', borderRadius: 999, padding: '2px 9px' }}>{b.region || 'Toutes régions'}</span>
              {b.conflict && isActive(b) && (
                <span style={{ fontFamily: FONTS.display, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#fff', background: 'rgba(220,50,50,0.85)', borderRadius: 999, padding: '2px 9px' }}>CONFLIT DE CRÉNEAU</span>
              )}
              <span style={{ marginLeft: 'auto', fontFamily: FONTS.display, fontWeight: 800, fontSize: 15, color: COLORS.gold }}>{Number(b.price) || 0}€</span>
            </div>
            <p style={{ fontFamily: FONTS.display, fontSize: 14.5, fontWeight: 700, color: '#fff', margin: 0 }}>{eventName(b.eventId)}</p>
            <p style={{ fontFamily: FONTS.display, fontSize: 11.5, color: COLORS.muted, margin: 0 }}>
              Acheté le {fmtDate(b.purchasedAt)} · expire le {fmtDate(b.expiresAt)} · {b.days} jour{b.days > 1 ? 's' : ''}
            </p>
            {b.conflict && (
              <p style={{ fontFamily: FONTS.display, fontSize: 11.5, color: 'rgba(255,140,140,0.9)', margin: 0, lineHeight: 1.5 }}>
                {b.status === 'refunded_conflict'
                  ? 'Conflit de créneau : ce boost a été remboursé AUTOMATIQUEMENT par le webhook. Rien à faire — ne pas re-rembourser dans Stripe.'
                  : 'Deux organisateurs ont payé ce créneau. Vérifie dans Stripe si le remboursement automatique est passé avant toute action manuelle.'}
              </p>
            )}
          </div>
        )
        return (
          <div style={{ padding: '8px 0 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Boosts actifs', value: active.length, color: COLORS.teal },
                { label: 'Conflits à traiter', value: conflicts.length, color: conflicts.length > 0 ? '#dc3232' : COLORS.muted },
                { label: 'Revenus boosts', value: `${totalRevenue}€`, color: COLORS.gold },
              ].map(k => (
                <div key={k.label} style={{ ...CARD, padding: 14, textAlign: 'center' }}>
                  <p style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 800, color: k.color, margin: 0 }}>{k.value}</p>
                  <p style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.dim, margin: '3px 0 0' }}>{k.label}</p>
                </div>
              ))}
            </div>
            {conflicts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ff8c8c', margin: 0 }}>Conflits — action requise</p>
                {conflicts.map(BoostCard)}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.muted, margin: 0 }}>Actifs ({active.length})</p>
              {active.length === 0
                ? <div style={{ ...CARD, padding: 26, textAlign: 'center' }}><p style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.muted, margin: 0 }}>Aucun boost actif</p></div>
                : active.filter(b => !b.conflict).map(BoostCard)}
            </div>
            {expired.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.dim, margin: 0 }}>Expirés ({expired.length})</p>
                {expired.slice(0, 10).map(b => <div key={b.id} style={{ opacity: 0.55 }}>{BoostCard(b)}</div>)}
              </div>
            )}
          </div>
        )
      })()}

      {/* ══════════════════════════════════════════════
          AVIS PRESTATAIRES (modération)
      ══════════════════════════════════════════════ */}
      {tab === 'avis' && <AdminReviewsPanel />}

      {/* ══════════════════════════════════════════════
          ACTUALITÉ (carrousel éditorial de l'accueil)
      ══════════════════════════════════════════════ */}
      {tab === 'actualite' && <ActualiteAdminPanel allEvents={allEvents} />}

      {/* ══════════════════════════════════════════════
          SIGNALEMENTS
      ══════════════════════════════════════════════ */}
      {tab === 'reports' && (
        <div style={{ padding: '16px 16px 40px', maxWidth: 520, margin: '0 auto' }}>
          <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
            Signalements d'utilisateurs
          </p>
          {reports.length === 0 ? (
            <div style={{ ...CARD, padding: 32, textAlign: 'center' }}>
              <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.muted, margin: 0 }}>Aucun signalement</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {reports.slice().reverse().map(r => (
                <div key={r.id} style={{ ...CARD, padding: 18, borderColor: 'rgba(224,90,170,0.28)', borderLeft: '3px solid rgba(224,90,170,0.55)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <div>
                      <p style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 300, color: '#fff', margin: '0 0 2px' }}>
                        {r.targetName} <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>signalé·e</span>
                      </p>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: 0 }}>
                        par {r.fromName} · {r.reportedAt ? new Date(r.reportedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                    <span style={{ padding: '3px 9px', borderRadius: 4, flexShrink: 0, background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.35)', fontFamily: FONTS.mono, fontSize: 10, color: COLORS.pink || '#e05aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>À traiter</span>
                  </div>
                  <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 12 }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Motif</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{r.reason || '—'}</p>
                  </div>
                  <button onClick={() => resolveReport(r.id)} style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer', background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)', color: '#04120e', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700 }}>Marquer comme traité</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'remboursements' && (
        <div style={{ padding: '16px 16px 40px', maxWidth: 620, margin: '0 auto' }}>
          <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
            Remboursements mobile money à traiter
          </p>
          <p style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted, lineHeight: 1.55, margin: '0 0 18px' }}>
            FedaPay ne rembourse pas par API. Pour chaque ligne : rembourse l'acheteur dans le dashboard FedaPay (bouton « Refund » sur la transaction), puis marque-la comme faite ici. L'argent d'un événement annulé n'est jamais versé à l'organisateur — il reste disponible pour rembourser. Les paiements par carte (Stripe) sont, eux, remboursés automatiquement.
          </p>
          {eventRefunds.length === 0 ? (
            <div style={{ ...CARD, padding: 32, textAlign: 'center' }}>
              <p style={{ fontFamily: FONTS.display, fontSize: 18, color: COLORS.muted, margin: 0 }}>Aucun remboursement mobile money en attente</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {eventRefunds.map(refund => {
                const docId = refund._docId || refund.id
                const amount = Math.max(0, Number(refund.amountXOF) || 0)
                return (
                  <div key={docId} style={{ ...CARD, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{amount.toLocaleString('fr-FR')} FCFA</p>
                        <p style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis' }}>À&nbsp;: {refund.buyerEmail || '— email inconnu —'}</p>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>Transaction FedaPay&nbsp;: {refund.paymentRef || '?'}</p>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: '2px 0 0' }}>Événement&nbsp;: {refund.eventId || '?'}</p>
                      </div>
                      <button onClick={() => markRefundDone(refund)} disabled={refundBusy === docId} style={{ flexShrink: 0, background: '#3ed6b5', opacity: refundBusy === docId ? 0.6 : 1, color: '#04040b', border: 'none', borderRadius: 10, padding: '10px 14px', fontFamily: FONTS.display, fontSize: 13, fontWeight: 700, cursor: refundBusy === docId ? 'wait' : 'pointer' }}>
                        {refundBusy === docId ? '…' : 'Marquer remboursé'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {eventCancellations.length > 0 && (
            <>
              <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '28px 0 8px' }}>
                Historique des annulations
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {eventCancellations.slice(0, 40).map(c => {
                  const when = c.cancelledAt?.toMillis ? c.cancelledAt.toMillis() : c.cancelledAt
                  return (
                    <div key={c._docId || c.eventId} style={{ ...CARD, padding: 12 }}>
                      <p style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 3px' }}>{c.eventName || c.eventId}</p>
                      <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, margin: 0 }}>
                        {Number(c.stripeRefundedCount) > 0 ? `${c.stripeRefundedCount} remboursement(s) carte (${((Number(c.stripeRefundedCents) || 0) / 100).toFixed(2)} €) · ` : ''}
                        {Number(c.fedapayWorklistCount) > 0 ? `${c.fedapayWorklistCount} mobile money · ` : ''}
                        {Number(c.stripeFailedCount) > 0 ? `${c.stripeFailedCount} échec(s) à revoir · ` : ''}
                        {when ? new Date(when).toLocaleDateString('fr-FR') : ''}
                      </p>
                      {c.reason && <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.dim, margin: '3px 0 0', fontStyle: 'italic' }}>« {c.reason} »</p>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'paiements' && (
        <div style={{ padding: '16px 16px 40px', maxWidth: 620, margin: '0 auto' }}>
          <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
            Alertes financières
          </p>
          <p style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted, lineHeight: 1.55, margin: '0 0 18px' }}>
            Vérifie le paiement dans Stripe ou FedaPay avant de rembourser ou de clôturer l'alerte.
          </p>
          {paymentAlerts.length === 0 ? (
            <div style={{ ...CARD, padding: 32, textAlign: 'center' }}>
              <p style={{ fontFamily: FONTS.display, fontSize: 18, color: COLORS.muted, margin: 0 }}>Aucune anomalie à traiter</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {paymentAlerts.map(alert => {
                const reason = {
                  account_deleted_after_payment: 'Paiement reçu après suppression du compte',
                  amount_mismatch: 'Montant payé différent du montant attendu',
                  missing_server_metadata: 'Paiement sans dossier serveur vérifiable',
                  sub_amount_mismatch: 'Abonnement : montant payé différent du tarif',
                  event_deleted_before_fulfillment: 'Paiement reçu pour un événement supprimé',
                  auto_payout_failed: 'Versement auto à l\'organisateur ÉCHOUÉ — à régler à la main',
                }[alert.reason] || alert.reason || 'Anomalie de paiement'
                const reference = alert.stripeSessionId || alert.transactionId || alert.bookingId || alert._docId
                const created = alert.createdAt?.toMillis ? alert.createdAt.toMillis() : alert.createdAt
                // Montants : FedaPay écrit paidAmount/expectedAmount (XOF entiers),
                // Stripe écrit amountTotal (centimes) + currency.
                const amountLine = alert.paidAmount != null
                  ? `Payé : ${alert.paidAmount} FCFA${alert.expectedAmount != null ? ` · Attendu : ${alert.expectedAmount} FCFA` : ''}`
                  : alert.amountTotal != null
                    ? `Montant : ${String(alert.currency || '').toUpperCase() === 'XOF'
                        ? `${alert.amountTotal} FCFA`
                        : `${(Number(alert.amountTotal) / 100).toFixed(2)} ${String(alert.currency || 'EUR').toUpperCase() === 'EUR' ? '€' : String(alert.currency || '').toUpperCase()}`}`
                    : null
                return (
                  <div key={alert._docId} style={{ ...CARD, padding: 18, borderColor: 'rgba(224,90,170,.32)', borderLeft: '3px solid rgba(224,90,170,0.55)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ fontFamily: FONTS.display, fontWeight: 750, fontSize: 15, color: '#fff', margin: '0 0 5px' }}>{reason}</p>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: 0 }}>{String(alert.provider || '').toUpperCase()} · {created ? formatDate(created) : 'date inconnue'}</p>
                      </div>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.pink, border: '1px solid rgba(224,90,170,.35)', borderRadius: 999, padding: '4px 8px' }}>À vérifier</span>
                    </div>
                    <div style={{ marginTop: 13, padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,.035)' }}>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: 0, overflowWrap: 'anywhere' }}>Référence : {reference}</p>
                      {amountLine && <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '5px 0 0' }}>{amountLine}</p>}
                    </div>
                    <button onClick={() => resolvePaymentAlert(alert._docId)} style={{ marginTop: 13, padding: '10px 16px', borderRadius: 10, cursor: 'pointer', background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)', color: '#04120e', fontFamily: FONTS.display, fontWeight: 700, fontSize: 12 }}>Marquer comme examiné</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'suppressions' && (
        <div style={{ padding: '16px 16px 40px', maxWidth: 520, margin: '0 auto' }}>
          <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
            Demandes de suppression de compte
          </p>

          {deletionRequests.length === 0 ? (
            <div style={{ ...CARD, padding: 32, textAlign: 'center' }}>
              <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.muted, margin: 0 }}>
                Aucune demande en attente
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {deletionRequests.map(req => (
                <div key={req.id} style={{
                  ...CARD, padding: 18,
                  borderColor: 'rgba(239,68,68,0.28)',
                  borderLeft: '3px solid rgba(239,68,68,0.55)',
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
                      fontFamily: FONTS.mono, fontSize: 10, color: '#ef4444',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      En attente
                    </span>
                  </div>

                  {/* Date */}
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '0 0 10px' }}>
                    Demandé le {new Date(req.requestedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>

                  {/* Raison */}
                  <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 12 }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
                      Raison invoquée
                    </p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                      {req.reason || '—'}
                    </p>
                  </div>

                  {/* Audit — blockers */}
                  {req.audit?.blockers?.length > 0 && (
                    <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 6, marginBottom: 10 }}>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                        Points signalés par le système
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
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                        Éléments à archiver
                      </p>
                      {req.audit.warnings.map((w, i) => (
                        <p key={i} style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'rgba(245,158,11,0.7)', margin: '0 0 3px', lineHeight: 1.5 }}>
                          • {w.label}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Note admin */}
                  <label style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
                    Note pour l&apos;utilisateur (optionnel)
                  </label>
                  <textarea
                    placeholder="Ex : demande refusée car événement en cours…"
                    rows={2}
                    value={delResNotes[req.id] || ''}
                    onChange={e => setDelResNotes(n => ({ ...n, [req.id]: e.target.value }))}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 10, padding: '10px 12px', resize: 'vertical',
                      fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.75)',
                      lineHeight: 1.6, outline: 'none', marginBottom: 12,
                    }}
                  />

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={async () => {
                        // try/catch OBLIGATOIRE : resolveDeletionRequest peut jeter
                        // (409 « l'organisateur a des billets vendus / recette non
                        // versée », 500 Auth, réseau). Sans ça, l'action la plus
                        // destructrice du panneau échouait en SILENCE (audit admin #2).
                        try {
                          await resolveDeletionRequest(req.id, 'approved', user.uid, user.name || 'Admin', delResNotes[req.id] || '')
                          setDeletionRequests(getAllDeletionRequests())
                          setDelResNotes(n => ({ ...n, [req.id]: '' }))
                          showToast('Suppression approuvée — compte anonymisé.')
                        } catch (e) {
                          showToast(e?.message || "Suppression impossible (ex : l'organisateur a des billets vendus ou de la recette non versée). Réessaie.", 'error')
                          setDeletionRequests(getAllDeletionRequests())
                        }
                      }}
                      style={{
                        flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                        background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)',
                        color: '#fff', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700,
                      }}>
                      Approuver la suppression
                    </button>
                    <button
                      onClick={async () => {
                        await resolveDeletionRequest(req.id, 'rejected', user.uid, user.name || 'Admin', delResNotes[req.id] || '')
                        setDeletionRequests(getAllDeletionRequests())
                        setDelResNotes(n => ({ ...n, [req.id]: '' }))
                        showToast('Demande refusée.')
                      }}
                      style={{
                        flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                        color: 'rgba(255,255,255,0.9)', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600,
                      }}>
                      Refuser
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          REVERSEMENTS — soldes vendeurs à régler à la main (ledger)
      ══════════════════════════════════════════════ */}
      {tab === 'reversements' && (() => {
        const fmtEUR = (c) => (Number(c || 0) / 100).toFixed(2) + ' €'
        const fmtXOF = (n) => `${Math.round(Number(n || 0)).toLocaleString('fr-FR')} FCFA`
        // Ledger illisible → AUCUNE action possible : sinon toutes les demandes
        // afficheraient « Solde à zéro — clore la demande » et l'admin clôturait
        // à tort des demandes dont l'argent est réellement dû.
        const ledgerOk = !loadErrors.includes('reversements')
        if (!ledgerOk) {
          return (
            <div style={{ padding: '16px 16px 40px', maxWidth: 520, margin: '0 auto' }}>
              <div style={{ ...CARD, padding: 24, borderColor: 'rgba(224,90,170,0.4)', borderLeft: '3px solid rgba(224,90,170,0.7)' }}>
                <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
                  Ledger des reversements illisible
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>
                  Impossible de lire les soldes vendeurs (permissions ou réseau). Aucune action de
                  reversement n'est proposée tant que les montants réels ne sont pas connus —
                  recharge la page ou reconnecte-toi.
                </p>
              </div>
            </div>
          )
        }
        const acctOf = (uid) => accounts.find(x => (x.uid || x.id) === uid)
        const nameOf = (uid) => { const a = acctOf(uid); return a ? getDisplayName(a) : (uid || '—') }
        const emailOf = (uid) => acctOf(uid)?.email || ''
        const reqSellerIds = new Set(payoutRequests.map(p => p.sellerId))
        const balancesNoReq = sellerBalances.filter(b => !reqSellerIds.has(b.sellerUid || b.id))
        // Deux devises = deux totaux SÉPARÉS (jamais d'addition inter-devises).
        // EUR = filet Stripe Connect (réglable ici). XOF actionnable = UNIQUEMENT
        // les versements auto en échec (le reste part tout seul → pas un « à faire »).
        const totalDueCents = sellerBalances.reduce((s, b) => s + Number(b.amountDueCents || 0), 0)
        // Events annulés = leur recette REMBOURSE les acheteurs, JAMAIS de versement
        // à l'organisateur. Le cron marque quand même leur enveloppe 'failed' → on
        // les affiche mais SANS bouton payer (le serveur refuse aussi, double garde).
        const cancelledEventIds = new Set(eventCancellations.map(c => String(c.eventId || c._docId || c.id)))
        const totalFailedXOF = failedPayouts.reduce((s, p) => cancelledEventIds.has(String(p.eventId || p._docId || p.id)) ? s : s + Number(p.amountDueXOF || 0), 0)
        const empty = payoutRequests.length === 0 && sellerBalances.length === 0 && failedPayouts.length === 0
        // Solde RÉEL du ledger (source de vérité webhook) — le montant d'une
        // demande de virement est écrit par le vendeur, donc jamais fiable seul.
        const ledgerOf = (uid) => sellerBalances.find(b => (b.sellerUid || b.id || b._docId) === uid)

        // Une ligne « Marquer payé » EUR (Stripe filet). Le XOF n'est jamais réglé
        // ici (versement auto) → affiché en note informative seulement.
        const PayoutCard = ({ uid, requestedCents, requestId, date }) => {
          const ledger = ledgerOf(uid)
          const dueCents = Math.max(0, Number(ledger?.amountDueCents || 0))
          const dueXOF = Math.max(0, Number(ledger?.amountDueXOF || 0))
          const payCents = requestId ? Math.min(Math.max(0, Number(requestedCents || 0)) || dueCents, dueCents) : dueCents
          const mismatch = requestId && Number(requestedCents || 0) > dueCents
          return (
            <div style={{ ...CARD, padding: 16, borderColor: requestId ? 'rgba(200,169,110,0.30)' : 'rgba(255,255,255,0.10)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 300, color: '#fff', margin: '0 0 2px' }}>{nameOf(uid)}</p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {emailOf(uid) || uid}{date ? ` · demandé le ${formatDate(date)}` : ''}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {dueCents > 0 && <p style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 300, color: COLORS.gold, margin: 0 }}>{fmtEUR(dueCents)}</p>}
                  {dueXOF > 0 && <p style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 300, color: COLORS.teal, margin: 0 }}>{fmtXOF(dueXOF)}</p>}
                  {dueCents <= 0 && dueXOF <= 0 && <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>Solde à zéro</p>}
                </div>
              </div>
              {mismatch && (
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#f59e0b', margin: '8px 0 0', lineHeight: 1.5 }}>
                  Le montant demandé dépasse le solde réel du ledger — seul le solde réel sera réglé.
                </p>
              )}
              {payCents > 0 && (
                <button
                  onClick={() => setConfirmAction({ type: 'markPaid', uid, amount: payCents, currency: 'EUR', requestId, name: nameOf(uid), label: fmtEUR(payCents) })}
                  style={{
                    width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                    background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)',
                    color: '#04120e', fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                  }}>
                  Marquer payé ({fmtEUR(payCents)})
                </button>
              )}
              {dueXOF > 0 && (
                // XOF NON réglable ici : le versement mobile money part AUTOMATIQUEMENT
                // à la fin de l'événement (cron event_payouts). Le régler à la main
                // depuis le solde agrégé = double versement (le cron paie aussi).
                // Les échecs réels apparaissent dans la section « Versements auto en
                // échec » ci-dessous, avec leur propre bouton.
                <p style={{
                  marginTop: payCents > 0 ? 8 : 12, padding: '9px 12px', borderRadius: 10,
                  background: 'rgba(78,232,200,0.07)', border: '1px solid rgba(78,232,200,0.20)',
                  color: 'rgba(78,232,200,0.85)', fontFamily: FONTS.mono, fontSize: 10.5, lineHeight: 1.5, margin: `${payCents > 0 ? 8 : 12}px 0 0`,
                }}>
                  {fmtXOF(dueXOF)} versés automatiquement sur le Mobile Money à la fin de l'événement. En cas d'échec, à régler dans « Versements auto en échec ».
                </p>
              )}
              {requestId && payCents <= 0 && dueXOF <= 0 && (
                <button
                  onClick={() => setConfirmAction({ type: 'markPaid', uid, amount: 0, currency: 'EUR', requestId, name: nameOf(uid), label: '0 (clore la demande)' })}
                  style={{
                    width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                    color: 'rgba(255,255,255,0.7)', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600,
                  }}>
                  Solde à zéro — clore la demande
                </button>
              )}
            </div>
          )
        }

        return (
          <div style={{ padding: '16px 16px 40px', maxWidth: 520, margin: '0 auto' }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
              Reversements vendeurs
            </p>

            {!empty && (
              <div style={{ ...CARD, padding: 18, marginBottom: 18, borderColor: 'rgba(200,169,110,0.30)', borderLeft: '3px solid rgba(200,169,110,0.6)' }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(200,169,110,0.7)', margin: 0 }}>
                  Total à reverser
                </p>
                {totalDueCents > 0 && (
                  <p style={{ fontFamily: FONTS.display, fontSize: 34, fontWeight: 300, color: COLORS.gold, margin: '4px 0 0', lineHeight: 1 }}>
                    {fmtEUR(totalDueCents)}
                  </p>
                )}
                {totalFailedXOF > 0 && (
                  <p style={{ fontFamily: FONTS.display, fontSize: totalDueCents > 0 ? 26 : 34, fontWeight: 300, color: COLORS.teal, margin: '6px 0 0', lineHeight: 1 }}>
                    {fmtXOF(totalFailedXOF)}
                  </p>
                )}
                {totalDueCents <= 0 && totalFailedXOF <= 0 && (
                  <p style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 300, color: COLORS.muted, margin: '4px 0 0', lineHeight: 1 }}>
                    0
                  </p>
                )}
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '8px 0 0', lineHeight: 1.6 }}>
                  FILET DE SÉCURITÉ. Le flux normal est le versement AUTOMATIQUE sur le Mobile Money
                  de l'organisateur à la fin de chaque événement. Le XOF ci-dessus = uniquement les
                  versements auto EN ÉCHEC (numéro manquant, envoi refusé) — à régler à la main puis
                  marquer payé. L'EUR passe par Stripe. Jamais d'addition entre les deux devises.
                </p>
              </div>
            )}

            {empty ? (
              <div style={{ ...CARD, padding: 32, textAlign: 'center' }}>
                <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.muted, margin: 0 }}>
                  Aucun reversement en attente
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '8px 0 0' }}>
                  Les soldes vendeurs non reversés automatiquement apparaîtront ici.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {failedPayouts.length > 0 && (
                  <div>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.teal, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                      Versements auto en échec ({failedPayouts.length})
                    </p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '0 0 10px', lineHeight: 1.5 }}>
                      Le versement Mobile Money n'a pas pu partir. Envoie l'argent à la main depuis le
                      dashboard FedaPay, PUIS marque payé ici (ça solde aussi le ledger — le cron n'y
                      retouchera pas).
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {failedPayouts.map(p => {
                        const uid = String(p.sellerUid || '')
                        const amt = Math.max(0, Math.round(Number(p.amountDueXOF || 0)))
                        const isCancelled = cancelledEventIds.has(String(p.eventId || p._docId || p.id))
                        return (
                          <div key={p.eventId || p.id || p._docId} style={{ ...CARD, padding: 16, borderColor: 'rgba(224,90,170,0.30)', borderLeft: '3px solid rgba(224,90,170,0.6)' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 300, color: '#fff', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.eventName || 'Événement'}</p>
                                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {nameOf(uid)}{emailOf(uid) ? ` · ${emailOf(uid)}` : ''}
                                </p>
                              </div>
                              <p style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 300, color: COLORS.teal, margin: 0, flexShrink: 0 }}>{fmtXOF(amt)}</p>
                            </div>
                            {p.failReason && (
                              <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#f59e0b', margin: '8px 0 0', lineHeight: 1.5 }}>
                                Raison : {String(p.failReason).slice(0, 160)}
                              </p>
                            )}
                            {isCancelled ? (
                              <p style={{
                                marginTop: 12, padding: '10px 12px', borderRadius: 10,
                                background: 'rgba(224,90,170,0.10)', border: '1px solid rgba(224,90,170,0.4)',
                                color: 'rgba(224,90,170,0.95)', fontFamily: FONTS.mono, fontSize: 10.5, lineHeight: 1.5,
                              }}>
                                Événement ANNULÉ — cette recette rembourse les acheteurs (onglet Remboursements). Ne rien verser à l'organisateur.
                              </p>
                            ) : (
                            <button
                              onClick={() => setConfirmAction({ type: 'markPayoutPaid', ep: p, name: nameOf(uid), label: fmtXOF(amt) })}
                              style={{
                                width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                                background: 'rgba(78,232,200,0.14)', border: '1px solid rgba(78,232,200,0.5)',
                                color: COLORS.teal, fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700,
                              }}>
                              Marquer payé ({fmtXOF(amt)})
                            </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {payoutRequests.length > 0 && (
                  <div>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.gold, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
                      Demandes de virement ({payoutRequests.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {payoutRequests.map(p => (
                        <PayoutCard key={p.id} uid={p.sellerId} requestedCents={p.amountDueCents} requestId={p.id} date={p.createdAt} />
                      ))}
                    </div>
                  </div>
                )}

                {balancesNoReq.length > 0 && (
                  <div>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
                      Soldes dus (sans demande)
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {balancesNoReq.map(b => (
                        <PayoutCard key={b.sellerUid || b.id || b._docId} uid={b.sellerUid || b.id || b._docId} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 70, padding: '12px 20px', borderRadius: 12,
          fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600,
          background: 'rgba(12,12,22,0.96)', color: '#fff',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          ...(toast.type === 'error'
            ? { border: '1px solid rgba(224,90,170,0.5)' }
            : { border: '1px solid rgba(78,232,200,0.5)' }
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
  display: "Inter, sans-serif",
  mono: 'Inter, sans-serif', // plus de mono « pixélisé » — Inter partout
}

function Section({ title, children }) {
  return (
    <div>
      <p style={{
        fontFamily: FONTS_SUB.display, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
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

// Petit badge de qualification (Perso / Pro / Organisateur / Prestataire)
function Tag({ label, color }) {
  return (
    <span style={{
      fontFamily: FONTS_SUB.mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: color || 'rgba(255,255,255,0.42)', border: `1px solid ${color || 'rgba(255,255,255,0.42)'}55`,
      borderRadius: 4, padding: '1px 5px', flexShrink: 0, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// Ligne « numéro / info courte » avec badge à gauche de la valeur
function ContactRow({ label, value, tag, tagColor }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontFamily: FONTS_SUB.mono, fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {tag && <Tag label={tag} color={tagColor} />}
        <span style={{
          fontFamily: FONTS_SUB.mono, fontSize: 11,
          color: value ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.25)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value || '— non renseigné'}</span>
      </span>
    </div>
  )
}

// Ligne « adresse » (multi-ligne, ne tronque pas)
function AddressRow({ label, value, tag, tagColor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: FONTS_SUB.mono, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{label}</span>
        {tag && <Tag label={tag} color={tagColor} />}
      </div>
      <span style={{ fontFamily: FONTS_SUB.display, fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.78)', lineHeight: 1.4, wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}
