'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import { Building2, Check, ChevronDown, ChevronRight, CircleUserRound, Search, ShieldCheck, SlidersHorizontal, UserRoundCheck, UsersRound, X } from 'lucide-react'
import { Button, Card, ConfirmDialog, Input, Pagination, SkeletonRow, EmptyState, SlideOverModal, ToastViewport } from '@/app/components/ui'
import styles from './AgentUsersClient.module.css'

const PAGE_SIZE = 25

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
  client: { color: 'var(--muted-chip)', border: 'var(--muted-chip-border)', bg: 'var(--muted-chip-fill)' },
  organisateur: { color: 'var(--gold)', border: 'var(--primary-a35)', bg: 'var(--primary-a14)' },
  prestataire: { color: 'var(--pink)', border: 'var(--danger-border)', bg: 'var(--danger-fill)' },
  agent: { color: 'var(--gold)', border: 'var(--primary-a35)', bg: 'var(--primary-a14)' },
}

function statusLabel(u: UserSummary): { label: string } & BadgeColors {
  if (u.disabled) return { label: 'DÉSACTIVÉ', color: 'var(--muted-chip)', border: 'var(--muted-chip-border)', bg: 'var(--muted-chip-fill)' }
  if (u.status === 'pending') return { label: 'EN ATTENTE', color: 'var(--gold)', border: 'var(--primary-a35)', bg: 'var(--primary-a14)' }
  if (u.status === 'rejected') return { label: 'REFUSÉ', color: 'var(--pink)', border: 'var(--danger-border)', bg: 'var(--danger-fill)' }
  return { label: 'ACTIF', color: 'var(--primary)', border: 'var(--primary-a35)', bg: 'var(--primary-a14)' }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Badge({ label, color, border, bg }: { label: string } & BadgeColors) {
  return (
    <span style={{ fontSize: 'var(--font-size-footnote)', fontWeight: 700, padding: '2px 8px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color, letterSpacing: '0.04em' }}>
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
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [stats, setStats] = useState({ online: 0, professionals: 0, attention: 0 })

  const [search, setSearch] = useQueryParamState<string>('q', '')
  const [roleFilter, setRoleFilter] = useQueryParamState<RoleFilter>('role', 'all')
  const [statusFilter, setStatusFilter] = useQueryParamState<StatusFilter>('status', 'all')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [pageParam, setPageParam] = useQueryParamState<string>('page', '1')
  const page = Number(pageParam) || 1
  const setPage = useCallback((p: number) => setPageParam(String(p)), [setPageParam])

  const [userParam, setUserParam] = useQueryParamState<string>('user', '', { push: true })
  const selectedId = userParam || null
  const setSelectedId = useCallback((id: string | null) => setUserParam(id ?? ''), [setUserParam])
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [detailRetry, setDetailRetry] = useState(0)
  const [reloadVersion, setReloadVersion] = useState(0)

  const [editField, setEditField] = useState<{ field: EditableField; value: string } | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [pendingAccountAction, setPendingAccountAction] = useState<null | 'verifyEmail' | 'sendVerification' | 'sendPasswordReset' | 'enable'>(null)
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
    params.set('page', String(page))
    params.set('pageSize', String(PAGE_SIZE))
    return params.toString()
  }, [search, roleFilter, statusFilter, onlineOnly, page])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setListLoading(true)
      setListError(false)
      try {
        const res = await fetch(`/api/agent/users${queryString ? `?${queryString}` : ''}`)
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) {
          const list = Array.isArray(data.users) ? data.users : []
          setUsers(list)
          setTotalItems(typeof data.total === 'number' ? data.total : 0)
          const safeTotalPages = Math.max(1, typeof data.totalPages === 'number' ? data.totalPages : 1)
          setTotalPages(safeTotalPages)
          if (page > safeTotalPages) {
            setPage(safeTotalPages)
            return
          }
          setStats({
            online: Number(data.stats?.online) || 0,
            professionals: Number(data.stats?.professionals) || 0,
            attention: Number(data.stats?.attention) || 0,
          })
        }
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
  }, [queryString, reloadVersion, page, setPage])

  function triggerReload() {
    setReloadVersion((value) => value + 1)
  }

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
      triggerReload()
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
      triggerReload()
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
      triggerReload()
    } finally {
      setEditBusy(false)
    }
  }

  return (
    <main className="lb-dashboard-page lb-agent-screen lb-agent-screen--users">
      <div className={styles.pageStack}>
        {listError && (
          <Card accent="var(--danger-border)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <Button variant="secondary" onClick={triggerReload} style={{ fontSize: 'var(--font-size-footnote-lg)' }}>
              Recharger
            </Button>
          </Card>
        )}

        <section className={styles.statGrid} aria-label="Aperçu des résultats">
          <Card className={styles.statCard}><span className={styles.statIcon}><UsersRound size={19} /></span><div><strong>{totalItems}</strong><span>Résultats visibles</span></div></Card>
          <Card className={styles.statCard}><span className={`${styles.statIcon} ${styles.onlineIcon}`}><UserRoundCheck size={19} /></span><div><strong>{stats.online}</strong><span>En ligne</span></div></Card>
          <Card className={styles.statCard}><span className={styles.statIcon}><Building2 size={19} /></span><div><strong>{stats.professionals}</strong><span>Profils professionnels</span></div></Card>
          <Card className={`${styles.statCard} ${stats.attention ? styles.attentionCard : ''}`}><span className={styles.statIcon}><ShieldCheck size={19} /></span><div><strong>{stats.attention}</strong><span>À examiner</span></div></Card>
        </section>

        <Card className={styles.controlPanel}>
          <div className={styles.searchBox}>
            <Search size={20} aria-hidden="true" />
            <Input aria-label="Rechercher un compte" className={styles.searchInput} placeholder="Rechercher un nom, une adresse email ou un téléphone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
            {search ? <Button className={styles.clearSearch} variant="ghost" aria-label="Effacer la recherche" onClick={() => { setSearch(''); setPage(1) }}><X size={14} /></Button> : null}
          </div>
          <div className={styles.filterMenuWrap}>
            <Button
              variant="secondary"
              className={styles.filterTrigger}
              aria-haspopup="menu"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((value) => !value)}
              icon={<SlidersHorizontal size={17} aria-hidden="true" />}
            >
              Filtres{roleFilter !== 'all' || statusFilter !== 'all' || onlineOnly ? ' actifs' : ''}
              <ChevronDown size={16} aria-hidden="true" className={filtersOpen ? styles.chevronOpen : ''} />
            </Button>
            {filtersOpen ? (
              <div className={styles.filterDropdown} role="menu" aria-label="Filtres des comptes">
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}><CircleUserRound size={16} aria-hidden="true" />Type de compte</span>
                  {ROLE_FILTERS.map((filter) => (
                    <Button key={filter.key} variant="ghost" className={styles.filterOption} role="menuitemradio" aria-checked={roleFilter === filter.key} onClick={() => { setRoleFilter(filter.key); setPage(1) }}>
                      {filter.label}{roleFilter === filter.key ? <Check size={16} aria-hidden="true" /> : null}
                    </Button>
                  ))}
                </div>
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}><SlidersHorizontal size={16} aria-hidden="true" />État</span>
                  {STATUS_FILTERS.map((filter) => (
                    <Button key={filter.key} variant="ghost" className={styles.filterOption} role="menuitemradio" aria-checked={statusFilter === filter.key} onClick={() => { setStatusFilter(filter.key); setPage(1) }}>
                      {filter.label}{statusFilter === filter.key ? <Check size={16} aria-hidden="true" /> : null}
                    </Button>
                  ))}
                  <Button variant="ghost" className={styles.filterOption} role="menuitemcheckbox" aria-checked={onlineOnly} onClick={() => { setOnlineOnly((value) => !value); setPage(1) }}>
                    En ligne uniquement{onlineOnly ? <Check size={16} aria-hidden="true" /> : null}
                  </Button>
                </div>
                {roleFilter !== 'all' || statusFilter !== 'all' || onlineOnly ? (
                  <Button variant="secondary" className={styles.resetFilters} onClick={() => { setRoleFilter('all'); setStatusFilter('all'); setOnlineOnly(false); setPage(1); setFiltersOpen(false) }}>Réinitialiser</Button>
                ) : null}
              </div>
            ) : null}
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
          <div className={styles.userList}>
            {users.map((u) => {
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

        <Pagination page={page} pageCount={totalPages} onPageChange={setPage} totalItems={totalItems} pageSize={PAGE_SIZE} />
      </div>

      {selectedId && (
        <SlideOverModal onClose={closeDetail} ariaLabel="Détail du compte">
          <div className={styles.inspectorBody}>
            {detailError ? (
              <Card accent="var(--danger-border)" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Le compte n’existe peut-être plus, ou une erreur serveur est survenue.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" onClick={() => setDetailRetry((n) => n + 1)} style={{ fontSize: 'var(--font-size-footnote-lg)' }}>
                    Réessayer
                  </Button>
                  <Button variant="ghost" onClick={closeDetail} style={{ fontSize: 'var(--font-size-footnote-lg)' }}>
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
                pendingAccountAction={pendingAccountAction}
                setConfirmDisable={setConfirmDisable}
                setPendingAccountAction={setPendingAccountAction}
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
  pendingAccountAction,
  setConfirmDisable,
  setPendingAccountAction,
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
  pendingAccountAction: null | 'verifyEmail' | 'sendVerification' | 'sendPasswordReset' | 'enable'
  setConfirmDisable: (v: boolean) => void
  setPendingAccountAction: (v: null | 'verifyEmail' | 'sendVerification' | 'sendPasswordReset' | 'enable') => void
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
            background: 'var(--primary-a08)',
            border: '1px solid var(--primary-a20)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--font-size-title-4)',
            fontWeight: 700,
            color: 'var(--teal)',
          }}
        >
          {(detail.displayName || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 'var(--font-size-title-3)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{detail.displayName}</h2>
          {(detail.role === 'organisateur' || detail.role === 'prestataire') && detail.displayName !== detail.personalName && (
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', margin: '3px 0 0' }}>{detail.personalName}</p>
          )}
          <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)', margin: '3px 0 0', overflowWrap: 'anywhere' }}>{detail.email}</p>
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
              onClick={() => setPendingAccountAction('sendVerification')}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 3,
                fontWeight: 500,
                background: 'var(--primary-a12)',
                border: '1px solid var(--primary-a04)',
                color: 'var(--teal)',
                fontSize: 'var(--font-size-body-sm)',
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
              onClick={() => setPendingAccountAction('verifyEmail')}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 3,
                fontWeight: 500,
                border: '1px solid var(--border-strong)',
                fontSize: 'var(--font-size-body-sm)',
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
            onClick={() => setPendingAccountAction('sendPasswordReset')}
            style={{
              width: '100%',
              padding: '10px 0',
              borderRadius: 3,
              fontWeight: 500,
              background: 'transparent',
              fontSize: 'var(--font-size-body-sm)',
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
                    style={{ padding: '0 14px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 'var(--font-size-footnote-lg)' }}
                  >
                    OK
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setEditField(null)}
                    disabled={editBusy}
                    aria-label="Annuler"
                    style={{ padding: '0 14px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-muted)', fontSize: 'var(--font-size-headline)' }}
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
                  <span style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)' }}>{f.label}</span>
                  <span style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{f.current || '—'}</span>
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.inspectorSection} ${styles.dangerSection}`}>
        <p className={styles.inspectorTitle}>Contrôle du compte</p>
        {detail.superAdmin ? (
          <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', margin: 0 }}>Ce compte super-admin est protégé — aucune action de suspension possible.</p>
        ) : detail.disabled ? (
          <Button
            variant="primary"
            onClick={() => setPendingAccountAction('enable')}
            disabled={actionBusy}
            style={{ width: '100%', padding: '12px 0', borderRadius: 3, fontWeight: 500, border: '1px solid var(--border-strong)', fontSize: 'var(--font-size-callout)', textTransform: 'none', letterSpacing: 'normal' }}
          >
            Réactiver le compte
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmDisable(true)}
              disabled={actionBusy}
              style={{ width: '100%', padding: '12px 0', borderRadius: 3, fontWeight: 500, background: 'var(--primary-a14)', border: '1px solid var(--primary-a55)', color: 'var(--gold)', fontSize: 'var(--font-size-callout)', textTransform: 'none', letterSpacing: 'normal' }}
            >
              Suspendre le compte
            </Button>
            <ConfirmDialog
              open={confirmDisable}
              title={`Suspendre le compte de ${detail.displayName} ?`}
              body="Cette action coupe immédiatement l’accès au compte jusqu’à réactivation."
              confirmDisabled={actionBusy}
              confirmLoading={actionBusy}
              confirmLoadingText="Confirmation…"
              onCancel={() => setConfirmDisable(false)}
              onConfirm={() => onSetDisabled(true)}
            />
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingAccountAction)}
        title={
          pendingAccountAction === 'verifyEmail'
            ? `Marquer l’email de ${detail.displayName} comme vérifié ?`
            : pendingAccountAction === 'sendVerification'
              ? `Renvoyer un lien de vérification à ${detail.displayName} ?`
              : pendingAccountAction === 'sendPasswordReset'
                ? `Envoyer un lien de réinitialisation à ${detail.displayName} ?`
                : `Réactiver le compte de ${detail.displayName} ?`
        }
        body={
          pendingAccountAction === 'verifyEmail'
            ? 'Le compte sera considéré comme vérifié sans nouvelle action de la part de l’utilisateur.'
            : pendingAccountAction === 'sendVerification'
              ? 'Un nouvel e-mail de vérification sera envoyé immédiatement.'
              : pendingAccountAction === 'sendPasswordReset'
                ? 'Un lien de réinitialisation de mot de passe sera envoyé immédiatement.'
                : 'Le compte retrouvera immédiatement son accès.'
        }
        confirmVariant={pendingAccountAction === 'enable' ? 'primary' : 'danger'}
        confirmDisabled={actionBusy}
        confirmLoading={actionBusy}
        confirmLoadingText="Confirmation…"
        onCancel={() => setPendingAccountAction(null)}
        onConfirm={() => {
          const action = pendingAccountAction
          setPendingAccountAction(null)
          if (action === 'verifyEmail') onVerifyEmail()
          else if (action === 'sendVerification') onSendVerification()
          else if (action === 'sendPasswordReset') onSendPasswordReset()
          else onSetDisabled(false)
        }}
      />
    </div>
  )
}
