'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Input, Textarea, Pagination, SkeletonRow, pagedSlice } from '@/app/components/ui'

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
  const [filter, setFilter] = useState<FilterKey>('open')
  const [search, setSearch] = useState('')

  const [page, setPage] = useState(1)

  const [activeId, setActiveId] = useState<string | null>(null)
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
    } finally {
      setBusyId(null)
    }
  }

  const openCount = filter === 'open' ? reports.length : undefined

  return (
    <main className="lb-dashboard-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="font-display lb-dashboard-title">Signalements</h1>
          {openCount ? (
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(224,90,170,0.16)', color: '#e05aaa', fontSize: 12, fontWeight: 700 }}>
              {openCount} à traiter
            </span>
          ) : null}
        </div>

        {listError && (
          <Card style={{ border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <Button variant="secondary" onClick={() => loadList(filter)} style={{ fontSize: 12.5 }}>
              Recharger
            </Button>
          </Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {(
            [
              { key: 'open' as const, label: 'À traiter', color: '#e05aaa' },
              { key: 'handled' as const, label: 'Traités', color: 'var(--teal)' },
            ]
          ).map((f) => {
            const active = f.key === filter
            return (
              <Button
                key={f.key}
                variant="ghost"
                onClick={() => { setFilter(f.key); setPage(1) }}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: `1px solid ${active ? f.color : 'var(--border)'}`,
                  background: active ? `${f.color}22` : 'var(--surface)',
                  textAlign: 'left',
                  display: 'block',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: active ? f.color : 'var(--text-faint)' }}>{counts ? counts[f.key] : '—'}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: active ? f.color : 'var(--text-faint)' }}>{f.label}</div>
              </Button>
            )
          })}
        </div>

        <div style={{ position: 'relative' }}>
          <Input
            style={search ? { paddingRight: 34 } : undefined}
            placeholder="Rechercher (signalé, signalant, motif…)"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
          {search && (
            <Button
              variant="ghost"
              aria-label="Effacer la recherche"
              onClick={() => { setSearch(''); setPage(1) }}
              style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}
            >
              ×
            </Button>
          )}
        </div>

        {listLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} columns={2} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <Card style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>
              {filter === 'open' ? 'Aucun signalement' : 'Aucun signalement traité'}
            </p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pageItems.map((r) => (
              <Card
                key={r.id}
                style={{
                  padding: 18,
                  borderColor: r.handled ? 'var(--border)' : 'rgba(224,90,170,0.28)',
                  borderLeft: r.handled ? '1px solid var(--border)' : '3px solid rgba(224,90,170,0.55)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>
                      {r.targetName} <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>signalé·e</span>
                    </p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>
                      par {r.fromName} · {fmtDateTime(r.createdAt)}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: 4,
                      flexShrink: 0,
                      background: r.handled ? 'rgba(184, 243, 74,0.12)' : 'rgba(224,90,170,0.12)',
                      border: `1px solid ${r.handled ? 'rgba(184, 243, 74,0.35)' : 'rgba(224,90,170,0.35)'}`,
                      fontSize: 10.5,
                      color: r.handled ? 'var(--primary)' : '#e05aaa',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {r.handled ? 'Traité' : 'À traiter'}
                  </span>
                </div>

                <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: r.handled ? 0 : 12 }}>
                  <p style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Motif</p>
                  <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{r.reason || '—'}</p>
                </div>

                {r.handled ? (
                  <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '10px 0 0' }}>
                    Traité par {r.handledBy || '—'} · {r.handledAt ? fmtDateTime(r.handledAt) : ''}
                    {r.handledNote ? <span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)' }}>« {r.handledNote} »</span> : null}
                  </p>
                ) : activeId === r.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Textarea
                      style={{ minHeight: 60 }}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note interne (optionnelle)…"
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActiveId(null)
                          setNote('')
                        }}
                        disabled={busyId === r.id}
                        style={{ flex: 1, padding: '9px 12px', fontSize: 12.5 }}
                      >
                        Annuler
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => handleMark(r.id)}
                        disabled={busyId === r.id}
                        loading={busyId === r.id}
                        loadingText="…"
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 3, fontWeight: 500, background: 'var(--teal-solid)', border: '1px solid rgba(255,255,255,0.14)', color: '#04120e', fontSize: 12.5, textTransform: 'none', letterSpacing: 'normal' }}
                      >
                        Confirmer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => setActiveId(r.id)}
                    style={{ padding: '10px 16px', borderRadius: 3, fontWeight: 500, background: 'var(--teal-solid)', border: '1px solid rgba(255,255,255,0.14)', color: '#04120e', fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}
                  >
                    Marquer comme traité
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={sorted.length} pageSize={PAGE_SIZE} />
      </div>

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
