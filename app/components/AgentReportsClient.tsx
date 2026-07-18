'use client'

import { useEffect, useMemo, useState } from 'react'

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

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 13.5, outline: 'none' }

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

  const [activeId, setActiveId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [toast, setToast] = useState<ToastState | null>(null)

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

  const sorted = useMemo(() => [...reports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [reports])

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
      await loadList(filter)
    } finally {
      setBusyId(null)
    }
  }

  const openCount = filter === 'open' ? reports.length : undefined

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Signalements d&apos;utilisateurs</h1>
          {openCount ? (
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(224,90,170,0.16)', color: '#e05aaa', fontSize: 12, fontWeight: 700 }}>
              {openCount} à traiter
            </span>
          ) : null}
        </div>

        {listError && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <button onClick={() => loadList(filter)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12.5 }}>
              Recharger
            </button>
          </div>
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
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: `1px solid ${active ? f.color : 'var(--border)'}`,
                  background: active ? `${f.color}22` : 'var(--surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: active ? f.color : 'var(--text-faint)' }}>{f.label}</div>
              </button>
            )
          })}
        </div>

        {listLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</p>
        ) : sorted.length === 0 ? (
          <div style={{ ...cardStyle, padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>
              {filter === 'open' ? 'Aucun signalement' : 'Aucun signalement traité'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sorted.map((r) => (
              <div
                key={r.id}
                style={{
                  ...cardStyle,
                  padding: 18,
                  borderColor: r.handled ? 'var(--border)' : 'rgba(224,90,170,0.28)',
                  borderLeft: r.handled ? cardStyle.border as string : '3px solid rgba(224,90,170,0.55)',
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
                      background: r.handled ? 'rgba(62,214,181,0.12)' : 'rgba(224,90,170,0.12)',
                      border: `1px solid ${r.handled ? 'rgba(62,214,181,0.35)' : 'rgba(224,90,170,0.35)'}`,
                      fontSize: 10.5,
                      color: r.handled ? 'var(--teal)' : '#e05aaa',
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
                    <textarea
                      style={{ ...inputStyle, minHeight: 60 }}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note interne (optionnelle)…"
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          setActiveId(null)
                          setNote('')
                        }}
                        disabled={busyId === r.id}
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12.5 }}
                      >
                        Annuler
                      </button>
                      <button
                        onClick={() => handleMark(r.id)}
                        disabled={busyId === r.id}
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 10, cursor: busyId === r.id ? 'wait' : 'pointer', background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)', color: '#04120e', fontSize: 12.5, fontWeight: 700, opacity: busyId === r.id ? 0.6 : 1 }}
                      >
                        {busyId === r.id ? '…' : 'Confirmer'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveId(r.id)}
                    style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer', background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)', color: '#04120e', fontSize: 12, fontWeight: 700 }}
                  >
                    Marquer comme traité
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
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
