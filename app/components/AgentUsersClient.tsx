'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import { Building2, ChevronRight, CircleUserRound, Search, ShieldCheck, SlidersHorizontal, UserRoundCheck, UsersRound, X } from 'lucide-react'
import { Button, Card, Input, Pagination, SkeletonRow, pagedSlice, EmptyState, Modal, SlideOverModal, ToastViewport } from '@/app/components/ui'
import styles from './AgentUsersClient.module.css'

const PAGE_SIZE = 15

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
  organisateur: { color: 'var(--gold)', border: 'rgba(184, 243, 74,0.35)', bg: 'rgba(184, 243, 74,0.14)' },
  prestataire: { color: 'var(--pink)', border: 'rgba(224,90,170,0.35)', bg: 'rgba(224,90,170,0.14)' },
  agent: { color: 'var(--gold)', border: 'rgba(184, 243, 74,0.35)', bg: 'rgba(184, 243, 74,0.14)' },
}

function statusLabel(u: UserSummary): { label: string } & BadgeColors {
  if (u.disabled) return { label: 'DÉSACTIVÉ', color: '#8b8f9c', border: 'rgba(139,143,156,0.35)', bg: 'rgba(139,143,156,0.14)' }
  if (u.status === 'pending') return { label: 'EN ATTENTE', color: 'var(--gold)', border: 'rgba(184, 243, 74,0.35)', bg: 'rgba(184, 243, 74,0.14)' }
  if (u.status === 'rejected') return { label: 'REFUSÉ', color: 'var(--pink)', border: 'rgba(224,90,170,0.35)', bg: 'rgba(224,90,170,0.14)' }
  return { label: 'ACTIF', color: 'var(--primary)', border: 'rgba(184, 243, 74,0.35)', bg: 'rgba(184, 243, 74,0.14)' }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Badge({ label, color, border, bg }: { label: string } & BadgeColors) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color, letterSpacing: '0.04em' }}>
      {label}
    </span>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      <strong style={{ fontFamily: mono ? 'monospace' : undefined }}>{value || '—'}</strong>
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

  const [search, setSearch] = useQueryParamState<string>('q', '')
  const [roleFilter, setRoleFilter] = useQueryParamState<RoleFilter>('role', 'all')
  const [statusFilter, setStatusFilter] = useQueryParamState<StatusFilter>('status', 'all')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [pageParam, setPageParam] = useQueryParamState<string>('page', '1')
  const page = Number(pageParam) || 1
  const setPage = (p: number) => setPageParam(String(p))

  const [userParam, setUserParam] = useQueryParamState<string>('user', '', { push: true })
  const selectedId = userParam || null
  const setSelectedId = useCallback((id: string | null) => setUserParam(id ?? ''), [setUserParam])
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [detailRetry, setDetailRetry] = useState(0)

  const [editField, setEditField] = useState<{ field: EditableField; value: string } | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  const [toast, setToast] = useState<ToastState | null>(null)

  function showToast(message: string, kind: ToastState['kind']) {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }

  const { pageItems, pageCount } = useMemo(() => pagedSlice(users, page, PAGE_SIZE), [users, page])
  const visibleStats = useMemo(() => ({
    total: users.length,
    online: users.filter((user) => user.online).length,
    professionals: users.filter((user) => user.role === 'prestataire' || user.role === 'organisateur').length,
    attention: users.filter((user) => user.disabled || user.status === 'pending' || user.status === 'rejected').length,
  }), [users])

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

  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setDetail(null)
    setDetailError(false)
    setEditField(null)
    setConfirmDisable(false)
  }, [setSelectedId])

  useEffect(() => {
    if (!selectedId) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDetail()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedId, closeDetail])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    async function run() {
      setDetailLoading(true)
      setDetailError(false)
      try {
        const res = await fetch(`/api/agent/users/${selectedId}`)
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setDetail(data.user)
      } catch {
        if (!cancelled) setDetailError(true)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [selectedId, detailRetry])

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
    <main className="lb-dashboard-page lb-agent-screen lb-agent-screen--users">
      <div className={styles.pageStack}>
        {listError && (
          <Card accent="rgba(224,90,170,0.35)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <Button variant="secondary" onClick={loadList} style={{ fontSize: 12.5 }}>
              Recharger
            </Button>
          </Card>
        )}

        <section className={styles.statGrid} aria-label="Aperçu des résultats">
          <Card className={styles.statCard}><span className={styles.statIcon}><UsersRound size={19} /></span><div><strong>{visibleStats.total}</strong><span>Résultats visibles</span></div></Card>
          <Card className={styles.statCard}><span className={`${styles.statIcon} ${styles.onlineIcon}`}><UserRoundCheck size={19} /></span><div><strong>{visibleStats.online}</strong><span>En ligne</span></div></Card>
          <Card className={styles.statCard}><span className={styles.statIcon}><Building2 size={19} /></span><div><strong>{visibleStats.professionals}</strong><span>Profils professionnels</span></div></Card>
          <Card className={`${styles.statCard} ${visibleStats.attention ? styles.attentionCard : ''}`}><span className={styles.statIcon}><ShieldCheck size={19} /></span><div><strong>{visibleStats.attention}</strong><span>À examiner</span></div></Card>
        </section>

        <Card className={styles.controlPanel}>
          <div className={styles.searchBox}>
            <Search size={20} aria-hidden="true" />
            <Input className={styles.searchInput} placeholder="Rechercher un nom, une adresse email ou un téléphone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
            {search ? <Button className={styles.clearSearch} variant="ghost" aria-label="Effacer la recherche" onClick={() => { setSearch(''); setPage(1) }}><X size={14} /></Button> : null}
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}><CircleUserRound size={15} />Type de compte</span>
            <div className={styles.segmented}>{ROLE_FILTERS.map((f) => <Button key={f.key} variant="ghost" className={roleFilter === f.key ? styles.segmentActive : styles.segment} onClick={() => { setRoleFilter(f.key); setPage(1) }}>{f.label}</Button>)}</div>
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}><SlidersHorizontal size={15} />État</span>
            <div className={styles.segmented}>{STATUS_FILTERS.map((s) => <Button key={s.key} variant="ghost" className={statusFilter === s.key ? styles.segmentActive : styles.segment} onClick={() => { setStatusFilter(s.key); setPage(1) }}>{s.label}</Button>)}<Button variant="ghost" className={onlineOnly ? styles.segmentOnline : styles.segment} onClick={() => { setOnlineOnly((value) => !value); setPage(1) }}><i aria-hidden="true" />En ligne</Button></div>
          </div>
        </Card>

        <div className={styles.resultsHeader}><div><h2>Répertoire</h2><span>{users.length} compte{users.length !== 1 ? 's' : ''}</span></div><small>Sélectionnez une ligne pour ouvrir l’inspecteur</small></div>

        {listLoading ? (
          <div className={styles.userList}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} columns={2} />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState title="Aucun compte trouvé" description="Aucun compte ne correspond aux filtres actuels." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pageItems.map((u) => {
              const st = statusLabel(u)
              return (
                <Button
                  key={u.id}
                  variant="ghost"
                  className={styles.userRow}
                  onClick={() => setSelectedId(u.id)}
                >
                  <div className={styles.avatarWrap}>
                    <div className={`${styles.avatar} ${u.role === 'agent' ? styles.agentAvatar : ''}`}>
                      {(u.displayName || '?').charAt(0).toUpperCase()}
                    </div>
                    {u.online && <span className={styles.onlineDot} />}
                  </div>
                  <div className={styles.identity}>
                    <p>{u.displayName}</p>
                    <span>
                      {(u.role === 'organisateur' || u.role === 'prestataire') && u.displayName !== u.personalName ? `${u.personalName} · ` : ''}
                      {u.email}
                    </span>
                  </div>
                  <div className={styles.joined}><span>Inscrit le</span><strong>{fmtDate(u.createdAt)}</strong></div>
                  <div className={styles.rowBadges}>
                    <Badge label={ROLE_LABEL[u.role]} {...ROLE_BADGE[u.role]} />
                    <Badge label={st.label} color={st.color} border={st.border} bg={st.bg} />
                  </div>
                  <ChevronRight className={styles.chevron} size={18} aria-hidden="true" />
                </Button>
              )
            })}
          </div>
        )}

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={users.length} pageSize={PAGE_SIZE} />
      </div>

      {selectedId && (
        <SlideOverModal onClose={closeDetail} maxWidth={540} ariaLabel="Détail du compte">
          <div className={styles.inspectorBody}>
            {detailError ? (
              <Card accent="rgba(224,90,170,0.35)" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Le compte n’existe peut-être plus, ou une erreur serveur est survenue.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" onClick={() => setDetailRetry((n) => n + 1)} style={{ fontSize: 12.5 }}>
                    Réessayer
                  </Button>
                  <Button variant="ghost" onClick={closeDetail} style={{ fontSize: 12.5 }}>
                    Fermer
                  </Button>
                </div>
              </Card>
            ) : detailLoading || !detail ? (
              <div style={{ padding: '20px 0' }}><SkeletonRow columns={1} /></div>
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
        </SlideOverModal>
      )}

      <ToastViewport items={toast ? [{ id: 'comptes', message: toast.message, kind: toast.kind === 'success' ? 'success' : 'error' }] : []} />
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
    <div className={styles.detailContent}>
      <div className={styles.profileHeader}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            flexShrink: 0,
            background: 'rgba(184, 243, 74,0.08)',
            border: '1px solid rgba(184, 243, 74,0.22)',
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

      <section className={styles.inspectorSection}>
        <p className={styles.inspectorTitle}>Informations</p>
        <InfoRow label="ID" value={detail.id} mono />
        <InfoRow label="Email" value={detail.email} />
        <InfoRow label="Téléphone" value={detail.phone} />
        <InfoRow label="Inscrit le" value={fmtDate(detail.createdAt)} />
        {detail.prestataireTypes.length > 0 && <InfoRow label="Activités" value={detail.prestataireTypes.join(' · ')} />}
      </section>

      <section className={styles.inspectorSection}>
        <p className={styles.inspectorTitle}>Connexion et sécurité</p>
        <InfoRow label="Email vérifié" value={detail.emailVerified ? 'Oui' : 'Non — confirmation requise pour un compte client'} />
        <InfoRow label="Connexion" value={detail.disabled ? 'DÉSACTIVÉE (suspendu)' : 'Autorisée'} />
        <InfoRow label="Dernière activité" value={detail.lastSeenAt ? fmtDate(detail.lastSeenAt) : 'Jamais'} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {!detail.emailVerified && (
            <Button
              variant="secondary"
              disabled={actionBusy}
              onClick={onSendVerification}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 3,
                fontWeight: 500,
                background: 'rgba(184, 243, 74,0.12)',
                border: '1px solid rgba(184, 243, 74,0.4)',
                color: 'var(--teal)',
                fontSize: 12,
                textTransform: 'none',
                letterSpacing: 'normal',
              }}
            >
              Envoyer le lien de vérification
            </Button>
          )}
          {!detail.emailVerified && (
            <Button
              variant="primary"
              disabled={actionBusy}
              onClick={onVerifyEmail}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 3,
                fontWeight: 500,
                border: '1px solid var(--border-strong)',
                fontSize: 12,
                textTransform: 'none',
                letterSpacing: 'normal',
              }}
            >
              Marquer l&apos;email vérifié
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={actionBusy}
            onClick={onSendPasswordReset}
            style={{
              width: '100%',
              padding: '10px 0',
              borderRadius: 3,
              fontWeight: 500,
              background: 'transparent',
              fontSize: 12,
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            Envoyer un lien de réinitialisation du mot de passe
          </Button>
        </div>
      </section>

      <section className={styles.inspectorSection}>
        <p className={styles.inspectorTitle}>Coordonnées</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {editableFields.map((f) => (
            <div key={f.field}>
              {editField?.field === f.field ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input type={f.field === 'email' ? 'email' : 'text'} style={{ flex: 1 }} value={editField.value} onChange={(e) => setEditField({ field: f.field, value: e.target.value })} />
                  <Button
                    variant="primary"
                    onClick={onSaveEdit}
                    disabled={editBusy}
                    style={{ padding: '0 14px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 12.5 }}
                  >
                    OK
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setEditField(null)}
                    disabled={editBusy}
                    aria-label="Annuler"
                    style={{ padding: '0 14px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border-strong)', color: 'rgba(255,255,255,0.7)', fontSize: 15 }}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setEditField({ field: f.field, value: f.current })}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: 6,
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{f.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.current || '—'}</span>
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.inspectorSection} ${styles.dangerSection}`}>
        <p className={styles.inspectorTitle}>Contrôle du compte</p>
        {detail.superAdmin ? (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Ce compte super-admin est protégé — aucune action de suspension possible.</p>
        ) : detail.disabled ? (
          <Button
            variant="primary"
            onClick={() => onSetDisabled(false)}
            disabled={actionBusy}
            style={{ width: '100%', padding: '12px 0', borderRadius: 3, fontWeight: 500, border: '1px solid var(--border-strong)', fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}
          >
            Réactiver le compte
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmDisable(true)}
              disabled={actionBusy}
              style={{ width: '100%', padding: '12px 0', borderRadius: 3, fontWeight: 500, background: 'rgba(184, 243, 74,0.14)', border: '1px solid rgba(184, 243, 74,0.55)', color: 'var(--gold)', fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}
            >
              Suspendre le compte
            </Button>
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
      </section>
    </div>
  )
}

function ConfirmModal({ title, color, busy, onCancel, onConfirm }: { title: string; color: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal onClose={onCancel} maxWidth={360} hideClose contentStyle={{ textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 18px' }}>{title}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" onClick={onCancel} disabled={busy} style={{ flex: 1, fontSize: 13 }}>
          Annuler
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy} style={{ flex: 1, background: color, fontSize: 13, borderRadius: 3, fontWeight: 500, textTransform: 'none', letterSpacing: 'normal' }}>
          Confirmer
        </Button>
      </div>
    </Modal>
  )
}
