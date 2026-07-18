'use client'

import { useEffect, useMemo, useState } from 'react'

// Port de la section « Comptes » (tab === 'users') de src/pages/AgentPage.jsx
// (#9 phase agent/admin) — recherche + filtres rôle/statut/en ligne, panneau
// de détail slide-up, actions serveur (suspendre/réactiver, vérifier l'email,
// éditer nom/prénom/téléphone). Voir lib/server/agentUsers.ts pour la logique
// serveur et lib/server/agentGuard.ts pour la garde d'accès (déjà vérifiée
// par la page serveur qui monte ce composant).
//
// Différences volontaires avec le legacy :
// - Pas de « Modifier l'email » ni de « Réinitialiser le mot de passe » — ce
//   port n'a pas de couche Firebase Auth distincte à synchroniser (l'email
//   EST l'identifiant de connexion Credentials, cf. auth.ts) ; changer
//   l'email d'un compte reste hors périmètre de cette tâche.
// - Pas de « Supprimer le compte » — la suppression complète est un panneau
//   agent séparé (#104), avec sa propre revue des demandes RGPD.
// - Pas de bouton « Renvoyer le lien de vérification » — ce port n'a pas
//   (encore) de flux d'email de vérification candidat ; seul le forçage
//   « Marquer l'email vérifié » (emailVerifiedAt) est porté ici.

type Role = 'client' | 'organisateur' | 'prestataire' | 'agent'
type AccountStatus = 'active' | 'pending' | 'rejected'
type StatusFilter = AccountStatus | 'disabled' | 'all'
type RoleFilter = Role | 'all'

interface UserSummary {
  id: string
  personalName: string
  displayName: string
  email: string
  phone: string
  role: Role
  status: AccountStatus
  disabled: boolean
  emailVerified: boolean
  online: boolean
  createdAt: string
}

interface UserDetail extends UserSummary {
  firstName: string
  lastName: string
  roles: Role[]
  emailVerifiedAt: string | null
  lastSeenAt: string | null
  superAdmin: boolean
  prestataireTypes: string[]
}

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'client', label: 'Utilisateurs' },
  { key: 'prestataire', label: 'Prestataires' },
  { key: 'organisateur', label: 'Organisateurs' },
  { key: 'agent', label: 'Agents' },
]

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous statuts' },
  { key: 'active', label: 'Actif' },
  { key: 'pending', label: 'En attente' },
  { key: 'rejected', label: 'Refusé' },
  { key: 'disabled', label: 'Désactivé' },
]

const ROLE_LABEL: Record<Role, string> = { client: 'Client', organisateur: 'Organisateur', prestataire: 'Prestataire', agent: 'Agent' }
const ROLE_COLOR: Record<Role, string> = { client: '#8b8f9c', organisateur: 'var(--gold)', prestataire: '#e05aaa', agent: 'var(--gold)' }

function statusLabel(u: UserSummary): { label: string; color: string } {
  if (u.disabled) return { label: 'DÉSACTIVÉ', color: '#8b8f9c' }
  if (u.status === 'pending') return { label: 'EN ATTENTE', color: 'var(--gold)' }
  if (u.status === 'rejected') return { label: 'REFUSÉ', color: '#e05aaa' }
  return { label: 'ACTIF', color: 'var(--teal)' }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 13.5, outline: 'none' }
const sectionTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', margin: '0 0 10px' }

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 8, border: `1px solid ${color}55`, background: `${color}22`, color, letterSpacing: '0.04em' }}>
      {label}
    </span>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span style={{ color: '#fff', textAlign: 'right', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  )
}

interface ToastState {
  message: string
  kind: 'success' | 'error'
}

export default function AgentUsersClient() {
  const [users, setUsers] = useState<UserSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [onlineOnly, setOnlineOnly] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [editField, setEditField] = useState<{ field: 'firstName' | 'lastName' | 'phone'; value: string } | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  const [toast, setToast] = useState<ToastState | null>(null)

  function showToast(message: string, kind: ToastState['kind']) {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (roleFilter !== 'all') params.set('role', roleFilter)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (onlineOnly) params.set('online', '1')
    return params.toString()
  }, [search, roleFilter, statusFilter, onlineOnly])

  async function loadList() {
    setListLoading(true)
    setListError(false)
    try {
      const res = await fetch(`/api/agent/users${queryString ? `?${queryString}` : ''}`)
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('load_failed')
      setUsers(data.users)
    } catch {
      setListError(true)
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setListLoading(true)
      setListError(false)
      try {
        const res = await fetch(`/api/agent/users${queryString ? `?${queryString}` : ''}`)
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setUsers(data.users)
      } catch {
        if (!cancelled) setListError(true)
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [queryString])

  function closeDetail() {
    setSelectedId(null)
    setDetail(null)
    setEditField(null)
    setConfirmDisable(false)
  }

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    async function run() {
      setDetailLoading(true)
      try {
        const res = await fetch(`/api/agent/users/${selectedId}`)
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setDetail(data.user)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  async function handleVerifyEmail() {
    if (!detail) return
    setActionBusy(true)
    try {
      const res = await fetch(`/api/agent/users/${detail.id}/verify-email`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        showToast('Vérification impossible — réessaie.', 'error')
        return
      }
      showToast('Email vérifié — le compte peut maintenant se connecter', 'success')
      setDetail(data.user)
      await loadList()
    } finally {
      setActionBusy(false)
    }
  }

  async function handleSetDisabled(disabled: boolean) {
    if (!detail) return
    setActionBusy(true)
    try {
      const res = await fetch(`/api/agent/users/${detail.id}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        const message =
          data.error === 'self_action'
            ? 'Impossible de suspendre ton propre compte.'
            : data.error === 'protected_account'
              ? 'Ce compte est protégé.'
              : `${disabled ? 'Suspension' : 'Réactivation'} impossible — réessaie.`
        showToast(message, 'error')
        return
      }
      showToast(disabled ? 'Compte suspendu — connexion désactivée' : 'Compte réactivé — connexion rétablie', 'success')
      setDetail(data.user)
      setConfirmDisable(false)
      await loadList()
    } finally {
      setActionBusy(false)
    }
  }

  async function saveEditField() {
    if (!detail || !editField) return
    setEditBusy(true)
    try {
      const res = await fetch(`/api/agent/users/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [editField.field]: editField.value }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        showToast('Échec de l’enregistrement — réessaie.', 'error')
        return
      }
      setDetail(data.user)
      setEditField(null)
      showToast('Modification enregistrée', 'success')
      await loadList()
    } finally {
      setEditBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Comptes</h1>
        </div>

        {listError && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <button onClick={loadList} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12.5 }}>
              Recharger
            </button>
          </div>
        )}

        <input style={inputStyle} placeholder="Nom, email, téléphone…" value={search} onChange={(e) => setSearch(e.target.value)} />

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setRoleFilter(f.key)}
              style={{
                flexShrink: 0,
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 10.5,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                background: roleFilter === f.key ? 'rgba(200,169,110,0.18)' : 'transparent',
                border: roleFilter === f.key ? '1px solid rgba(200,169,110,0.45)' : '1px solid var(--border)',
                color: roleFilter === f.key ? 'var(--gold)' : 'var(--text-faint)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              style={{
                flexShrink: 0,
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: 10.5,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                background: statusFilter === s.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: statusFilter === s.key ? '1px solid var(--border-strong)' : '1px solid var(--border)',
                color: statusFilter === s.key ? '#fff' : 'var(--text-faint)',
              }}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={() => setOnlineOnly((v) => !v)}
            style={{
              flexShrink: 0,
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: 10.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: onlineOnly ? 'rgba(34,197,94,0.14)' : 'transparent',
              border: onlineOnly ? '1px solid rgba(34,197,94,0.5)' : '1px solid var(--border)',
              color: onlineOnly ? '#22c55e' : 'var(--text-faint)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: onlineOnly ? '#22c55e' : 'rgba(255,255,255,0.25)' }} /> En ligne{onlineOnly ? ' ✕' : ''}
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
          {users.length} compte{users.length !== 1 ? 's' : ''}
        </p>

        {listLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</p>
        ) : users.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Aucun compte trouvé</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {users.map((u) => {
              const st = statusLabel(u)
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  style={{ ...cardStyle, padding: 12, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', width: '100%', textAlign: 'left' }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: u.role === 'agent' ? 'rgba(200,169,110,0.12)' : 'rgba(255,255,255,0.05)',
                        border: u.role === 'agent' ? '1px solid rgba(200,169,110,0.35)' : '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 700,
                        color: u.role === 'agent' ? 'var(--gold)' : '#fff',
                      }}
                    >
                      {(u.displayName || '?').charAt(0).toUpperCase()}
                    </div>
                    {u.online && <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: '#22c55e', border: '2px solid var(--obsidian)' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.displayName}</p>
                    <p style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(u.role === 'organisateur' || u.role === 'prestataire') && u.displayName !== u.personalName ? `${u.personalName} · ` : ''}
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <Badge label={ROLE_LABEL[u.role]} color={ROLE_COLOR[u.role]} />
                    <Badge label={st.label} color={st.color} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={closeDetail} style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface-2)', borderRadius: '16px 16px 0 0', padding: '18px 20px 32px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--border-strong)', margin: '0 auto 16px' }} />
            {detailLoading || !detail ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: '40px 0' }}>Chargement…</p>
            ) : (
              <DetailPanel
                detail={detail}
                editField={editField}
                setEditField={setEditField}
                editBusy={editBusy}
                onSaveEdit={saveEditField}
                actionBusy={actionBusy}
                confirmDisable={confirmDisable}
                setConfirmDisable={setConfirmDisable}
                onVerifyEmail={handleVerifyEmail}
                onSetDisabled={handleSetDisabled}
              />
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '10px 18px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            border: `1px solid ${toast.kind === 'success' ? 'var(--teal)' : '#e05aaa'}`,
            color: '#fff',
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      )}
    </main>
  )
}

function DetailPanel({
  detail,
  editField,
  setEditField,
  editBusy,
  onSaveEdit,
  actionBusy,
  confirmDisable,
  setConfirmDisable,
  onVerifyEmail,
  onSetDisabled,
}: {
  detail: UserDetail
  editField: { field: 'firstName' | 'lastName' | 'phone'; value: string } | null
  setEditField: (v: { field: 'firstName' | 'lastName' | 'phone'; value: string } | null) => void
  editBusy: boolean
  onSaveEdit: () => void
  actionBusy: boolean
  confirmDisable: boolean
  setConfirmDisable: (v: boolean) => void
  onVerifyEmail: () => void
  onSetDisabled: (disabled: boolean) => void
}) {
  const st = statusLabel(detail)
  const editableFields: { field: 'firstName' | 'lastName' | 'phone'; label: string; current: string }[] = [
    { field: 'firstName', label: 'Prénom', current: detail.firstName },
    { field: 'lastName', label: 'Nom', current: detail.lastName },
    { field: 'phone', label: 'Téléphone', current: detail.phone },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            flexShrink: 0,
            background: 'rgba(78,232,200,0.08)',
            border: '1px solid rgba(78,232,200,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--teal)',
          }}
        >
          {(detail.displayName || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: 0 }}>{detail.displayName}</p>
          {(detail.role === 'organisateur' || detail.role === 'prestataire') && detail.displayName !== detail.personalName && (
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '1px 0 0' }}>{detail.personalName}</p>
          )}
          <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '2px 0 0' }}>{detail.email}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <Badge label={ROLE_LABEL[detail.role]} color={ROLE_COLOR[detail.role]} />
          <Badge label={st.label} color={st.color} />
        </div>
      </div>

      <div>
        <p style={sectionTitleStyle}>Informations</p>
        <InfoRow label="ID" value={detail.id} mono />
        <InfoRow label="Email" value={detail.email} />
        <InfoRow label="Téléphone" value={detail.phone} />
        <InfoRow label="Inscrit le" value={fmtDate(detail.createdAt)} />
        {detail.prestataireTypes.length > 0 && <InfoRow label="Activités" value={detail.prestataireTypes.join(' · ')} />}
      </div>

      <div>
        <p style={sectionTitleStyle}>Connexion</p>
        <InfoRow label="Email vérifié" value={detail.emailVerified ? 'Oui' : 'NON — connexion possible mais compte non vérifié'} />
        <InfoRow label="Connexion" value={detail.disabled ? 'DÉSACTIVÉE (suspendu)' : 'Autorisée'} />
        <InfoRow label="Dernière activité" value={detail.lastSeenAt ? fmtDate(detail.lastSeenAt) : 'Jamais'} />
        {!detail.emailVerified && (
          <button
            disabled={actionBusy}
            onClick={onVerifyEmail}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '10px 0',
              borderRadius: 10,
              cursor: actionBusy ? 'wait' : 'pointer',
              background: 'var(--teal)',
              border: '1px solid var(--border-strong)',
              color: 'var(--obsidian)',
              fontSize: 12,
              fontWeight: 700,
              opacity: actionBusy ? 0.6 : 1,
            }}
          >
            Marquer l&apos;email vérifié
          </button>
        )}
      </div>

      <div>
        <p style={sectionTitleStyle}>Modifier</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {editableFields.map((f) => (
            <div key={f.field}>
              {editField?.field === f.field ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={{ ...inputStyle, flex: 1 }} value={editField.value} onChange={(e) => setEditField({ field: f.field, value: e.target.value })} />
                  <button
                    onClick={onSaveEdit}
                    disabled={editBusy}
                    style={{ padding: '0 14px', borderRadius: 10, cursor: editBusy ? 'wait' : 'pointer', background: 'var(--teal)', border: '1px solid var(--border-strong)', color: 'var(--obsidian)', fontWeight: 700, fontSize: 12.5 }}
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setEditField(null)}
                    disabled={editBusy}
                    style={{ padding: '0 14px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-strong)', color: 'rgba(255,255,255,0.7)', fontSize: 15 }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditField({ field: f.field, value: f.current })}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{f.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.current || '—'}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p style={sectionTitleStyle}>Actions compte</p>
        {detail.superAdmin ? (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Ce compte super-admin est protégé — aucune action de suspension possible.</p>
        ) : detail.disabled ? (
          <button
            onClick={() => onSetDisabled(false)}
            disabled={actionBusy}
            style={{ width: '100%', padding: '12px 0', borderRadius: 10, cursor: actionBusy ? 'wait' : 'pointer', background: 'var(--teal)', border: '1px solid var(--border-strong)', color: 'var(--obsidian)', fontSize: 13, fontWeight: 700 }}
          >
            Réactiver le compte
          </button>
        ) : (
          <>
            <button
              onClick={() => setConfirmDisable(true)}
              disabled={actionBusy}
              style={{ width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer', background: 'rgba(200,169,110,0.14)', border: '1px solid rgba(200,169,110,0.55)', color: 'var(--gold)', fontSize: 13, fontWeight: 700 }}
            >
              Suspendre le compte
            </button>
            {confirmDisable && (
              <ConfirmModal
                title={`Suspendre le compte de ${detail.displayName} ?`}
                color="#c2347f"
                busy={actionBusy}
                onCancel={() => setConfirmDisable(false)}
                onConfirm={() => onSetDisabled(true)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ConfirmModal({ title, color, busy, onCancel, onConfirm }: { title: string; color: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'relative', ...cardStyle, maxWidth: 360, width: '90%', textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 18px' }}>{title}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} disabled={busy} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: color, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}
