'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import { Avatar, Button, Card, Input, Textarea, Label, Pagination, SkeletonRow, pagedSlice } from '@/app/components/ui'

const PAGE_SIZE = 15

// Port de la section « Suppressions » de src/pages/AgentPage.jsx (tab ===
// 'suppressions', #9 phase agent/admin, tâche #104) — file des demandes de
// suppression de compte nécessitant une revue agent (organisateur/prestataire
// avec dossier approuvé, voir lib/server/agentDeletion.ts:createDeletionRequest),
// détail avec blocages/avertissements recalculés à la volée, et purge
// irréversible derrière une confirmation dédiée. Un compte `client` simple
// s'auto-supprime ailleurs, sans jamais transiter par cette file (voir
// app/api/profil/supprimer-compte, hors périmètre de ce composant).
//
// Différence volontaire avec le legacy : les « points signalés » ne sont pas
// un simple texte informatif — un blocage (`blockers`) DÉSACTIVE le bouton
// « Approuver la suppression » (le serveur le referuserait de toute façon,
// recalculé au moment de l'approbation ; l'UI l'anticipe pour ne pas faire
// remplir une note pour rien).

interface DeletionRequestSummary {
  id: string
  userId: string
  userName: string
  userEmail: string
  userRole: string
  reason: string
  requestedAt: string
  status: 'pending' | 'approved' | 'rejected'
}

interface AuditItem {
  type: string
  label: string
}

interface DeletionRequestDetail extends DeletionRequestSummary {
  audit: { blockers: AuditItem[]; warnings: AuditItem[] }
}

interface ToastState {
  message: string
  kind: 'success' | 'error'
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }
const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '3.2px', color: 'var(--teal)', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 10px' }

const ROLE_LABEL: Record<string, string> = { organisateur: 'Organisateur', prestataire: 'Prestataire', client: 'Client', agent: 'Agent' }

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function AgentDeletionClient() {
  const [requests, setRequests] = useState<DeletionRequestSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [search, setSearch] = useQueryParamState<string>('q', '')
  const [pageParam, setPageParam] = useQueryParamState<string>('page', '1')
  const page = Number(pageParam) || 1
  const setPage = (p: number) => setPageParam(String(p))

  const [requestParam, setRequestParam] = useQueryParamState<string>('request', '', { push: true })
  const selectedId = requestParam || null
  const setSelectedId = (id: string | null) => setRequestParam(id ?? '')
  const [detail, setDetail] = useState<DeletionRequestDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [detailRetry, setDetailRetry] = useState(0)

  const [rejectNote, setRejectNote] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  const [toast, setToast] = useState<ToastState | null>(null)

  function showToast(message: string, kind: ToastState['kind']) {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadList() {
    setListLoading(true)
    setListError(false)
    try {
      const res = await fetch('/api/agent/deletion-requests')
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('load_failed')
      setRequests(data.requests)
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
        const res = await fetch('/api/agent/deletion-requests')
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setRequests(data.requests)
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
  }, [])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    async function run() {
      setDetailLoading(true)
      setDetailError(false)
      try {
        const res = await fetch(`/api/agent/deletion-requests/${selectedId}`)
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setDetail(data.request)
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

  function closeDetail() {
    setSelectedId(null)
    setDetail(null)
    setDetailError(false)
    setRejectNote('')
    setConfirmApprove(false)
  }

  useEffect(() => {
    if (!selectedId) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDetail()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  const term = search.trim().toLowerCase()
  const filtered = term
    ? requests.filter((r) => r.userName.toLowerCase().includes(term) || r.userEmail.toLowerCase().includes(term) || r.reason.toLowerCase().includes(term))
    : requests

  const { pageItems, pageCount } = useMemo(() => pagedSlice(filtered, page, PAGE_SIZE), [filtered, page])

  async function handleApprove() {
    if (!detail) return
    setActionBusy(true)
    try {
      const res = await fetch(`/api/agent/deletion-requests/${detail.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        showToast(data.error === 'deletion_blocked' ? 'Blocages détectés — impossible d’approuver, recharge le dossier.' : 'Échec serveur — compte non supprimé. Réessaie.', 'error')
        return
      }
      showToast('Compte supprimé et anonymisé', 'success')
      closeDetail()
      await loadList()
    } finally {
      setActionBusy(false)
      setConfirmApprove(false)
    }
  }

  async function handleReject() {
    if (!detail) return
    setRejecting(true)
    try {
      const res = await fetch(`/api/agent/deletion-requests/${detail.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: rejectNote }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        showToast('Échec serveur — demande non refusée. Réessaie.', 'error')
        return
      }
      showToast('Demande refusée', 'success')
      closeDetail()
      await loadList()
    } finally {
      setRejecting(false)
    }
  }

  return (
    <main className="lb-dashboard-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="font-display lb-dashboard-title">Suppressions</h1>
          {requests.length > 0 && (
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(224,90,170,0.16)', color: '#e05aaa', fontSize: 12, fontWeight: 700 }}>{requests.length} en attente</span>
          )}
        </div>

        {listError && (
          <Card style={{ border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <Button variant="secondary" onClick={loadList} style={{ fontSize: 12.5 }}>
              Recharger
            </Button>
          </Card>
        )}

        {requests.length > 0 && <Input placeholder="Rechercher par nom, email, raison…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />}

        {listLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} columns={2} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{search ? 'Aucun résultat' : 'Aucune demande en attente'}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{search ? `Aucune demande ne correspond à « ${search} ».` : 'Aucun compte n’a demandé sa suppression pour le moment.'}</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pageItems.map((r) => (
              <RequestCard key={r.id} request={r} onClick={() => setSelectedId(r.id)} />
            ))}
          </div>
        )}

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
      </div>

      {selectedId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={closeDetail} style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface-2)', borderRadius: '16px 16px 0 0', padding: '18px 20px 32px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--border-strong)', margin: '0 auto 16px' }} />
            {detailError ? (
              <Card style={{ border: '1px solid rgba(224,90,170,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. La demande n’existe peut-être plus, ou une erreur serveur est survenue.</p>
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
              <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: '40px 0' }}>Chargement…</p>
            ) : (
              <DetailPanel
                detail={detail}
                rejectNote={rejectNote}
                setRejectNote={setRejectNote}
                rejecting={rejecting}
                confirmApprove={confirmApprove}
                setConfirmApprove={setConfirmApprove}
                actionBusy={actionBusy}
                onApprove={handleApprove}
                onReject={handleReject}
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

function RequestCard({ request, onClick }: { request: DeletionRequestSummary; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', borderLeft: '3px solid var(--pink)' }}
    >
      <Avatar src={null} name={request.userName || request.userEmail || '?'} size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{request.userName || request.userEmail}</span>
          <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 6, background: 'rgba(224,90,170,0.14)', color: 'var(--pink)' }}>{ROLE_LABEL[request.userRole] || request.userRole || '—'}</span>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>
          {request.userEmail} · Demandé le {fmtDateTime(request.requestedAt)}
        </p>
        {request.reason && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>« {request.reason} »</p>
        )}
      </div>
    </Button>
  )
}

function DetailPanel({
  detail,
  rejectNote,
  setRejectNote,
  rejecting,
  confirmApprove,
  setConfirmApprove,
  actionBusy,
  onApprove,
  onReject,
}: {
  detail: DeletionRequestDetail
  rejectNote: string
  setRejectNote: (v: string) => void
  rejecting: boolean
  confirmApprove: boolean
  setConfirmApprove: (v: boolean) => void
  actionBusy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const hasBlockers = detail.audit.blockers.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: '#fff', margin: 0 }}>{detail.userName || detail.userEmail}</h2>
          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(224,90,170,0.16)', color: 'var(--pink)', fontWeight: 700 }}>En attente</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '4px 0 0' }}>
          {detail.userEmail} · {ROLE_LABEL[detail.userRole] || detail.userRole || '—'} · Demandé le {fmtDateTime(detail.requestedAt)}
        </p>
      </div>

      <div>
        <p style={sectionTitleStyle}>Raison invoquée</p>
        <p style={{ fontSize: 13.5, color: '#fff', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detail.reason || '—'}</p>
      </div>

      {hasBlockers && (
        <div style={{ padding: '12px 14px', background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.28)', borderRadius: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 400, color: 'var(--pink)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 8px' }}>Bloque l’approbation</p>
          {detail.audit.blockers.map((b, i) => (
            <p key={i} style={{ fontSize: 12.5, color: 'rgba(224,90,170,0.9)', margin: '0 0 5px', lineHeight: 1.5 }}>
              • {b.label}
            </p>
          ))}
        </div>
      )}

      {detail.audit.warnings.length > 0 && (
        <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 400, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 8px' }}>Ce qui se passera à l’approbation</p>
          {detail.audit.warnings.map((w, i) => (
            <p key={i} style={{ fontSize: 12.5, color: 'rgba(245,158,11,0.85)', margin: '0 0 5px', lineHeight: 1.5 }}>
              • {w.label}
            </p>
          ))}
        </div>
      )}

      <div>
        <p style={sectionTitleStyle}>Actions</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button
            variant="danger"
            fullWidth
            onClick={() => setConfirmApprove(true)}
            disabled={actionBusy || rejecting || hasBlockers}
            title={hasBlockers ? 'Résous les blocages ci-dessus avant d’approuver.' : undefined}
            style={{
              borderRadius: 3,
              fontWeight: 500,
              fontSize: 13,
              textTransform: 'none',
              letterSpacing: 'normal',
              background: '#c2347f',
              opacity: hasBlockers ? 0.45 : 1,
            }}
          >
            Approuver la suppression (irréversible)
          </Button>

          <Label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: -2 }}>Note pour l&apos;utilisateur (optionnel, visible si refusé)</Label>
          <Textarea
            style={{ minHeight: 60 }}
            placeholder="Ex : merci de préciser la raison de ta demande…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            disabled={actionBusy || rejecting}
          />
          <Button
            variant="secondary"
            fullWidth
            onClick={onReject}
            disabled={actionBusy || rejecting}
            loading={rejecting}
            loadingText="…"
            style={{ borderRadius: 10, fontSize: 13, fontWeight: 600 }}
          >
            Refuser la demande
          </Button>
        </div>
      </div>

      {confirmApprove && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => !actionBusy && setConfirmApprove(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.8)', backdropFilter: 'blur(8px)' }} />
          <Card style={{ position: 'relative', maxWidth: 380, width: '90%', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Supprimer définitivement le compte de {detail.userName || detail.userEmail} ?</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.6 }}>
              Ses données personnelles seront anonymisées, sa vitrine publique retirée, et son compte définitivement inaccessible. Les billets, commandes et avis restent archivés (obligation légale). Action irréversible.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => setConfirmApprove(false)}
                disabled={actionBusy}
                style={{ flex: 1, borderRadius: 8, fontSize: 13 }}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={onApprove}
                disabled={actionBusy}
                loading={actionBusy}
                loadingText="…"
                style={{ flex: 1, borderRadius: 3, fontWeight: 500, background: '#c2347f', fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}
              >
                Confirmer la suppression
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
