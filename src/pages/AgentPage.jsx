import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getAllAccounts, updateAccount, deleteAccount,
  getPendingValidations, approveValidation, rejectValidation,
  ROLES, PRESTATAIRE_TYPES,
} from '../utils/accounts'
import { getBalance, deductFunds, addFunds } from '../utils/wallet'

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

function RoleBadge({ role, small }) {
  const r = ROLES[role] || { label: role, icon: '?', color: '#6b7280' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}
      style={{ color: r.color, borderColor: r.color + '44', background: r.color + '11' }}>
      {r.icon} {r.label}
    </span>
  )
}

function StatusBadge({ status }) {
  const cfg = {
    active:   { label: 'Actif',     color: '#22c55e' },
    pending:  { label: 'En attente', color: '#f59e0b' },
    rejected: { label: 'Refusé',    color: '#ef4444' },
    banned:   { label: 'Banni',     color: '#6b7280' },
  }[status] || { label: status, color: '#6b7280' }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-semibold"
      style={{ color: cfg.color, borderColor: cfg.color + '44', background: cfg.color + '11' }}>
      {cfg.label}
    </span>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function AgentPage() {
  const isAgent = useAgentGuard()
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('dashboard')
  const [accounts, setAccounts] = useState([])
  const [pending, setPending] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [confirmAction, setConfirmAction] = useState(null) // { type, uid, name }
  const [editField, setEditField] = useState(null) // { uid, field, value }
  const [balanceAdjust, setBalanceAdjust] = useState({ uid: null, amount: '', reason: '' })
  const [toast, setToast] = useState(null)

  function refresh() {
    setAccounts(getAllAccounts())
    setPending(getPendingValidations())
  }

  useEffect(() => { refresh() }, [])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  if (!isAgent) return null

  // ── Stats ──
  const totalUsers       = accounts.length
  const totalActive      = accounts.filter(a => a.status === 'active').length
  const totalPrestataires = accounts.filter(a => a.role === 'prestataire').length
  const totalOrgas       = accounts.filter(a => a.role === 'organisateur').length
  const totalPending     = pending.length

  // ── Filtered list ──
  const filtered = accounts.filter(a => {
    const matchSearch = !search ||
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.email?.toLowerCase().includes(search.toLowerCase()) ||
      a.phone?.includes(search)
    const matchRole   = roleFilter === 'all' || a.role === roleFilter
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    return matchSearch && matchRole && matchStatus
  })

  // ── Actions ──
  function handleApprove(uid) {
    approveValidation(uid)
    refresh()
    showToast('Compte validé ✓')
    setConfirmAction(null)
  }

  function handleReject(uid) {
    rejectValidation(uid, rejectReason)
    setRejectReason('')
    refresh()
    showToast('Compte refusé', 'error')
    setConfirmAction(null)
  }

  function handleBan(uid) {
    updateAccount(uid, { status: 'banned' })
    refresh()
    showToast('Compte suspendu')
    setConfirmAction(null)
    setSelectedUser(null)
  }

  function handleDelete(uid) {
    deleteAccount(uid)
    refresh()
    showToast('Compte supprimé', 'error')
    setConfirmAction(null)
    setSelectedUser(null)
  }

  function handleReactivate(uid) {
    updateAccount(uid, { status: 'active' })
    refresh()
    showToast('Compte réactivé ✓')
    setSelectedUser(u => u?.uid === uid ? { ...u, status: 'active' } : u)
  }

  function handleSaveEdit() {
    if (!editField) return
    updateAccount(editField.uid, { [editField.field]: editField.value })
    refresh()
    setSelectedUser(u => u?.uid === editField.uid ? { ...u, [editField.field]: editField.value } : u)
    setEditField(null)
    showToast('Mis à jour ✓')
  }

  function handleBalanceAdjust() {
    const amt = parseFloat(balanceAdjust.amount)
    if (!amt || !balanceAdjust.uid) return
    if (amt < 0) {
      deductFunds(balanceAdjust.uid, Math.abs(amt), balanceAdjust.reason || 'Ajustement admin')
    } else {
      addFunds(balanceAdjust.uid, amt, balanceAdjust.reason || 'Ajustement admin')
    }
    showToast('Solde ajusté ✓')
    setBalanceAdjust({ uid: null, amount: '', reason: '' })
  }

  return (
    <div className="min-h-screen bg-[#04040b]">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-40 bg-[#08080f] border-b border-white/[0.05] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/accueil')} className="text-gray-600 hover:text-white text-xl">←</button>
        <div>
          <h1 className="text-white font-black tracking-widest uppercase text-sm" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            LIVE<span className="text-[#d4af37]">IN</span>BLACK — Interface Agent
          </h1>
          <p className="text-gray-600 text-[10px]">{user?.name} · {user?.email}</p>
        </div>
        {totalPending > 0 && (
          <button onClick={() => setTab('validations')}
            className="ml-auto flex items-center gap-1.5 bg-[#d4af37] text-black text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
            ⚠ {totalPending} en attente
          </button>
        )}
      </div>

      {/* ── Nav tabs ── */}
      <div className="flex border-b border-white/[0.05] overflow-x-auto">
        {[
          { key: 'dashboard',   icon: '📊', label: 'Dashboard' },
          { key: 'users',       icon: '👥', label: 'Comptes' },
          { key: 'validations', icon: '✅', label: `Validations${totalPending > 0 ? ` (${totalPending})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${
              tab === t.key ? 'border-[#d4af37] text-[#d4af37]' : 'border-transparent text-gray-500 hover:text-white'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 pb-20 max-w-lg mx-auto">

        {/* ══════════════════════════════════════════════
            DASHBOARD
        ══════════════════════════════════════════════ */}
        {tab === 'dashboard' && (
          <div className="space-y-5 mt-2">
            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Comptes total', value: totalUsers, icon: '👥', color: '#3b82f6' },
                { label: 'Actifs',        value: totalActive, icon: '✅', color: '#22c55e' },
                { label: 'Prestataires', value: totalPrestataires, icon: '🎤', color: '#8b5cf6' },
                { label: 'En attente',   value: totalPending, icon: '⏳', color: '#f59e0b', alert: totalPending > 0 },
              ].map(s => (
                <div key={s.label}
                  className="p-4 rounded-2xl border transition-all"
                  style={{ borderColor: s.color + (s.alert ? '66' : '22'), background: s.color + (s.alert ? '14' : '08') }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-gray-500 text-[10px] uppercase tracking-wider">{s.label}</p>
                      <p className="text-white font-black text-3xl mt-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{s.value}</p>
                    </div>
                    <span className="text-2xl">{s.icon}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent registrations */}
            <div>
              <h3 className="text-gray-500 text-xs uppercase tracking-widest mb-3">Inscriptions récentes</h3>
              <div className="space-y-2">
                {[...accounts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5).map(u => (
                  <button key={u.uid} onClick={() => { setSelectedUser(u); setTab('users') }}
                    className="w-full flex items-center gap-3 p-3 bg-[#08080f] border border-white/[0.05] rounded-xl hover:border-white/[0.08] transition-all text-left">
                    <div className="w-8 h-8 rounded-full bg-[#0e0e18] flex items-center justify-center text-xs text-white font-bold flex-shrink-0">
                      {u.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{u.name}</p>
                      <p className="text-gray-600 text-[10px] truncate">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <RoleBadge role={u.role} small />
                      <StatusBadge status={u.status} />
                    </div>
                  </button>
                ))}
                {accounts.length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-8">Aucun compte enregistré</p>
                )}
              </div>
            </div>

            {/* Breakdown by role */}
            <div>
              <h3 className="text-gray-500 text-xs uppercase tracking-widest mb-3">Répartition par rôle</h3>
              <div className="space-y-2">
                {Object.entries(ROLES).map(([key, r]) => {
                  const count = accounts.filter(a => a.role === key).length
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-sm w-5">{r.icon}</span>
                      <span className="text-gray-400 text-xs flex-1">{r.label}</span>
                      <div className="flex-1 bg-[#08080f] rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: totalUsers ? `${(count / totalUsers) * 100}%` : '0%', background: r.color }} />
                      </div>
                      <span className="text-white text-xs font-bold w-5 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            USERS / ACCOUNTS
        ══════════════════════════════════════════════ */}
        {tab === 'users' && (
          <div className="space-y-4 mt-2">
            {/* Search + filters */}
            <div className="space-y-2">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600">🔍</span>
                <input className="input-dark pl-10 text-sm" placeholder="Nom, email, téléphone..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { key: 'all',  label: 'Tous' },
                  { key: 'user', label: '👤 Utilisateurs' },
                  { key: 'prestataire', label: '🎤 Presta' },
                  { key: 'organisateur', label: '🎪 Orgas' },
                  { key: 'agent', label: '🔑 Agents' },
                ].map(f => (
                  <button key={f.key} onClick={() => setRoleFilter(f.key)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-all ${roleFilter === f.key ? 'bg-[#d4af37] text-black border-[#d4af37]' : 'border-white/[0.07] text-gray-500'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {['all', 'active', 'pending', 'rejected', 'banned'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${statusFilter === s ? 'bg-white/10 border-white/20 text-white' : 'border-white/[0.07] text-gray-600'}`}>
                    {s === 'all' ? 'Tous statuts' : s}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-gray-600 text-xs">{filtered.length} compte{filtered.length !== 1 ? 's' : ''}</p>

            {/* List */}
            <div className="space-y-2">
              {filtered.map(u => (
                <button key={u.uid} onClick={() => setSelectedUser(u)}
                  className="w-full flex items-center gap-3 p-3 bg-[#08080f] border border-white/[0.05] rounded-xl hover:border-white/[0.08] transition-all text-left">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: u.role === 'agent' ? '#d4af3722' : '#0e0e18', color: u.role === 'agent' ? '#d4af37' : '#fff' }}>
                    {u.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{u.name}</p>
                    <p className="text-gray-600 text-[10px] truncate">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <RoleBadge role={u.role} small />
                    <StatusBadge status={u.status} />
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-gray-600 py-10">Aucun compte trouvé</p>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            VALIDATIONS
        ══════════════════════════════════════════════ */}
        {tab === 'validations' && (
          <div className="space-y-4 mt-2">
            {pending.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <p className="text-4xl">✅</p>
                <p className="text-white font-semibold">Aucune validation en attente</p>
                <p className="text-gray-600 text-sm">Tous les comptes ont été traités.</p>
              </div>
            ) : pending.map(u => (
              <div key={u.uid} className="bg-[#08080f] border border-white/[0.05] rounded-2xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0e0e18] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                    {u.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">{u.name}</p>
                    <p className="text-gray-500 text-xs">{u.email}</p>
                    {u.phone && <p className="text-gray-600 text-[10px]">📞 {u.phone}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <RoleBadge role={u.role} small />
                      {u.prestataireType && (
                        <span className="text-[10px] text-gray-400 bg-[#08080f] border border-white/[0.07] px-1.5 py-0.5 rounded-full">
                          {PRESTATAIRE_TYPES.find(t => t.key === u.prestataireType)?.label || u.prestataireType}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 text-[10px] mt-1">Demande le {formatDate(u.requestedAt)}</p>
                  </div>
                </div>

                {/* Reject reason input */}
                <input className="input-dark text-xs" placeholder="Motif de refus (optionnel)"
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)} />

                <div className="flex gap-2">
                  <button onClick={() => setConfirmAction({ type: 'reject', uid: u.uid, name: u.name })}
                    className="flex-1 py-2 rounded-xl border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition-colors">
                    ✕ Refuser
                  </button>
                  <button onClick={() => setConfirmAction({ type: 'approve', uid: u.uid, name: u.name })}
                    className="flex-1 py-2 rounded-xl bg-[#d4af37] text-black text-xs font-bold hover:bg-[#c9a227] transition-colors">
                    ✓ Valider
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          USER DETAIL SLIDE-UP
      ══════════════════════════════════════════════ */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedUser(null)} />
          <div className="relative w-full max-w-lg bg-[#08080f] border border-white/[0.05] rounded-t-3xl max-h-[85vh] overflow-y-auto pb-8">
            <div className="p-5 border-b border-white/[0.05] sticky top-0 bg-[#08080f] z-10">
              <div className="w-10 h-1 bg-white/[0.08] rounded-full mx-auto mb-4" />
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#0e0e18] flex items-center justify-center text-lg font-bold text-white">
                  {selectedUser.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold">{selectedUser.name}</p>
                  <p className="text-gray-500 text-xs">{selectedUser.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <RoleBadge role={selectedUser.role} />
                  <StatusBadge status={selectedUser.status} />
                </div>
              </div>
            </div>

            <div className="p-5 space-y-5">
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
                <div className="space-y-2">
                  {[
                    { field: 'name',  label: 'Nom', type: 'text' },
                    { field: 'email', label: 'Email', type: 'email' },
                    { field: 'phone', label: 'Téléphone', type: 'tel' },
                  ].map(f => (
                    <div key={f.field}>
                      {editField?.field === f.field && editField.uid === selectedUser.uid ? (
                        <div className="flex gap-2">
                          <input className="input-dark flex-1 text-sm"
                            type={f.type} value={editField.value}
                            onChange={e => setEditField(ef => ({ ...ef, value: e.target.value }))} />
                          <button onClick={handleSaveEdit} className="px-3 py-2 bg-[#d4af37] text-black text-xs font-bold rounded-xl">✓</button>
                          <button onClick={() => setEditField(null)} className="px-3 py-2 border border-white/[0.08] text-gray-500 text-xs rounded-xl">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => setEditField({ uid: selectedUser.uid, field: f.field, value: selectedUser[f.field] || '' })}
                          className="w-full flex items-center justify-between p-2.5 rounded-xl border border-white/[0.07] hover:border-white/[0.08] text-left">
                          <span className="text-gray-500 text-xs">{f.label}</span>
                          <span className="text-gray-400 text-xs">{selectedUser[f.field] || '—'} <span className="text-gray-700">✏</span></span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {/* Wallet */}
              <Section title="Portefeuille">
                <div className="flex items-center justify-between p-3 bg-[#08080f] rounded-xl border border-white/[0.05]">
                  <span className="text-gray-400 text-sm">Solde actuel</span>
                  <span className="text-[#d4af37] font-bold">{getBalance(selectedUser.uid)}€</span>
                </div>
                {balanceAdjust.uid === selectedUser.uid ? (
                  <div className="space-y-2 mt-2">
                    <input className="input-dark text-sm" type="number" placeholder="Montant (négatif pour déduire)"
                      value={balanceAdjust.amount} onChange={e => setBalanceAdjust(b => ({ ...b, amount: e.target.value }))} />
                    <input className="input-dark text-sm" placeholder="Raison (ex: remboursement, bonus)"
                      value={balanceAdjust.reason} onChange={e => setBalanceAdjust(b => ({ ...b, reason: e.target.value }))} />
                    <div className="flex gap-2">
                      <button onClick={handleBalanceAdjust} className="flex-1 py-2 bg-[#d4af37] text-black text-xs font-bold rounded-xl">Appliquer</button>
                      <button onClick={() => setBalanceAdjust({ uid: null, amount: '', reason: '' })} className="px-4 py-2 border border-white/[0.08] text-gray-500 text-xs rounded-xl">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setBalanceAdjust(b => ({ ...b, uid: selectedUser.uid }))}
                    className="w-full mt-2 py-2 border border-white/[0.08] text-gray-400 text-xs rounded-xl hover:border-[#d4af37]/40 hover:text-[#d4af37] transition-colors">
                    💰 Ajuster le solde
                  </button>
                )}
              </Section>

              {/* Mot de passe (démo only) */}
              <Section title="Mot de passe">
                <div className="flex items-center justify-between p-3 bg-[#08080f] rounded-xl border border-white/[0.05]">
                  <span className="text-gray-400 text-sm">Générer un nouveau mdp</span>
                  <button onClick={() => {
                    const newPwd = 'LIB' + Math.random().toString(36).slice(2, 8).toUpperCase()
                    updateAccount(selectedUser.uid, { password: newPwd })
                    showToast(`Nouveau mdp : ${newPwd}`)
                    refresh()
                  }} className="text-[#d4af37] text-xs font-semibold hover:underline">
                    Réinitialiser →
                  </button>
                </div>
                <p className="text-gray-700 text-[10px] mt-1">Le nouveau mot de passe s'affichera dans la notification.</p>
              </Section>

              {/* Account actions */}
              <Section title="Actions compte">
                <div className="space-y-2">
                  {selectedUser.status === 'banned' ? (
                    <button onClick={() => handleReactivate(selectedUser.uid)}
                      className="w-full py-2.5 rounded-xl border border-green-500/30 text-green-400 text-sm font-semibold hover:bg-green-500/10 transition-colors">
                      ✓ Réactiver le compte
                    </button>
                  ) : selectedUser.status === 'active' ? (
                    <button onClick={() => setConfirmAction({ type: 'ban', uid: selectedUser.uid, name: selectedUser.name })}
                      className="w-full py-2.5 rounded-xl border border-orange-500/30 text-orange-400 text-sm font-semibold hover:bg-orange-500/10 transition-colors">
                      🚫 Suspendre le compte
                    </button>
                  ) : null}
                  <button onClick={() => setConfirmAction({ type: 'delete', uid: selectedUser.uid, name: selectedUser.name })}
                    className="w-full py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/10 transition-colors">
                    🗑 Supprimer le compte
                  </button>
                </div>
              </Section>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Dialog ── */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/90" onClick={() => setConfirmAction(null)} />
          <div className="relative bg-[#08080f] border border-white/[0.07] rounded-2xl p-5 w-full max-w-xs space-y-4 text-center">
            <p className="text-4xl">
              {confirmAction.type === 'approve' ? '✅' : confirmAction.type === 'reject' ? '❌' : confirmAction.type === 'ban' ? '🚫' : '🗑'}
            </p>
            <p className="text-white font-bold text-sm">
              {confirmAction.type === 'approve' && `Valider le compte de ${confirmAction.name} ?`}
              {confirmAction.type === 'reject'  && `Refuser le compte de ${confirmAction.name} ?`}
              {confirmAction.type === 'ban'     && `Suspendre le compte de ${confirmAction.name} ?`}
              {confirmAction.type === 'delete'  && `Supprimer définitivement le compte de ${confirmAction.name} ?`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-gray-400 text-sm">Annuler</button>
              <button
                onClick={() => {
                  if (confirmAction.type === 'approve') handleApprove(confirmAction.uid)
                  if (confirmAction.type === 'reject')  handleReject(confirmAction.uid)
                  if (confirmAction.type === 'ban')     handleBan(confirmAction.uid)
                  if (confirmAction.type === 'delete')  handleDelete(confirmAction.uid)
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${
                  confirmAction.type === 'approve' ? 'bg-[#d4af37] text-black' : 'bg-red-500 text-white'
                }`}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl transition-all ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-[#d4af37] text-black'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      <p className="text-gray-600 text-[10px] uppercase tracking-widest mb-2">{title}</p>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={`text-gray-300 text-xs ${mono ? 'font-mono text-[10px]' : ''} max-w-[60%] text-right truncate`}>{value}</span>
    </div>
  )
}
