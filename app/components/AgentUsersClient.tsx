'use client'

import { useEffect, useMemo, useState } from 'react'

// Port de la section « Comptes » (tab === 'users') de src/pages/AgentPage.jsx
// (#9 phase agent/admin) — recherche + filtres rôle/statut/en ligne, panneau
// de détail slide-up, actions serveur (suspendre/réactiver, vérifier l'email,
// renvoyer les emails de sécurité, éditer les coordonnées). Voir
// lib/server/agentUsers.ts pour la logique serveur et lib/server/agentGuard.ts
// pour la garde d'accès (déjà vérifiée par la page serveur qui monte ce
// composant).
//
// Différences volontaires avec le legacy :
// - Pas de « Supprimer le compte » — la suppression complète est un panneau
//   agent séparé (#104), avec sa propre revue des demandes RGPD.

type Role = 'client' | 'organisateur' | 'prestataire' | 'agent'
type AccountStatus = 'active' | 'pending' | 'rejected'
type StatusFilter = AccountStatus | 'disabled' | 'all'
type RoleFilter = Role | 'all'
type EditableField = 'firstName' | 'lastName' | 'phone' | 'email'

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

// Bordure/fond précalculés (plutôt que `${color}55`/`${color}22` en template
// string) : les couleurs en `var(--*)` ne supportent pas la concaténation
// d'un canal alpha hexadécimal — ça produit une chaîne CSS invalide et le
// badge perd silencieusement sa pastille/bordure (voir Badge() ci-dessous).
interface BadgeColors {
  color: string
  border: string
  bg: string
}
const ROLE_BADGE: Record<Role, BadgeColors> = {
  client: { color: '#8b8f9c', border: 'rgba(139,143,156,0.35)', bg: 'rgba(139,143,156,0.14)' },
  organisateur: { color: 'var(--gold)', border: 'rgba(200,169,110,0.35)', bg: 'rgba(200,169,110,0.14)' },
  prestataire: { color: '#e05aaa', border: 'rgba(224,90,170,0.35)', bg: 'rgba(224,90,170,0.14)' },
  agent: { color: 'var(--gold)', border: 'rgba(200,169,110,0.35)', bg: 'rgba(200,169,110,0.14)' },
}

function statusLabel(u: UserSummary): { label: string } & BadgeColors {
  if (u.disabled) return { label: 'DÉSACTIVÉ', color: '#8b8f9c', border: 'rgba(139,143,156,0.35)', bg: 'rgba(139,143,156,0.14)' }
  if (u.status === 'pending') return { label: 'EN ATTENTE', color: 'var(--gold)', border: 'rgba(200,169,110,0.35)', bg: 'rgba(200,169,110,0.14)' }
  if (u.status === 'rejected') return { label: 'REFUSÉ', color: '#e05aaa', border: 'rgba(224,90,170,0.35)', bg: 'rgba(224,90,170,0.14)' }
  return { label: 'ACTIF', color: 'var(--teal)', border: 'rgba(78,232,200,0.35)', bg: 'rgba(78,232,200,0.14)' }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 13.5, outline: 'none' }
const sectionTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', margin: '0 0 10px' }

function Badge({ label, color, border, bg }: { label: string } & BadgeColors) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color, letterSpacing: '0.04em' }}>
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

  const [editField, setEditField] = useState<{ field: EditableField; value: string } | null>(null)
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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDetail()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

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

  async function handleSendAccountEmail(kind: 'verification' | 'password-reset') {
    if (!detail) return
    setActionBusy(true)
    try {
      const endpoint = kind === 'verification' ? 'send-verification' : 'send-password-reset'
      const res = await fetch(`/api/agent/users/${detail.id}/${endpoint}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        const message =
          data.error === 'rate_limited'
            ? 'Trop d’envois rapprochés. Réessaie dans quelques minutes.'
            : data.error === 'already_verified'
              ? 'Cette adresse est déjà vérifiée.'
              : 'L’email n’a pas pu être envoyé. Vérifie la configuration du service email.'
        showToast(message, 'error')
        return
      }
      showToast(
        kind === 'verification'
          ? `Lien de vérification envoyé à ${data.sentTo}`
          : `Lien de réinitialisation envoyé à ${data.sentTo}`,
        'success'
      )
    } catch {
      showToast('L’email n’a pas pu être envoyé. Réessaie.', 'error')
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
        const message =
          data.error === 'email_taken'
            ? 'Cette adresse email est déjà utilisée.'
            : data.error === 'same_email'
              ? 'Cette adresse est déjà celle du compte.'
              : data.error === 'protected_account'
                ? 'Ce compte super-admin est protégé.'
                : 'Échec de l’enregistrement — réessaie.'
        showToast(message, 'error')
        return
      }
      setDetail(data.user)
      setEditField(null)
      showToast(
        editField.field === 'email'
          ? 'Adresse modifiée. Le compte doit maintenant confirmer ce nouvel email.'
          : 'Modification enregistrée',
        'success'
      )
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

        <div style={{ position: 'relative' }}>
          <input style={{ ...inputStyle, ...(search ? { paddingRight: 34 } : null) }} placeholder="Nom, email, téléphone…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setSearch('')}
              style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ×
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setRoleFilter(f.key)}
              style={{
                flexShrink: 0,
                padding: '4px 10px',
                borderRadius: 999,
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
                borderRadius: 999,
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
              borderRadius: 999,
              fontSize: 10.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: onlineOnly ? 'rgba(78,232,200,0.14)' : 'transparent',
              border: onlineOnly ? '1px solid rgba(78,232,200,0.5)' : '1px solid var(--border)',
              color: onlineOnly ? 'var(--teal)' : 'var(--text-faint)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: onlineOnly ? 'var(--teal)' : 'rgba(255,255,255,0.25)' }} />
            En ligne
            {onlineOnly && <span style={{ marginLeft: 2, opacity: 0.75 }}>✕</span>}
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
                    {u.online && <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: 'var(--teal)', border: '2px solid var(--obsidian)' }} />}
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
                    <Badge label={ROLE_LABEL[u.role]} {...ROLE_BADGE[u.role]} />
                    <Badge label={st.label} color={st.color} border={st.border} bg={st.bg} />
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
                onSendVerification={() => handleSendAccountEmail('verification')}
                onSendPasswordReset={() => handleSendAccountEmail('password-reset')}
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
  onSendVerification,
  onSendPasswordReset,
  onSetDisabled,
}: {
  detail: UserDetail
  editField: { field: EditableField; value: string } | null
  setEditField: (v: { field: EditableField; value: string } | null) => void
  editBusy: boolean
  onSaveEdit: () => void
  actionBusy: boolean
  confirmDisable: boolean
  setConfirmDisable: (v: boolean) => void
  onVerifyEmail: () => void
  onSendVerification: () => void
  onSendPasswordReset: () => void
  onSetDisabled: (disabled: boolean) => void
}) {
  const st = statusLabel(detail)
  const editableFields: { field: EditableField; label: string; current: string }[] = [
    { field: 'firstName', label: 'Prénom', current: detail.firstName },
    { field: 'lastName', label: 'Nom', current: detail.lastName },
    { field: 'phone', label: 'Téléphone', current: detail.phone },
    ...(!detail.superAdmin ? [{ field: 'email' as const, label: 'Email de connexion', current: detail.email }] : []),
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
          <Badge label={ROLE_LABEL[detail.role]} {...ROLE_BADGE[detail.role]} />
          <Badge label={st.label} color={st.color} border={st.border} bg={st.bg} />
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
        <InfoRow label="Email vérifié" value={detail.emailVerified ? 'Oui' : 'Non — confirmation requise pour un compte client'} />
        <InfoRow label="Connexion" value={detail.disabled ? 'DÉSACTIVÉE (suspendu)' : 'Autorisée'} />
        <InfoRow label="Dernière activité" value={detail.lastSeenAt ? fmtDate(detail.lastSeenAt) : 'Jamais'} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {!detail.emailVerified && (
            <button
              disabled={actionBusy}
              onClick={onSendVerification}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 10,
                cursor: actionBusy ? 'wait' : 'pointer',
                background: 'rgba(78,232,200,0.12)',
                border: '1px solid rgba(78,232,200,0.4)',
                color: 'var(--teal)',
                fontSize: 12,
                fontWeight: 700,
                opacity: actionBusy ? 0.6 : 1,
              }}
            >
              Envoyer le lien de vérification
            </button>
          )}
          {!detail.emailVerified && (
            <button
              disabled={actionBusy}
              onClick={onVerifyEmail}
              style={{
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
          <button
            disabled={actionBusy}
            onClick={onSendPasswordReset}
            style={{
              width: '100%',
              padding: '10px 0',
              borderRadius: 10,
              cursor: actionBusy ? 'wait' : 'pointer',
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              opacity: actionBusy ? 0.6 : 1,
            }}
          >
            Envoyer un lien de réinitialisation du mot de passe
          </button>
        </div>
      </div>

      <div>
        <p style={sectionTitleStyle}>Modifier</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {editableFields.map((f) => (
            <div key={f.field}>
              {editField?.field === f.field ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type={f.field === 'email' ? 'email' : 'text'} style={{ ...inputStyle, flex: 1 }} value={editField.value} onChange={(e) => setEditField({ field: f.field, value: e.target.value })} />
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
                    aria-label="Annuler"
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
                color="var(--pink)"
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
