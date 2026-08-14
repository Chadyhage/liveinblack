'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, MessageSquareWarning, RefreshCw, Search, UserRound } from 'lucide-react'
import { Button, Card, Input, Textarea, Pagination, SkeletonRow, pagedSlice, EmptyState, ToastViewport } from '@/app/components/ui'
import { useQueryParamState, useSetQueryParams } from '@/lib/client/useQueryParamState'
import styles from './AgentReportsClient.module.css'

const PAGE_SIZE = 15

// Port de la section « Signalements » de src/pages/AgentPage.jsx (#9 phase
// agent/admin, tâche #103) — file de signalements d'utilisateurs. Voir
// lib/server/agentReports.ts pour la logique serveur et lib/models/Report.ts
// pour le schéma. Legacy (resolveReport) n'a qu'une seule action, sans note
// ; le champ de note interne optionnel ci-dessous est un ajout du port
// (handledNote côté serveur), jamais présent dans la queue legacy.

interface ReportItem {
  id: string
  fromId: string
  fromName: string
  targetId: string
  targetName: string
  reason: string
  handled: boolean
  handledAt: string | null
  handledBy: string
  handledNote: string
  createdAt: string
}

type FilterKey = 'open' | 'handled'

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

interface ToastState {
  message: string
  kind: 'success' | 'error'
}

export default function AgentReportsClient() {
  const [reports, setReports] = useState<ReportItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [filter] = useQueryParamState<FilterKey>('filter', 'open')
  const [search] = useQueryParamState<string>('q', '')

  const [pageParam, setPageParam] = useQueryParamState<string>('page', '1')
  const page = Number(pageParam)
  const setPage = (n: number) => setPageParam(String(n))
  // Filtre/recherche + reset de page doivent être écrits dans l'URL en une
  // seule fois (voir useSetQueryParams) — deux setValue() successifs
  // écrasent l'un l'autre.
  const setQueryParams = useSetQueryParams()

  const [activeIdParam, setActiveIdParam] = useQueryParamState<string>('report', '', { push: true })
  const activeId = activeIdParam || null
  const setActiveId = (id: string | null) => setActiveIdParam(id ?? '')
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [toast, setToast] = useState<ToastState | null>(null)

  // Comptes des deux tuiles de filtre — chargés indépendamment de la liste
  // affichée (qui ne couvre que le filtre actif) pour que les deux tuiles
  // affichent un chiffre, comme Dossiers/Paiements.
  const [counts, setCounts] = useState<{ open: number; handled: number } | null>(null)

  async function loadCounts() {
    try {
      const [openRes, handledRes] = await Promise.all([fetch('/api/agent/reports?status=open'), fetch('/api/agent/reports?status=handled')])
      const [openData, handledData] = await Promise.all([openRes.json(), handledRes.json()])
      if (openRes.ok && openData.ok && handledRes.ok && handledData.ok) {
        setCounts({ open: (openData.reports as unknown[]).length, handled: (handledData.reports as unknown[]).length })
      }
    } catch {
      // Comptes non-critiques — les tuiles restent alors sans chiffre.
    }
  }

  function showToast(message: string, kind: ToastState['kind']) {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadList(status: FilterKey) {
    setListLoading(true)
    setListError(false)
    try {
      const res = await fetch(`/api/agent/reports?status=${status}`)
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('load_failed')
      setReports(data.reports)
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
        const res = await fetch(`/api/agent/reports?status=${filter}`)
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setReports(data.reports)
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
  }, [filter])

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const [openRes, handledRes] = await Promise.all([fetch('/api/agent/reports?status=open'), fetch('/api/agent/reports?status=handled')])
        const [openData, handledData] = await Promise.all([openRes.json(), handledRes.json()])
        if (!cancelled && openRes.ok && openData.ok && handledRes.ok && handledData.ok) {
          setCounts({ open: (openData.reports as unknown[]).length, handled: (handledData.reports as unknown[]).length })
        }
      } catch {
        // idem
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const sorted = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = term
      ? reports.filter((r) => r.targetName.toLowerCase().includes(term) || r.fromName.toLowerCase().includes(term) || r.reason.toLowerCase().includes(term))
      : reports
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [reports, search])

  const { pageItems, pageCount } = useMemo(() => pagedSlice(sorted, page, PAGE_SIZE), [sorted, page])

  async function handleMark(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/agent/reports/${id}/handle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        showToast('Échec serveur — signalement non mis à jour. Réessaie.', 'error')
        return
      }
      showToast('Signalement marqué comme traité', 'success')
      setActiveId(null)
      setNote('')
      await Promise.all([loadList(filter), loadCounts()])
    } catch {
      showToast('Connexion impossible — réessaie.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const totalCount = counts ? counts.open + counts.handled : reports.length

  return (
    <main className={`lb-dashboard-page lb-agent-screen lb-agent-screen--reports ${styles.page}`}>
      <div className={styles.stack}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" icon={<RefreshCw size={17} aria-hidden="true" />} onClick={() => Promise.all([loadList(filter), loadCounts()])} loading={listLoading} loadingText="Actualisation…" className={styles.refresh}>Actualiser</Button>
        </div>

        {listError && (
          <Card accent="rgba(224,90,170,.35)" className={styles.error} role="alert">
            <div className={styles.errorCopy}><AlertTriangle size={20} aria-hidden="true" /><div><strong>Impossible de charger les signalements</strong><p>Vérifie ta connexion ou reconnecte-toi si tes droits agent ont changé.</p></div></div>
            <Button variant="secondary" onClick={() => loadList(filter)}>Réessayer</Button>
          </Card>
        )}

        <div className={styles.metrics} aria-label="Filtrer les signalements">
          <Card className={styles.metric} style={{ '--metric-color': '#c4a7ff' } as React.CSSProperties}>
            <span className={styles.metricTop}><span className={styles.metricIcon}><MessageSquareWarning size={18} aria-hidden="true" /></span><strong className={styles.metricValue}>{totalCount}</strong></span>
            <span className={styles.metricLabel}>Tous les signalements</span>
          </Card>
          {(
            [
              { key: 'open' as const, label: 'À traiter', color: '#ff8fb2', count: counts?.open ?? (filter === 'open' ? reports.length : 0), icon: Clock3 },
              { key: 'handled' as const, label: 'Traités', color: '#48c9b0', count: counts?.handled ?? (filter === 'handled' ? reports.length : 0), icon: CheckCircle2 },
            ]
          ).map((f) => {
            const active = f.key === filter
            const Icon = f.icon
            return (
              <Button
                key={f.key}
                variant="ghost"
                className={`${styles.metric}${active ? ` ${styles.metricActive}` : ''}`}
                onClick={() => setQueryParams({ filter: f.key === 'open' ? null : f.key, page: null })}
                aria-pressed={active}
                style={{ '--metric-color': f.color } as React.CSSProperties}
              >
                <span className={styles.metricTop}><span className={styles.metricIcon}><Icon size={18} aria-hidden="true" /></span><strong className={styles.metricValue}>{f.count}</strong></span>
                <span className={styles.metricLabel}>{f.label}</span>
              </Button>
            )
          })}
        </div>

        <div className={styles.controls}>
          <div className={styles.search}><Search size={18} aria-hidden="true" /><Input type="search" aria-label="Rechercher un signalement" placeholder="Personne signalée, auteur ou motif…" value={search} onChange={(e) => setQueryParams({ q: e.target.value === '' ? null : e.target.value, page: null })} /></div>
          <span className={styles.resultCount}>{sorted.length} résultat{sorted.length === 1 ? '' : 's'}</span>
          {search && <Button variant="ghost" onClick={() => setQueryParams({ q: null, page: null })}>Effacer</Button>}
        </div>

        <div className={styles.listHeader}><div><h2>{filter === 'open' ? 'Signalements à traiter' : 'Signalements traités'}</h2><p>Les alertes les plus récentes apparaissent en premier.</p></div></div>

        {listLoading ? (
          <div className={styles.loadingGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} columns={2} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            title={filter === 'open' ? 'Aucun signalement' : 'Aucun signalement traité'}
            description={filter === 'open' ? 'Aucun signalement n’est en attente de traitement.' : 'Aucun signalement n’a encore été traité.'}
          />
        ) : (
          <div className={styles.grid}>
            {pageItems.map((r) => (
              <Card key={r.id} className={`${styles.reportCard}${r.handled ? '' : ` ${styles.reportOpen}`}`}>
                <div className={styles.cardTop}>
                  <div className={styles.people}><span className={styles.avatar}><UserRound size={20} aria-hidden="true" /></span><div className={styles.peopleCopy}><strong>{r.targetName}</strong><span>Personne signalée</span></div></div>
                  <span className={`${styles.status} ${r.handled ? styles.statusHandled : styles.statusOpen}`}>{r.handled ? <CheckCircle2 size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}{r.handled ? 'Traité' : 'À traiter'}</span>
                </div>

                <div className={styles.meta}><div className={styles.metaItem}><UserRound size={16} aria-hidden="true" /><span>Signalé par {r.fromName}</span></div><div className={styles.metaItem}><Clock3 size={16} aria-hidden="true" /><span>{fmtDateTime(r.createdAt)}</span></div></div>

                <div className={styles.reason}><p className={styles.reasonLabel}><MessageSquareWarning size={14} aria-hidden="true" /> Motif</p><p className={styles.reasonText}>{r.reason || 'Aucun motif renseigné.'}</p></div>

                {r.handled ? (
                  <div className={styles.handledBox}><strong>Traité par {r.handledBy || '—'}{r.handledAt ? ` · ${fmtDateTime(r.handledAt)}` : ''}</strong>{r.handledNote ? <p>« {r.handledNote} »</p> : <p>Aucune note interne ajoutée.</p>}</div>
                ) : activeId === r.id ? (
                  <div className={styles.reviewBox}>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note interne sur la décision (optionnelle)…" />
                    <div className={styles.reviewActions}>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActiveId(null)
                          setNote('')
                        }}
                        disabled={busyId === r.id}
                      >
                        Annuler
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => handleMark(r.id)}
                        disabled={busyId === r.id}
                        loading={busyId === r.id}
                        loadingText="…"
                      >
                        Confirmer le traitement
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="primary" icon={<CheckCircle2 size={16} aria-hidden="true" />} className={styles.markButton} onClick={() => { setActiveId(r.id); setNote(r.handledNote || '') }}>
                    Marquer comme traité
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={sorted.length} pageSize={PAGE_SIZE} />
      </div>

      <ToastViewport items={toast ? [{ id: 'signalements', message: toast.message, kind: toast.kind === 'success' ? 'success' : 'error' }] : []} />
    </main>
  )
}
